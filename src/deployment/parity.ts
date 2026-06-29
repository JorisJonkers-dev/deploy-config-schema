import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { loadYamlDocuments } from "./io.js";
import type { Diagnostic, KubernetesObject } from "./model.js";
import { deploymentSourceHeaderPrefix, type RenderSourceKind } from "./render/files.js";

export type ParityComparisonMode = "byte" | "behavioral";
export type BehaviorDiffClassification = "behavior-preserving" | "behavior-changing";

export type ParityObject = {
  key: string;
  path: string;
  documentIndex: number;
  value: KubernetesObject;
  normalized: string;
  behavior: string;
  source?: RenderSourceKind;
};

export type BehaviorDiff = {
  classification: BehaviorDiffClassification;
  summary: string;
  diff?: string;
};

export type ParityObjectComparison = {
  key: string;
  currentPath?: string;
  renderedPath?: string;
  behaviorEquivalent: boolean;
  diffs: BehaviorDiff[];
};

export type SourceBreakdown = Record<RenderSourceKind, number>;

export type ParitySummary = {
  mode: ParityComparisonMode;
  currentObjects: number;
  renderedObjects: number;
  missing: number;
  extra: number;
  changed: number;
  duplicates: number;
  behaviorEquivalent: number;
  behaviorPreservingDiffs: number;
  behaviorChangingDiffs: number;
  sourceBreakdown: SourceBreakdown;
};

export type ParityReport = {
  ok: boolean;
  mode: ParityComparisonMode;
  currentRoot: string;
  renderedRoot: string;
  summary: ParitySummary;
  missing: string[];
  extra: string[];
  changed: Array<{ key: string; currentPath: string; renderedPath: string; diff: string }>;
  comparisons: ParityObjectComparison[];
  duplicates: Array<{ key: string; paths: string[] }>;
  diagnostics: Diagnostic[];
};

type CollectedParityTree = {
  root: string;
  objects: Map<string, ParityObject>;
  duplicates: Array<{ key: string; paths: string[] }>;
  diagnostics: Diagnostic[];
};

const manifestFilePattern = /\.(ya?ml|json)$/i;

const volatileAnnotations = new Set([
  "kubectl.kubernetes.io/last-applied-configuration",
  "kustomize.toolkit.fluxcd.io/checksum",
  "reconcile.fluxcd.io/requestedAt",
]);

const runtimeMetadataFields = [
  "creationTimestamp",
  "resourceVersion",
  "uid",
  "generation",
  "managedFields",
  "selfLink",
];

const clusterScopedKinds = new Set([
  "APIService",
  "CertificateSigningRequest",
  "ClusterIssuer",
  "ClusterRole",
  "ClusterRoleBinding",
  "CustomResourceDefinition",
  "GatewayClass",
  "IngressClass",
  "MutatingWebhookConfiguration",
  "Namespace",
  "Node",
  "PersistentVolume",
  "PodSecurityPolicy",
  "PriorityClass",
  "RuntimeClass",
  "StorageClass",
  "ValidatingWebhookConfiguration",
  "VolumeSnapshotClass",
]);

export function normalizeParityTree(root: string): Map<string, ParityObject> {
  return collectParityTree(root).objects;
}

