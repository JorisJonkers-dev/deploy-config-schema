import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  compileProject,
  renderManagedDeploymentContent,
  writeDeploymentFiles,
} from "../src/deployment/compiler.js";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "deployment-compiler-"));
}

const expectedCompilePaths = [
  "apps/agents/assistant-api/deployment.yaml",
  "apps/agents/assistant-api/hpa.yaml",
  "apps/agents/assistant-api/kustomization.yaml",
  "apps/agents/assistant-api/namespace.yaml",
  "apps/agents/assistant-api/pre-deploy-jobs.yaml",
  "apps/agents/assistant-api/serviceaccount.yaml",
  "apps/agents/assistant-api/servicemonitor.yaml",
  "apps/agents/kustomization.yaml",
  "apps/data/kustomization.yaml",
  "apps/data/platform-postgres/deployment.yaml",
  "apps/data/platform-postgres/kustomization.yaml",
  "apps/data/platform-postgres/namespace.yaml",
  "apps/edge/traefik-ingressroutes.yaml",
  "apps/observability/gatus/gatus-endpoints-configmap.yaml",
  "apps/vso-secrets/kustomization.yaml",
  "apps/vso-secrets/vault-auth.yaml",
  "apps/vso-secrets/vault-connection.yaml",
  "clusters/production/flux-system/gotk-sync.yaml",
  "clusters/production/kustomization.yaml",
  "clusters/production/kustomizations.yaml",
];

test("compileProject validates named inputs and renders implemented deployment files", () => {
  const result = compileProject({
    environment: "production",
    sourcesPath: "fixtures/deployment/deployment-sources.yml",
    lockPath: "fixtures/deployment/deployment.lock.yml",
    nodeContractPath: "fixtures/deployment/node-contract.lock.yml",
    reachabilityPath: "fixtures/deployment/reachability.yml",
    outDir: tempDir(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.files.map((file) => file.path), expectedCompilePaths);
});

test("compileProject reports schema diagnostics for named inputs", () => {
  const result = compileProject({
    environment: "production",
    sourcesPath: "fixtures/deployment/deployment.yml",
    lockPath: "fixtures/deployment/deployment.lock.yml",
    nodeContractPath: "fixtures/deployment/node-contract.lock.yml",
    reachabilityPath: "fixtures/deployment/reachability.yml",
    outDir: tempDir(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "E_SCHEMA"), true);
});

test("writeDeploymentFiles sorts output, writes deployment header, and supports check", () => {
  const out = tempDir();
  const files = [
    { path: "b.yaml", content: "b\n", adapter: "test" },
    { path: "a.yaml", content: "a\n", adapter: "test" },
  ];

  const written = writeDeploymentFiles(files, out);
  const checked = writeDeploymentFiles(files, out, { check: true });

  assert.deepEqual(written.map((result) => result.path), ["a.yaml", "b.yaml"]);
  assert.equal(readFileSync(join(out, "a.yaml"), "utf8"), renderManagedDeploymentContent(files[1]));
  assert.deepEqual(checked.map((result) => result.action), ["unchanged", "unchanged"]);
});

test("writeDeploymentFiles rejects unsafe paths", () => {
  assert.throws(
    () => writeDeploymentFiles([{ path: "../escape.yaml", content: "", adapter: "test" }], tempDir()),
    /unsafe render path/,
  );
});
