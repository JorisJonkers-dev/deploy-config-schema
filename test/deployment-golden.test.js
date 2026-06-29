import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runCli } from "../src/cli.js";
import { compileProject } from "../src/deployment/compiler.js";
import { importLiveFleet } from "../src/deployment/import/live-fleet.js";
import { compareParityTrees, normalizeParityTree } from "../src/deployment/parity.js";

const fleetPath = "test/fixtures/deployment/import/fleet.yaml";
const goldenFluxTree = "fixtures/deployment/golden/cluster/flux";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "deployment-golden-"));
}

function stream() {
  return {
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk));
      return true;
    },
    text() {
      return this.chunks.join("");
    },
  };
}

function streams() {
  return {
    stdout: stream(),
    stderr: stream(),
  };
}

test("imported live golden tree compiles through deployment and records honest parity subset", () => {
  const importedDir = tempDir();
  const renderedDir = tempDir();

  const imported = importLiveFleet({
    fleetPath,
    fluxTreePath: goldenFluxTree,
    outDir: importedDir,
    deploymentName: "imported-fleet",
    generatedAt: "2026-06-29T00:00:00.000Z",
    sourceSha: "1111111111111111111111111111111111111111",
  });
  assert.equal(imported.files.length, 9);

  const compiled = compileProject({
    environment: "production",
    sourcesPath: join(importedDir, "deployment-sources.yml"),
    lockPath: join(importedDir, "deployment.lock.yml"),
    nodeContractPath: join(importedDir, "inventory/node-contract.lock.yml"),
    reachabilityPath: join(importedDir, "catalog/reachability.yml"),
    deploymentPaths: [join(importedDir, "deployment.yml")],
    outDir: renderedDir,
  });
  assert.equal(compiled.ok, true);
  assert.deepEqual(compiled.diagnostics, []);
  assert(compiled.files.some((file) => file.path === "apps/stateless/web-api/deployment.yaml"));
  assert(compiled.files.some((file) => file.path === "apps/edge/traefik-ingressroutes.yaml"));
  assert(compiled.files.some((file) => file.path === "apps/vso-secrets/vault-auth.yaml"));
  assert(compiled.files.some((file) => file.path === "apps/observability/gatus/gatus-endpoints-configmap.yaml"));

  const report = compareParityTrees({ current: goldenFluxTree, rendered: renderedDir });
  assert.equal(report.ok, false);
  assert.deepEqual(report.summary, {
    currentObjects: 13,
    renderedObjects: 16,
    missing: 4,
    extra: 7,
    changed: 6,
    duplicates: 0,
  });
  assert.deepEqual(zeroDiffKeys(goldenFluxTree, report), [
    "autoscaling/v2/HorizontalPodAutoscaler/apps/web-api",
    "v1/ConfigMap/apps/web-api-config",
    "v1/PersistentVolumeClaim/apps/web-api-data",
  ]);
  assert.deepEqual(report.missing, [
    "_path/apps/stateless/kustomization.yaml#0",
    "kustomize.toolkit.fluxcd.io/v1/Kustomization/flux-system/apps-core",
    "kustomize.toolkit.fluxcd.io/v1/Kustomization/flux-system/apps-stateless",
    "networking.k8s.io/v1/NetworkPolicy/apps/web-api-ingress",
  ]);
  assert.deepEqual(report.extra, [
    "_path/apps/vso-secrets/kustomization.yaml#0",
    "secrets.hashicorp.com/v1beta1/VaultAuth/vso-secrets/vault-auth",
    "secrets.hashicorp.com/v1beta1/VaultConnection/vso-secrets/vault",
    "v1/ConfigMap/observability/gatus-endpoints",
    "v1/Namespace/_cluster/apps",
    "v1/ServiceAccount/apps/vault-secrets-operator",
    "v1/ServiceAccount/apps/web-api",
  ]);
  assert.deepEqual(report.changed.map((change) => change.key), [
    "_path/apps/stateless/web-api/kustomization.yaml#0",
    "apps/v1/Deployment/apps/web-api",
    "monitoring.coreos.com/v1/ServiceMonitor/apps/web-api",
    "secrets.hashicorp.com/v1beta1/VaultStaticSecret/apps/web-api-db",
    "traefik.io/v1alpha1/IngressRoute/edge/web-api",
    "v1/Service/apps/web-api",
  ]);
});

test("render-flux check detects drift in compiled deployment tree", async () => {
  const repo = tempDir();
  importLiveFleet({
    fleetPath,
    fluxTreePath: goldenFluxTree,
    outDir: repo,
    deploymentName: "imported-fleet",
  });

  const renderIo = streams();
  assert.equal(await runCli(["render-flux", "--repo", repo, "--env", "production"], renderIo), 0, renderIo.stderr.text());

  const cleanCheckIo = streams();
  assert.equal(await runCli(["render-flux", "--repo", repo, "--env", "production", "--check"], cleanCheckIo), 0, cleanCheckIo.stdout.text());

  const driftPath = join(repo, "cluster/flux/apps/stateless/web-api/deployment.yaml");
  writeFileSync(driftPath, `${readFileSync(driftPath, "utf8")}\n# drift\n`);

  const driftCheckIo = streams();
  assert.equal(await runCli(["render-flux", "--repo", repo, "--env", "production", "--check"], driftCheckIo), 1);
  assert.equal(JSON.parse(driftCheckIo.stdout.text()).ok, false);
});

function zeroDiffKeys(currentRoot, report) {
  const missing = new Set(report.missing);
  const changed = new Set(report.changed.map((change) => change.key));
  return [...normalizeParityTree(currentRoot).keys()]
    .filter((key) => !missing.has(key) && !changed.has(key))
    .sort();
}