export function compareParityTrees(options: { current: string; rendered: string; mode?: ParityComparisonMode }): ParityReport {
  const mode = options.mode ?? "behavioral";
  const current = collectParityTree(options.current, "current");
  const rendered = collectParityTree(options.rendered, "rendered");

  const missing = [...current.objects.keys()].filter((key) => !rendered.objects.has(key)).sort();
  const extra = [...rendered.objects.keys()].filter((key) => !current.objects.has(key)).sort();
  const changed = [...current.objects.keys()]
    .filter((key) => rendered.objects.has(key) && current.objects.get(key)?.normalized !== rendered.objects.get(key)?.normalized)
    .sort()
    .map((key) => {
      const currentObject = current.objects.get(key);
      const renderedObject = rendered.objects.get(key);
      if (!currentObject || !renderedObject) {
        throw new Error(`internal parity comparison mismatch for ${key}`);
      }
      return {
        key,
        currentPath: currentObject.path,
        renderedPath: renderedObject.path,
        diff: unifiedDiff(currentObject.normalized, renderedObject.normalized, `current/${currentObject.path}`, `rendered/${renderedObject.path}`),
      };
    });
  const comparisons = compareBehavior(current.objects, rendered.objects, missing, extra);
  const duplicates = [...current.duplicates, ...rendered.duplicates].sort((left, right) => left.key.localeCompare(right.key));
  const diagnostics = [...current.diagnostics, ...rendered.diagnostics];
  const behaviorPreservingDiffs = comparisons.reduce((count, comparison) => count + comparison.diffs.filter((diff) => diff.classification === "behavior-preserving").length, 0);
  const behaviorChangingDiffs = comparisons.reduce((count, comparison) => count + comparison.diffs.filter((diff) => diff.classification === "behavior-changing").length, 0) + duplicates.length;
  const noIdentityFailures = missing.length === 0 && extra.length === 0 && duplicates.length === 0 && diagnostics.length === 0;
  const ok = mode === "byte"
    ? noIdentityFailures && changed.length === 0
    : noIdentityFailures && behaviorChangingDiffs === 0;

  return {
    ok,
    mode,
    currentRoot: current.root,
    renderedRoot: rendered.root,
    summary: {
      mode,
      currentObjects: current.objects.size,
      renderedObjects: rendered.objects.size,
      missing: missing.length,
      extra: extra.length,
      changed: changed.length,
      duplicates: duplicates.length,
      behaviorEquivalent: comparisons.filter((comparison) => comparison.behaviorEquivalent).length,
      behaviorPreservingDiffs,
      behaviorChangingDiffs,
      sourceBreakdown: sourceBreakdown(rendered.objects),
    },
    missing,
    extra,
    changed,
    comparisons,
    duplicates,
    diagnostics,
  };
}

export function unifiedDiff(current: string, rendered: string, currentLabel = "current", renderedLabel = "rendered"): string {
  if (current === rendered) return "";

  const currentLines = lines(current);
  const renderedLines = lines(rendered);
  const table = lcsTable(currentLines, renderedLines);
  const output = [
    `--- ${currentLabel}`,
    `+++ ${renderedLabel}`,
    `@@ -1,${currentLines.length} +1,${renderedLines.length} @@`,
  ];

  let i = 0;
  let j = 0;
  while (i < currentLines.length && j < renderedLines.length) {
    if (currentLines[i] === renderedLines[j]) {
      output.push(` ${currentLines[i]}`);
      i += 1;
      j += 1;
    } else if (table[i + 1]?.[j] >= table[i]?.[j + 1]) {
      output.push(`-${currentLines[i]}`);
      i += 1;
    } else {
      output.push(`+${renderedLines[j]}`);
      j += 1;
    }
  }
  while (i < currentLines.length) {
    output.push(`-${currentLines[i]}`);
    i += 1;
  }
  while (j < renderedLines.length) {
    output.push(`+${renderedLines[j]}`);
    j += 1;
  }

  return `${output.join("\n")}\n`;
}

function collectParityTree(root: string, label?: "current" | "rendered"): CollectedParityTree {
  const resolvedRoot = resolve(root);
  const objects = new Map<string, ParityObject>();
  const duplicatePaths = new Map<string, string[]>();
  const diagnostics: Diagnostic[] = [];

  if (root.includes("\0")) {
    diagnostics.push(diagnostic("E_PARITY_UNSAFE_PATH", `parity root contains NUL byte: ${root}`, "/"));
    return { root: resolvedRoot, objects, duplicates: [], diagnostics };
  }

  if (!existsSync(resolvedRoot)) {
    diagnostics.push(diagnostic("E_PARITY_ROOT_MISSING", `parity root does not exist: ${root}`, "/"));
    return { root: resolvedRoot, objects, duplicates: [], diagnostics };
  }

  const stats = statSync(resolvedRoot);
  const baseDir = stats.isDirectory() ? resolvedRoot : dirname(resolvedRoot);
  const files = stats.isDirectory() ? listManifestFiles(resolvedRoot, resolvedRoot, diagnostics) : manifestFilePattern.test(resolvedRoot) ? [resolvedRoot] : [];

  for (const path of files) {
    const relativePath = slashPath(relative(baseDir, path));
    let documents: unknown[];
    const source = sourceKindFromContent(readFileSync(path, "utf8"));
    try {
      documents = loadYamlDocuments(path);
    } catch (error) {
      diagnostics.push(diagnostic("E_PARITY_PARSE", `failed to parse ${relativePath}: ${errorMessage(error)}`, relativePath));
      continue;
    }

    documents.forEach((document, documentIndex) => {
      if (!isRecord(document)) {
        diagnostics.push(diagnostic("E_PARITY_DOCUMENT_INVALID", `manifest document must be an object: ${relativePath}#${documentIndex}`, relativePath));
        return;
      }
      const normalized = normalizeKubernetesObject(document);
      const key = parityObjectKey(normalized, relativePath, documentIndex);
      const parityObject = {
        key,
        path: relativePath,
        documentIndex,
        value: normalized,
        normalized: canonicalYaml(normalized),
        behavior: canonicalYaml(behaviorProjection(normalized)),
        source,
      };
      const duplicatePath = `${label ? `${label}/` : ""}${relativePath}#${documentIndex}`;
      if (objects.has(key)) {
        const paths = duplicatePaths.get(key) ?? [`${label ? `${label}/` : ""}${objects.get(key)?.path ?? relativePath}#${objects.get(key)?.documentIndex ?? 0}`];
        paths.push(duplicatePath);
        duplicatePaths.set(key, paths);
      } else {
        objects.set(key, parityObject);
      }
    });
  }

  return {
    root: resolvedRoot,
    objects,
    duplicates: [...duplicatePaths.entries()].map(([key, paths]) => ({ key, paths })),
    diagnostics,
  };
}

