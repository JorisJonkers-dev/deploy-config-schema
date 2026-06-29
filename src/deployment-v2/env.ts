import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DeploymentEnvironment } from "./model.js";
import { loadYamlDocument } from "./io.js";

export function loadEnvironmentFiles(options: {
  deploymentPath: string;
  environment: DeploymentEnvironment;
  envPaths?: string[];
}): Record<string, unknown> {
  const baseDir = dirname(options.deploymentPath);
  const paths = options.envPaths ?? [
    join(baseDir, "runtime.env.yml"),
    ...(options.environment === "runtime" ? [] : [join(baseDir, `${options.environment}.env.yml`)]),
  ];
  const files: Record<string, unknown> = {};
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const document = loadYamlDocument(path) as Record<string, any>;
    const name = document.metadata?.name ?? path;
    files[name] = document.spec ?? {};
  }
  return files;
}

export function applyEnvironment<T>(base: T, envFiles: Record<string, unknown>, environment: DeploymentEnvironment): T {
  let merged: unknown = structuredClone(base);
  const ordered = [
    envFiles.runtime,
    environment === "runtime" ? undefined : envFiles[environment],
  ].filter((value) => value !== undefined);

  for (const envFile of ordered) {
    const spec = envFile as Record<string, any>;
    if (spec.values) {
      merged = deepMerge(merged, { spec: { values: spec.values } });
    }
    if (spec.overrides) {
      merged = applyWorkloadOverrides(merged, spec.overrides);
    }
  }
  return merged as T;
}

export function deepMerge(left: unknown, right: unknown): unknown {
  if (Array.isArray(left) || Array.isArray(right)) return structuredClone(right);
  if (!isRecord(left) || !isRecord(right)) return structuredClone(right);
  const merged: Record<string, unknown> = { ...left };
  for (const [key, value] of Object.entries(right)) {
    merged[key] = key in merged ? deepMerge(merged[key], value) : structuredClone(value);
  }
  return merged;
}

function applyWorkloadOverrides(document: unknown, overrides: Record<string, unknown>): unknown {
  const next = structuredClone(document) as Record<string, any>;
  for (const [name, override] of Object.entries(overrides)) {
    if (next.spec?.workloads?.[name]) {
      next.spec.workloads[name] = deepMerge(next.spec.workloads[name], override);
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
