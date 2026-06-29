import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { validateArtifact } from "../artifact-validator.js";
import { loadYamlDocument } from "../deployment/io.js";
import type { Diagnostic } from "../deployment/model.js";

export type CollectionTreeValidation = {
  valid: boolean;
  diagnostics: Diagnostic[];
  collectionFiles: string[];
  envFiles: string[];
};

export type CollectionIndex = {
  apiVersion: "deployment.jorisjonkers.dev/collection-index";
  kind: "CollectionIndex";
  metadata: {
    root: string;
    generatedAt: string;
  };
  collections: Array<{
    name: string;
    path: string;
    digest: string;
    env: Array<{ name: string; path: string; digest: string }>;
  }>;
};

export function validateCollectionTree(root: string): CollectionTreeValidation {
  const resolvedRoot = resolve(root);
  const collectionFiles = findCollectionFiles(resolvedRoot);
  const envFiles = findCollectionEnvFiles(resolvedRoot);
  const diagnostics: Diagnostic[] = [];

  if (collectionFiles.length === 0) {
    diagnostics.push(diagnostic("E_COLLECTIONS_EMPTY", "/", "no collection deployment specs found"));
  }
  for (const path of collectionFiles) {
    const validation = validateArtifact("collection", loadYamlDocument(path));
    diagnostics.push(...validation.diagnostics.map((entry) => ({ ...entry, path: `${relativePath(resolvedRoot, path)}${entry.path}` })));
  }
  for (const path of envFiles) {
    const validation = validateArtifact("deployment-env", loadYamlDocument(path));
    diagnostics.push(...validation.diagnostics.map((entry) => ({ ...entry, path: `${relativePath(resolvedRoot, path)}${entry.path}` })));
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics: diagnostics.sort(compareDiagnostics),
    collectionFiles,
    envFiles,
  };
}

export function buildCollectionIndex(root: string, options: { generatedAt?: string } = {}): CollectionIndex {
  const resolvedRoot = resolve(root);
  const validation = validateCollectionTree(resolvedRoot);
  if (!validation.valid) {
    const error = new Error("collection tree is invalid") as Error & { diagnostics?: Diagnostic[] };
    error.diagnostics = validation.diagnostics;
    throw error;
  }
  return {
    apiVersion: "deployment.jorisjonkers.dev/collection-index",
    kind: "CollectionIndex",
    metadata: {
      root: ".",
      generatedAt: options.generatedAt ?? new Date(0).toISOString(),
    },
    collections: validation.collectionFiles.map((path) => {
      const document = loadYamlDocument(path) as any;
      const directory = resolve(path, "..");
      const env = validation.envFiles
        .filter((envPath) => resolve(envPath, "..") === directory)
        .map((envPath) => ({
          name: basename(envPath).replace(/\.env(?:\.ya?ml)?$/i, ""),
          path: relativePath(resolvedRoot, envPath),
          digest: sha256(readFileSync(envPath)),
        }));
      return {
        name: document.metadata?.name ?? basename(directory),
        path: relativePath(resolvedRoot, path),
        digest: sha256(readFileSync(path)),
        env,
      };
    }).sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function findCollectionFiles(root: string): string[] {
  return listFiles(root)
    .filter((path) => /\/deployment\.ya?ml$/i.test(slashPath(path)))
    .sort();
}

export function findCollectionEnvFiles(root: string): string[] {
  return listFiles(root)
    .filter((path) => /\.env(?:\.ya?ml)?$/i.test(path))
    .sort();
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (stats.isFile()) return [root];
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  }).sort();
}

function relativePath(root: string, path: string): string {
  return slashPath(relative(root, path));
}

function slashPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function diagnostic(code: string, path: string, message: string): Diagnostic {
  return { code, path, message };
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);
}