function listManifestFiles(root: string, directory: string, diagnostics: Diagnostic[]): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory).sort()) {
    const path = resolve(directory, entry);
    const entryRelativePath = slashPath(relative(root, path));
    let stats;
    try {
      stats = lstatSync(path);
    } catch (error) {
      diagnostics.push(diagnostic("E_PARITY_READ", `failed to stat ${entryRelativePath}: ${errorMessage(error)}`, entryRelativePath));
      continue;
    }
    if (stats.isSymbolicLink()) {
      const realPath = realpathSync(path);
      const relativeRealPath = relative(root, realPath);
      if (relativeRealPath === ".." || relativeRealPath.startsWith(`..${sep}`) || relativeRealPath.startsWith("..\\")) {
        diagnostics.push(diagnostic("E_PARITY_UNSAFE_PATH", `symlink escapes parity root: ${entryRelativePath}`, entryRelativePath));
        continue;
      }
      stats = statSync(realPath);
    }
    if (stats.isDirectory()) {
      files.push(...listManifestFiles(root, path, diagnostics));
    } else if (stats.isFile() && manifestFilePattern.test(entry)) {
      files.push(path);
    }
  }
  return files.sort();
}

function compareBehavior(
  currentObjects: Map<string, ParityObject>,
  renderedObjects: Map<string, ParityObject>,
  missing: string[],
  extra: string[],
): ParityObjectComparison[] {
  const comparisons: ParityObjectComparison[] = [];
  for (const key of missing) {
    const current = currentObjects.get(key);
    comparisons.push({
      key,
      currentPath: current?.path,
      behaviorEquivalent: false,
      diffs: [{ classification: "behavior-changing", summary: "object is missing from the rendered tree" }],
    });
  }
  for (const key of extra) {
    const rendered = renderedObjects.get(key);
    comparisons.push({
      key,
      renderedPath: rendered?.path,
      behaviorEquivalent: false,
      diffs: [{ classification: "behavior-changing", summary: "object is extra in the rendered tree" }],
    });
  }
  for (const key of [...currentObjects.keys()].filter((candidate) => renderedObjects.has(candidate)).sort()) {
    const current = currentObjects.get(key);
    const rendered = renderedObjects.get(key);
    if (!current || !rendered) continue;
    const diffs: BehaviorDiff[] = [];
    if (current.behavior !== rendered.behavior) {
      diffs.push({
        classification: "behavior-changing",
        summary: `substantive ${kindName(current.value)} fields differ`,
        diff: unifiedDiff(current.behavior, rendered.behavior, `current/${current.path}#behavior`, `rendered/${rendered.path}#behavior`),
      });
    } else if (current.normalized !== rendered.normalized) {
      diffs.push({
        classification: "behavior-preserving",
        summary: "only cosmetic, defaulted, or semantically irrelevant fields differ",
        diff: unifiedDiff(current.normalized, rendered.normalized, `current/${current.path}`, `rendered/${rendered.path}`),
      });
    }
    comparisons.push({
      key,
      currentPath: current.path,
      renderedPath: rendered.path,
      behaviorEquivalent: diffs.every((diff) => diff.classification !== "behavior-changing"),
      diffs,
    });
  }
  return comparisons.sort((left, right) => left.key.localeCompare(right.key));
}

