import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import YAML from "yaml";

export function loadYamlDocument(path: string): unknown {
  return YAML.parse(readFileSync(assertSafePath(path), "utf8"));
}

export function loadYamlDocuments(path: string): unknown[] {
  return YAML.parseAllDocuments(readFileSync(assertSafePath(path), "utf8")).map((document) => document.toJSON()).filter((document) => document !== null);
}

export function writeYamlDocument(path: string, value: unknown): void {
  const safePath = assertSafePath(path);
  mkdirSync(dirname(safePath), { recursive: true });
  writeFileSync(safePath, YAML.stringify(value, { lineWidth: 0 }));
}

export function assertSafePath(path: string, root = process.cwd()): string {
  if (path.includes("\0")) {
    throw new Error(`unsafe path contains NUL byte: ${path}`);
  }
  const resolved = isAbsolute(path) ? normalize(path) : resolve(root, path);
  if (!isAbsolute(path)) {
    const rel = relative(root, resolved);
    if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith(`..${"\\"}`)) {
      throw new Error(`unsafe path escapes root: ${path}`);
    }
  }
  return resolved;
}

export function stringifyYamlDocument(value: unknown): string {
  return YAML.stringify(value, { lineWidth: 0 });
}
