import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { Diagnostic, KubernetesObject } from "../deployment/model.js";

// A rendered fragment is a schema document, not Kubernetes YAML: it wraps its
// payload under a kind-specific key. Flux and kustomize both require a
// top-level apiVersion/kind per document, so an artifact cannot be applied
// until the payload is lifted out.
//
// Only one fragment carries cluster objects. The other four carry intent that
// aggregates across services -- one IngressRoute per host, one Gatus ConfigMap
// for the whole fleet -- which a per-service Kustomization cannot produce, so
// they are declared here rather than silently ignored.
const APPLYABLE_FRAGMENTS = new Map<string, string>([["KubernetesWorkloadFragment", "manifests"]]);

const INTENT_FRAGMENTS = new Map<string, string>([
  ["TraefikRouteFragment", "routes"],
  ["GatusEndpointFragment", "endpoints"],
  ["EdgeCatalogFragment", "entries"],
  ["ImageMetadataFragment", "images"],
]);

export type ApplyBundleResult = {
  valid: boolean;
  resources: string[];
  skipped: Array<{ file: string; kind: string; reason: string }>;
  diagnostics: Diagnostic[];
};

export function buildApplyBundle(manifestsDir: string, outDir: string): ApplyBundleResult {
  const diagnostics: Diagnostic[] = [];
  const skipped: ApplyBundleResult["skipped"] = [];
  const objects: Array<{ file: string; object: KubernetesObject }> = [];

  if (!existsSync(manifestsDir)) {
    return {
      valid: false,
      resources: [],
      skipped,
      diagnostics: [{ code: "E_MANIFESTS_DIR_MISSING", path: "/", message: `manifests directory not found: ${manifestsDir}` }],
    };
  }

  const files = readdirSync(manifestsDir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .sort();

  for (const file of files) {
    const document = YAML.parse(readFileSync(join(manifestsDir, file), "utf8"));
    if (!isRecord(document)) {
      diagnostics.push({ code: "E_FRAGMENT_MALFORMED", path: `/${file}`, message: `fragment is not a mapping: ${file}` });
      continue;
    }

    const kind = typeof document.kind === "string" ? document.kind : undefined;
    if (!kind) {
      diagnostics.push({ code: "E_FRAGMENT_KIND_MISSING", path: `/${file}`, message: `fragment declares no kind: ${file}` });
      continue;
    }

    const intentKey = INTENT_FRAGMENTS.get(kind);
    if (intentKey) {
      skipped.push({ file, kind, reason: `carries ${intentKey} intent, composed cluster-wide rather than per service` });
      continue;
    }

    const payloadKey = APPLYABLE_FRAGMENTS.get(kind);
    if (!payloadKey) {
      // An unrecognised fragment is a hard error: silently dropping it would
      // publish an artifact whose objects never reach the cluster.
      diagnostics.push({
        code: "E_FRAGMENT_KIND_UNKNOWN",
        path: `/${file}`,
        message: `unknown fragment kind ${kind}; declare it as applyable or intent before publishing`,
      });
      continue;
    }

    const payload = document[payloadKey];
    if (!Array.isArray(payload)) {
      diagnostics.push({
        code: "E_FRAGMENT_PAYLOAD_MISSING",
        path: `/${file}/${payloadKey}`,
        message: `${kind} carries no ${payloadKey} array`,
      });
      continue;
    }

    payload.forEach((entry, index) => {
      if (!isRecord(entry) || typeof entry.apiVersion !== "string" || typeof entry.kind !== "string") {
        diagnostics.push({
          code: "E_MANIFEST_INVALID",
          path: `/${file}/${payloadKey}/${index}`,
          message: `entry ${index} of ${file} is not a Kubernetes object`,
        });
        return;
      }
      objects.push({ file, object: entry as KubernetesObject });
    });
  }

  if (diagnostics.length > 0) {
    return { valid: false, resources: [], skipped, diagnostics };
  }

  if (objects.length === 0) {
    return {
      valid: false,
      resources: [],
      skipped,
      diagnostics: [{ code: "E_NO_APPLYABLE_OBJECTS", path: "/", message: "no applyable objects found; refusing to write an empty bundle" }],
    };
  }

  const named = objects.map(({ object }) => ({ name: resourceFileName(object), object }));
  const collisions = named.map((r) => r.name).filter((name, index, all) => all.indexOf(name) !== index);
  if (collisions.length > 0) {
    return {
      valid: false,
      resources: [],
      skipped,
      diagnostics: [{ code: "E_RESOURCE_NAME_COLLISION", path: "/", message: `two objects render to the same file: ${[...new Set(collisions)].sort().join(", ")}` }],
    };
  }

  mkdirSync(outDir, { recursive: true });
  const resources = named.map((r) => r.name).sort();
  for (const { name, object } of named) {
    writeFileSync(join(outDir, name), YAML.stringify(object, { lineWidth: 0 }));
  }
  writeFileSync(
    join(outDir, "kustomization.yaml"),
    YAML.stringify({ apiVersion: "kustomize.config.k8s.io/v1beta1", kind: "Kustomization", resources }, { lineWidth: 0 }),
  );

  return { valid: true, resources, skipped, diagnostics: [] };
}

function resourceFileName(object: KubernetesObject): string {
  const kind = String(object.kind).toLowerCase();
  const metadata = isRecord(object.metadata) ? object.metadata : {};
  const name = typeof metadata.name === "string" ? metadata.name : "unnamed";
  return `${kind}-${name}.yaml`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