function sourceBreakdown(objects: Map<string, ParityObject>): SourceBreakdown {
  const breakdown: SourceBreakdown = {
    "model-rendered": 0,
    "pack-sourced": 0,
    "collection-sourced": 0,
    carried: 0,
  };
  for (const object of objects.values()) {
    if (object.source) breakdown[object.source] += 1;
  }
  return breakdown;
}

function normalizeKubernetesObject(value: KubernetesObject): KubernetesObject {
  const copy = structuredClone(value) as KubernetesObject;
  const metadata = recordValue(copy.metadata);

  if (metadata) {
    for (const field of runtimeMetadataFields) {
      delete metadata[field];
    }

    const annotations = recordValue(metadata.annotations);
    if (annotations) {
      for (const annotation of volatileAnnotations) {
        delete annotations[annotation];
      }
      if (Object.keys(annotations).length === 0) {
        delete metadata.annotations;
      }
    }
  }

  delete copy.status;
  applyDesiredStateIgnores(copy);

  return sortKeys(copy) as KubernetesObject;
}

function applyDesiredStateIgnores(value: KubernetesObject): void {
  const kind = stringValue(value.kind);
  const metadata = recordValue(value.metadata);
  const name = stringValue(metadata?.name);
  const namespace = stringValue(metadata?.namespace);

  if (kind === "GitRepository" && name === "flux-system" && namespace === "flux-system") {
    deletePath(value, ["spec", "url"]);
    deletePath(value, ["spec", "ref", "branch"], true);
  }
  if (kind === "Kustomization" && name === "flux-system" && namespace === "flux-system") {
    deletePath(value, ["spec", "path"]);
  }
}

function behaviorProjection(value: KubernetesObject): KubernetesObject {
  const kind = kindName(value);
  if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"].includes(kind)) {
    return sortKeys(workloadProjection(value)) as KubernetesObject;
  }
  if (kind === "Service") {
    return sortKeys({
      ...identity(value),
      spec: {
        type: stringValue(recordValue(value.spec)?.type) ?? "ClusterIP",
        ports: sortedByCanonical(arrayValue(recordValue(value.spec)?.ports).map(normalizeServicePort)),
      },
    }) as KubernetesObject;
  }
  if (value.apiVersion === "kustomize.config.k8s.io/v1beta1" && kind === "Kustomization") {
    return sortKeys(identity(value)) as KubernetesObject;
  }
  if (kind === "IngressRoute") {
    return sortKeys({
      ...identity(value),
      spec: {
        routes: sortedByCanonical(arrayValue(recordValue(value.spec)?.routes).map((route) => {
          const item = recordValue(route) ?? {};
          return {
            match: item.match,
            kind: item.kind,
            services: sortedByCanonical(arrayValue(item.services).map(normalizeTraefikService)),
            middlewares: arrayValue(item.middlewares).map(normalizeNameNamespaceRef),
          };
        })),
        tls: normalizeValue(recordValue(value.spec)?.tls),
      },
    }) as KubernetesObject;
  }
  if (kind === "Middleware") {
    return sortKeys({ ...identity(value), spec: normalizeValue(recordValue(value.spec)) }) as KubernetesObject;
  }
  if (kind === "VaultStaticSecret" || kind === "VaultDynamicSecret") {
    return sortKeys(vsoProjection(value)) as KubernetesObject;
  }
  if (kind === "ServiceMonitor" || kind === "PodMonitor") {
    return sortKeys(monitorProjection(value)) as KubernetesObject;
  }
  if (kind === "ConfigMap" && isGatusConfigMap(value)) {
    return sortKeys(gatusProjection(value)) as KubernetesObject;
  }
  if (kind === "GitRepository") {
    const spec = recordValue(value.spec) ?? {};
    return sortKeys({ ...identity(value), spec: pickDefined({ url: spec.url, ref: normalizeValue(spec.ref), interval: spec.interval }) }) as KubernetesObject;
  }
  if (kind === "Kustomization") {
    const spec = recordValue(value.spec) ?? {};
    return sortKeys({
      ...identity(value),
      spec: pickDefined({
        path: spec.path,
        interval: spec.interval,
        dependsOn: sortedByCanonical(arrayValue(spec.dependsOn).map(normalizeNameNamespaceRef)),
        healthChecks: sortedByCanonical(arrayValue(spec.healthChecks).map(normalizeNameNamespaceRef)),
      }),
    }) as KubernetesObject;
  }
  return value;
}

