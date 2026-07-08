import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

export const FORBIDDEN_KINDS = ["Secret", "ClusterRole", "ClusterRoleBinding", "CustomResourceDefinition", "Namespace"];

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

function listYamlFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (!stats.isDirectory()) {
    return /\.(ya?ml)$/i.test(root) ? [root] : [];
  }
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? listYamlFiles(path) : (/\.(ya?ml)$/i.test(path) ? [path] : []);
  }).sort();
}

export function validateRawManifests(rawDir: string): RawManifestsGuard {
  const present = existsSync(rawDir);
  if (!present) {
    return {
      present: false,
      forbidden_kinds_scanned: FORBIDDEN_KINDS,
      violations: [],
    };
  }
  const files = listYamlFiles(rawDir);
  const violations: ViolationEntry[] = [];
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const docs = YAML.parseAllDocuments(content);
    let lineOffset = 0;
    for (const doc of docs) {
      const obj = doc.toJS() as Record<string, unknown> | null;
      if (!obj || typeof obj !== "object") continue;
      const kind = obj["kind"] as string | undefined;
      if (kind && FORBIDDEN_KINDS.includes(kind)) {
        violations.push({
          kind,
          filename: file,
          line: lineOffset + 1,
          reason: `forbidden kind: ${kind}`,
        });
      }
    }
  }
  return {
    present: true,
    forbidden_kinds_scanned: FORBIDDEN_KINDS,
    violations,
  };
}
