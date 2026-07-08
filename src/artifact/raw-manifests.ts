import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import YAML from "yaml";
import type { DeploymentV2 } from "../deployment/v2-model.js";

export const FORBIDDEN_KINDS = ["Secret", "ClusterRole", "ClusterRoleBinding", "CustomResourceDefinition", "Namespace"];

export const RAW_REASON_ANNOTATION = "platform.jorisjonkers.dev/raw-reason";

export type ViolationEntry = {
  kind: string;
  filename: string;
  line?: number;
  reason?: string;
};

export type RawManifestsGuard = {
  present: boolean;
  forbidden_kinds_scanned: string[];
  violations: ViolationEntry[];
};

export type ValidateRawManifestsParams = {
  deployment: DeploymentV2;
  root: string;
  outputRoot?: string;
};

function listYamlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (!stats.isDirectory()) {
    return /\.ya?ml$/i.test(root) ? [root] : [];
  }
  return readdirSync(root)
    .flatMap((entry) => {
      const path = join(root, entry);
      return statSync(path).isDirectory() ? listYamlFiles(path) : (/\.ya?ml$/i.test(path) ? [path] : []);
    })
    .sort();
}

type RawDoc = {
  kind?: string;
  metadata?: { namespace?: string; annotations?: Record<string, string> };
};

/**
 * Guards raw manifests declared via workload.rawManifests: forbidden kinds,
 * foreign namespaces and the mandatory raw-reason annotation. Throws
 * E_RAW_MANIFESTS_VIOLATIONS when any violation is found.
 */
export function validateRawManifests(params: ValidateRawManifestsParams): RawManifestsGuard {
  const { deployment, root } = params;
  if (!deployment.spec.workloads.some((workload) => workload.rawManifests?.enabled)) {
    return { present: false, forbidden_kinds_scanned: FORBIDDEN_KINDS, violations: [] };
  }

  const violations: ViolationEntry[] = [];
  for (const file of listYamlFiles(root)) {
    const content = readFileSync(file, "utf8");
    for (const doc of YAML.parseAllDocuments(content)) {
      const obj = doc.toJS() as RawDoc | null;
      if (!obj || typeof obj !== "object") continue;
      const line = content.slice(0, doc.range?.[0] ?? 0).split("\n").length;
      const kind = obj.kind ?? "Unknown";
      const filename = relative(root, file);
      if (obj.kind && FORBIDDEN_KINDS.includes(obj.kind)) {
        violations.push({ kind, filename, line, reason: "E_FORBIDDEN_KIND" });
      }
      if (obj.metadata?.namespace && obj.metadata.namespace !== deployment.spec.namespace) {
        violations.push({ kind, filename, line, reason: "E_RAW_FOREIGN_NAMESPACE" });
      }
      if (!obj.metadata?.annotations?.[RAW_REASON_ANNOTATION]) {
        violations.push({ kind, filename, line, reason: "E_RAW_MISSING_ANNOTATION" });
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(`E_RAW_MANIFESTS_VIOLATIONS: ${JSON.stringify(violations)}`);
  }
  return { present: true, forbidden_kinds_scanned: FORBIDDEN_KINDS, violations: [] };
}