function workloadProjection(value: KubernetesObject): Record<string, unknown> {
  const spec = recordValue(value.spec) ?? {};
  const template = podTemplateSpec(value);
  const podSpec = recordValue(template?.spec) ?? {};
  return {
    ...identity(value),
    spec: pickDefined({
      replicas: kindName(value) === "DaemonSet" ? undefined : spec.replicas ?? 1,
      serviceAccount: podSpec.serviceAccountName ?? podSpec.serviceAccount ?? "default",
      securityContext: normalizeValue(podSpec.securityContext),
      containers: sortedByName(arrayValue(podSpec.containers).map(normalizeContainer)),
      initContainers: sortedByName(arrayValue(podSpec.initContainers).map(normalizeContainer)),
    }),
  };
}

function podTemplateSpec(value: KubernetesObject): Record<string, unknown> | undefined {
  const spec = recordValue(value.spec) ?? {};
  if (kindName(value) === "CronJob") {
    return recordValue(recordValue(recordValue(spec.jobTemplate)?.spec)?.template);
  }
  return recordValue(spec.template);
}

function normalizeContainer(value: unknown): Record<string, unknown> {
  const container = recordValue(value) ?? {};
  return pickDefined({
    name: container.name,
    image: container.image,
    imagePullPolicy: container.imagePullPolicy,
    command: container.command,
    args: container.args,
    ports: sortedByCanonical(arrayValue(container.ports).map(normalizeContainerPort)),
    env: sortedByName(arrayValue(container.env).map(normalizeEnv)),
    envFrom: sortedByCanonical(arrayValue(container.envFrom).map(normalizeValue)),
    resources: normalizeValue(container.resources),
    volumeMounts: sortedByCanonical(arrayValue(container.volumeMounts).map(normalizeVolumeMount)),
    startupProbe: normalizeValue(container.startupProbe),
    readinessProbe: normalizeValue(container.readinessProbe),
    livenessProbe: normalizeValue(container.livenessProbe),
    securityContext: normalizeValue(container.securityContext),
  });
}

function normalizeServicePort(value: unknown): Record<string, unknown> {
  const port = recordValue(value) ?? {};
  return pickDefined({
    name: port.name,
    protocol: port.protocol ?? "TCP",
    port: port.port,
    targetPort: port.targetPort ?? port.port,
  });
}

function normalizeContainerPort(value: unknown): Record<string, unknown> {
  const port = recordValue(value) ?? {};
  return pickDefined({
    name: port.name,
    protocol: port.protocol ?? "TCP",
    containerPort: port.containerPort,
  });
}

function normalizeEnv(value: unknown): Record<string, unknown> {
  const env = recordValue(value) ?? {};
  return pickDefined({ name: env.name, value: env.value, valueFrom: normalizeValue(env.valueFrom) });
}

function normalizeVolumeMount(value: unknown): Record<string, unknown> {
  const mount = recordValue(value) ?? {};
  return pickDefined({
    name: mount.name,
    mountPath: mount.mountPath,
    subPath: mount.subPath,
    readOnly: mount.readOnly ?? false,
  });
}

function normalizeTraefikService(value: unknown): Record<string, unknown> {
  const service = recordValue(value) ?? {};
  return pickDefined({
    name: service.name,
    namespace: service.namespace,
    port: service.port,
    scheme: service.scheme,
    weight: service.weight,
  });
}

function vsoProjection(value: KubernetesObject): Record<string, unknown> {
  const spec = recordValue(value.spec) ?? {};
  const destination = recordValue(spec.destination) ?? {};
  const transformation = recordValue(destination.transformation) ?? recordValue(spec.transformation);
  return {
    ...identity(value),
    spec: pickDefined({
      mount: spec.mount,
      path: spec.path,
      type: spec.type,
      destination: pickDefined({
        name: destination.name,
        namespace: destination.namespace ?? recordValue(value.metadata)?.namespace,
      }),
      templates: normalizeValue(recordValue(spec.templates) ?? recordValue(transformation?.templates)),
    }),
  };
}

