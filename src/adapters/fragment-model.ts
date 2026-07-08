import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import YAML from "yaml";
import { validateClusterContext, type ClusterContext } from "../cluster-context/schema.js";
import {
  normalizeImageLock,
  resolveRouteAuthMode,
  validateDeploymentSemantics,
  type DeploymentV2,
} from "../deployment/v2-model.js";

export type FragmentInput = {
  deployment: DeploymentV2;
  deploymentDigest: string;
  environment: string;
  images: Record<string, string>;
  imagesDigest: string;
  context: ClusterContext;
  contextRef: string;
  contextDigest: string;
  adapterCompatDigest: string;
};

export type LoadFragmentInputOptions = {
  deployPath: string;
  imagesPath: string;
  contextRef: string;
  contextPath: string;
  env: string;
  adapterCompatDigest: string;
};

let deterministicRuntime = false;

export function isDeterministicRuntime(): boolean {
  return deterministicRuntime;
}

/**
 * Runs fn with the deterministic-runtime flag set. Fragment renderers are pure
 * transforms; helpers that would otherwise use wall-clock time must call
 * deterministicTimestamp() so output is stable under this wrapper.
 */
export function withDeterministicRuntime<T>(fn: () => T): T {
  const previous = deterministicRuntime;
  deterministicRuntime = true;
  try {
    return fn();
  } finally {
    deterministicRuntime = previous;
  }
}

export function deterministicTimestamp(): string {
  return deterministicRuntime ? new Date(0).toISOString() : new Date().toISOString();
}

export function requireDigestRef(ref: string): void {
  if (!ref.includes("@sha256:")) {
    throw new Error(`E_CONTEXT_REF_NOT_PINNED: context ref '${ref}' must be digest-pinned with @sha256:<hex>`);
  }
}

const AMBIENT_VARS = ["DEPLOY_CONTEXT", "DEPLOY_IMAGES", "ADAPTER_CONTEXT_REF"];

export function forbidAmbientAdapterInputs(env: string, deployPath: string): void {
  void env;
  for (const variable of AMBIENT_VARS) {
    if (process.env[variable] != null) {
      throw new Error(`E_AMBIENT_INPUT_FORBIDDEN: env var '${variable}' is set; all inputs must be explicit CLI arguments`);
    }
  }
  const resolved = resolve(deployPath);
  if (!resolved.startsWith(process.cwd())) {
    throw new Error(`E_INPUT_OUTSIDE_WORKDIR: deployment path '${resolved}' is outside working directory '${process.cwd()}'`);
  }
}

export function parseDeploymentV2(doc: unknown): DeploymentV2 {
  const dep = doc as DeploymentV2 | null;
  if (
    !dep ||
    typeof dep !== "object" ||
    dep.kind !== "Deployment" ||
    !dep.metadata?.name ||
    typeof dep.spec?.namespace !== "string" ||
    !Array.isArray(dep.spec?.workloads)
  ) {
    throw new Error("E_DEPLOYMENT_INVALID: deployment.yml must be a Deployment with metadata.name, spec.namespace and spec.workloads");
  }
  return dep;
}

export function loadFragmentInput(opts: LoadFragmentInputOptions): FragmentInput {
  forbidAmbientAdapterInputs(opts.env, opts.deployPath);
  return loadFragmentInputFromPaths(opts);
}

/** Same as loadFragmentInput but without the ambient-env prohibition (test/dev helper). */
export function loadFragmentInputFromPaths(opts: LoadFragmentInputOptions): FragmentInput {
  if (!opts.contextRef.startsWith("local://")) {
    requireDigestRef(opts.contextRef);
  }
  const rawDep = readFileSync(opts.deployPath, "utf8");
  const rawImages = readFileSync(opts.imagesPath, "utf8");
  const rawCtx = readFileSync(opts.contextPath, "utf8");

  const deployment = parseDeploymentV2(YAML.parse(rawDep));
  const images = normalizeImageLock(JSON.parse(rawImages));
  const context = validateClusterContext(YAML.parse(rawCtx));

  assertNoFloatingImages(deployment, images);
  validateDeploymentSemantics(deployment, context);
  validateContextCompatibility(deployment, context);

  return {
    deployment,
    deploymentDigest: sha256(rawDep),
    environment: opts.env,
    images,
    imagesDigest: sha256(rawImages),
    context,
    contextRef: opts.contextRef,
    contextDigest: sha256(rawCtx),
    adapterCompatDigest: opts.adapterCompatDigest,
  };
}

