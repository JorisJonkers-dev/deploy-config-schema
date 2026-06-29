import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { loadYamlDocuments } from "./io.js";
import type { Diagnostic, KubernetesObject } from "./model.js";

export type ParityObject = {
  key: string;
  path: string;
  documentIndex: number;
  normalized: string;
};

export type ParityReport = {
  ok: boolean;
  currentRoot: string;
  renderedRoot: string;
  summary: {
    currentObjects: number;
    renderedObjects: number;
    missing: number;
    extra: number;
    changed: number;
    duplicates: number;
  };
  missing: string[];
  extra: string[];
  changed: Array<{ key: string; currentPath: string; renderedPath: string; diff: string }>;
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

export function compareParityTrees(options: { current: string; rendered: string }): ParityReport {
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
  const duplicates = [...current.duplicates, ...rendered.duplicates].sort((left, right) => left.key.localeCompare(right.key));
  const diagnostics = [...current.diagnostics, ...rendered.diagnostics];
  const ok = missing.length === 0 && extra.length === 0 && changed.length === 0 && duplicates.length === 0 && diagnostics.length === 0;

  return {
    ok,
    currentRoot: current.root,
    renderedRoot: rendered.root,
    summary: {
      currentObjects: current.objects.size,
      renderedObjects: rendered.objects.size,
      missing: missing.length,
      extra: extra.length,
      changed: changed.length,
      duplicates: duplicates.length,
    },
    missing,
    extra,
    changed,
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
        normalized: canonicalYaml(normalized),
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