function monitorProjection(value: KubernetesObject): Record<string, unknown> {
  const spec = recordValue(value.spec) ?? {};
  const endpoints = arrayValue(spec.endpoints ?? spec.podMetricsEndpoints).map((endpoint) => {
    const item = recordValue(endpoint) ?? {};
    return pickDefined({
      port: item.port,
      path: item.path ?? "/metrics",
      interval: item.interval ?? "30s",
    });
  });
  return {
    ...identity(value),
    spec: {
      endpoints: sortedByCanonical(endpoints),
    },
  };
}

function isGatusConfigMap(value: KubernetesObject): boolean {
  const metadata = recordValue(value.metadata);
  const name = stringValue(metadata?.name) ?? "";
  const data = recordValue(value.data);
  return name.includes("gatus") && typeof data?.["endpoints.yaml"] === "string";
}

function gatusProjection(value: KubernetesObject): Record<string, unknown> {
  const data = recordValue(value.data) ?? {};
  const parsed = parseEmbeddedYaml(data["endpoints.yaml"]);
  const endpoints = arrayValue(recordValue(parsed)?.endpoints).map((endpoint) => {
    const item = recordValue(endpoint) ?? {};
    return pickDefined({
      name: item.name,
      group: item.group,
      url: item.url,
      interval: item.interval ?? "60s",
      conditions: [...arrayValue(item.conditions)].sort(),
    });
  });
  return {
    ...identity(value),
    data: {
      endpoints: sortedByCanonical(endpoints),
    },
  };
}

function identity(value: KubernetesObject): Record<string, unknown> {
  const metadata = recordValue(value.metadata) ?? {};
  return {
    apiVersion: value.apiVersion,
    kind: value.kind,
    metadata: pickDefined({
      name: metadata.name,
      namespace: metadata.namespace,
    }),
  };
}

export function parityObjectKey(value: KubernetesObject, path: string, documentIndex: number): string {
  const apiVersion = stringValue(value.apiVersion);
  const kind = stringValue(value.kind);
  const metadata = recordValue(value.metadata);
  const name = stringValue(metadata?.name);
  if (!apiVersion || !kind || !name) {
    return `_path/${path}#${documentIndex}`;
  }
  const namespace = isClusterScoped(kind) ? "_cluster" : stringValue(metadata?.namespace) ?? "default";
  return `${apiVersion}/${kind}/${namespace}/${name}`;
}

function isClusterScoped(kind: string): boolean {
  return clusterScopedKinds.has(kind) || kind.startsWith("Cluster");
}

function canonicalYaml(value: KubernetesObject): string {
  return YAML.stringify(value, { indent: 2, lineWidth: 0, sortMapEntries: false, singleQuote: true }).trimEnd();
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (!isRecord(value)) return value;
  return sortKeys(pickDefined(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]))));
}

function pickDefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function sortedByName(values: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...values].sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")) || canonicalSortKey(left).localeCompare(canonicalSortKey(right)));
}

function sortedByCanonical<T>(values: T[]): T[] {
  return [...values].sort((left, right) => canonicalSortKey(left).localeCompare(canonicalSortKey(right)));
}

function canonicalSortKey(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function normalizeNameNamespaceRef(value: unknown): Record<string, unknown> {
  const ref = recordValue(value) ?? {};
  return pickDefined({
    name: ref.name,
    namespace: ref.namespace,
    kind: ref.kind,
    apiVersion: ref.apiVersion,
  });
}

function parseEmbeddedYaml(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return YAML.parse(value);
  } catch {
    return undefined;
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortKeys(item)]),
  );
}

function deletePath(value: Record<string, unknown>, path: string[], pruneEmptyParents = false): void {
  if (path.length === 0) return;
  const [head, ...rest] = path;
  if (rest.length === 0) {
    delete value[head];
    return;
  }
  const next = recordValue(value[head]);
  if (!next) return;
  deletePath(next, rest, pruneEmptyParents);
  if (pruneEmptyParents && Object.keys(next).length === 0) {
    delete value[head];
  }
}

function lcsTable(left: string[], right: string[]): number[][] {
  const table = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

function lines(value: string): string[] {
  return value.length === 0 ? [] : value.split("\n");
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function kindName(value: KubernetesObject): string {
  return stringValue(value.kind) ?? "object";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnostic(code: string, message: string, path: string): Diagnostic {
  return { code, message, path };
}

function slashPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function sourceKindFromContent(content: string): RenderSourceKind | undefined {
  const escapedPrefix = deploymentSourceHeaderPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escapedPrefix}(model-rendered|pack-sourced|collection-sourced|carried)\\s*$`, "m"));
  return match?.[1] as RenderSourceKind | undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