export function assertNoFloatingImages(deployment: DeploymentV2, images: Record<string, string>): void {
  for (const [alias, ref] of Object.entries(images)) {
    if (ref.endsWith(":latest")) {
      throw new Error(`E_FLOATING_IMAGE: alias '${alias}' ref '${ref}' (latest-tag)`);
    }
    if (ref.includes(":") && !ref.includes("@sha256:")) {
      throw new Error(`E_FLOATING_IMAGE: alias '${alias}' ref '${ref}' (tag-only-unpinned)`);
    }
    if (!ref.includes(":") && !ref.includes("@")) {
      throw new Error(`E_FLOATING_IMAGE: alias '${alias}' ref '${ref}' (bare-no-tag-no-digest)`);
    }
  }
  for (const workload of deployment.spec.workloads) {
    if (workload.rawManifests?.enabled) {
      assertNoFloatingImagesInRawManifests(workload.rawManifests.path);
    }
  }
}

export function assertNoFloatingImagesInRawManifests(rawManifestPath: string): void {
  for (const file of listYamlFilesRecursive(rawManifestPath)) {
    const docs = YAML.parseAllDocuments(readFileSync(file, "utf8"));
    for (const doc of docs) {
      for (const imgRef of extractImageRefs(doc.toJS() as unknown)) {
        if (imgRef.endsWith(":latest") || (imgRef.includes(":") && !imgRef.includes("@sha256:"))) {
          throw new Error(`E_FLOATING_IMAGE: raw manifest '${file}' image '${imgRef}' (raw-manifest-unpinned)`);
        }
      }
    }
  }
}

export function extractImageRefs(doc: unknown): string[] {
  const refs: string[] = [];
  if (Array.isArray(doc)) {
    for (const entry of doc) refs.push(...extractImageRefs(entry));
  } else if (doc !== null && typeof doc === "object") {
    for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
      if (key === "image" && typeof value === "string") {
        refs.push(value);
      } else {
        refs.push(...extractImageRefs(value));
      }
    }
  }
  return refs;
}

export function listYamlFilesRecursive(root: string): string[] {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (!stats.isDirectory()) {
    return /\.ya?ml$/i.test(root) ? [root] : [];
  }
  return readdirSync(root)
    .flatMap((entry) => {
      const path = join(root, entry);
      return statSync(path).isDirectory() ? listYamlFilesRecursive(path) : (/\.ya?ml$/i.test(path) ? [path] : []);
    })
    .sort();
}

export function validateContextCompatibility(deployment: DeploymentV2, context: ClusterContext): void {
  for (const workload of deployment.spec.workloads) {
    for (const route of workload.routes ?? []) {
      const authMode = resolveRouteAuthMode(deployment, workload, route);
      const tierId = route.expose?.tier;
      if (tierId) {
        const tier = context.spec.routeTiers[tierId];
        if (!tier) {
          throw new Error(`E_UNKNOWN_ROUTE_TIER: tier '${tierId}' not declared in cluster context`);
        }
        if (authMode && !(tier.authModes as string[]).includes(authMode)) {
          throw new Error(`E_ROUTE_AUTH_MODE_NOT_IN_TIER: authMode '${authMode}' not allowed by tier '${tierId}' (allowed: ${tier.authModes.join(", ")})`);
        }
        for (const key of Object.keys(tier.requiredLabels ?? {})) {
          if (!(key in context.spec.labels.allowed)) {
            throw new Error(`E_PLACEMENT_LABEL_NOT_ALLOWED: tier '${tierId}' required label key '${key}' not in context label allowlist`);
          }
        }
      }
    }
    for (const [key, values] of Object.entries(workload.placement?.nodeSelector ?? {})) {
      if (!(key in context.spec.labels.allowed)) {
        throw new Error(`E_PLACEMENT_LABEL_NOT_ALLOWED: placement label key '${key}' not in context label allowlist`);
      }
      const allowed = context.spec.labels.allowed[key];
      for (const val of values) {
        if (!allowed.includes(val)) {
          throw new Error(`E_PLACEMENT_LABEL_VALUE_NOT_ALLOWED: '${key}=${val}' not in allowlist [${allowed.join(", ")}]`);
        }
      }
    }
  }
}

function sha256(value: string): string {
  return "sha256:" + createHash("sha256").update(value, "utf8").digest("hex");
}
