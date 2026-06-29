import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertSafePath,
  loadYamlDocument,
  loadYamlDocuments,
  stringifyYamlDocument,
  writeYamlDocument,
} from "../src/deployment/io.js";

test("YAML IO loads single and multi-document files and writes YAML", () => {
  const dir = mkdtempSync(join(tmpdir(), "deployment-io-"));
  const path = join(dir, "document.yml");
  writeYamlDocument(path, { apiVersion: "v1", kind: "ConfigMap" });

  assert.equal(loadYamlDocument(path).kind, "ConfigMap");
  assert.equal(stringifyYamlDocument({ a: 1 }), "a: 1\n");
});

test("loadYamlDocuments drops empty YAML documents", () => {
  const dir = mkdtempSync(join(tmpdir(), "deployment-io-"));
  const path = join(dir, "documents.yml");
  writeYamlDocument(path, { one: true });
  appendFileSync(path, "---\n---\ntwo: true\n");

  assert.deepEqual(loadYamlDocuments(path), [{ one: true }, { two: true }]);
});

test("assertSafePath rejects escaping relative paths", () => {
  assert.throws(() => assertSafePath("../outside.yml"), /unsafe path escapes root/);
  assert.throws(() => assertSafePath("bad\0path.yml"), /NUL byte/);
});
