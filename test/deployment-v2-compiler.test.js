import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  compileProject,
  renderManagedDeployV2Content,
  writeDeployV2Files,
} from "../src/deployment-v2/compiler.js";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "deploy-v2-compiler-"));
}

const expectedCompilePaths = [
  "apps/agents/assistant-api/servicemonitor.yaml",
  "apps/edge/traefik-ingressroutes.yaml",
  "apps/observability/gatus/gatus-endpoints-configmap.yaml",
  "apps/vso-secrets/kustomization.yaml",
  "apps/vso-secrets/vault-auth.yaml",
  "apps/vso-secrets/vault-connection.yaml",
];

test("compileProject validates named inputs and renders B2 deployment-v2 files", () => {
  const result = compileProject({
    environment: "production",
    sourcesPath: "fixtures/deployment-v2/deployment-sources.yml",
    lockPath: "fixtures/deployment-v2/deployment.lock.yml",
    nodeContractPath: "fixtures/deployment-v2/node-contract.lock.yml",
    reachabilityPath: "fixtures/deployment-v2/reachability.yml",
    outDir: tempDir(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.files.map((file) => file.path), expectedCompilePaths);
});

test("compileProject reports schema diagnostics for named inputs", () => {
  const result = compileProject({
    environment: "production",
    sourcesPath: "fixtures/deployment-v2/deployment.yml",
    lockPath: "fixtures/deployment-v2/deployment.lock.yml",
    nodeContractPath: "fixtures/deployment-v2/node-contract.lock.yml",
    reachabilityPath: "fixtures/deployment-v2/reachability.yml",
    outDir: tempDir(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "E_SCHEMA"), true);
});

test("writeDeployV2Files sorts output, writes deploy-v2 header, and supports check", () => {
  const out = tempDir();
  const files = [
    { path: "b.yaml", content: "b\n", adapter: "test" },
    { path: "a.yaml", content: "a\n", adapter: "test" },
  ];

  const written = writeDeployV2Files(files, out);
  const checked = writeDeployV2Files(files, out, { check: true });

  assert.deepEqual(written.map((result) => result.path), ["a.yaml", "b.yaml"]);
  assert.equal(readFileSync(join(out, "a.yaml"), "utf8"), renderManagedDeployV2Content(files[1]));
  assert.deepEqual(checked.map((result) => result.action), ["unchanged", "unchanged"]);
});

test("writeDeployV2Files rejects unsafe paths", () => {
  assert.throws(
    () => writeDeployV2Files([{ path: "../escape.yaml", content: "", adapter: "test" }], tempDir()),
    /unsafe render path/,
  );
});
