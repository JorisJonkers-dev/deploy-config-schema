import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

test("imported live golden tree compiles through deployment with classified parity files", () => {
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
  assert.deepEqual(compiled.files.map((file) => file.path), [
    "apps/edge/traefik-ingressroutes.yaml",
    "apps/stateless/kustomization.yaml",
    "apps/stateless/web-api/kustomization.yaml",
    "apps/stateless/web-api/workload.yaml",
    "clusters/production/kustomizations.yaml",
  ]);

  const report = compareParityTrees({ current: goldenFluxTree, rendered: renderedDir });
  assert.equal(report.ok, true);
  assert.deepEqual(report.summary, {
    currentObjects: 13,
    renderedObjects: 13,
    missing: 0,
    extra: 0,
    changed: 0,
    duplicates: 0,
  });
  assert.deepEqual(zeroDiffKeys(goldenFluxTree, report), [
    "_path/apps/stateless/kustomization.yaml#0",
    "_path/apps/stateless/web-api/kustomization.yaml#0",
    "apps/v1/Deployment/apps/web-api",
    "autoscaling/v2/HorizontalPodAutoscaler/apps/web-api",
    "kustomize.toolkit.fluxcd.io/v1/Kustomization/flux-system/apps-core",
    "kustomize.toolkit.fluxcd.io/v1/Kustomization/flux-system/apps-stateless",
    "monitoring.coreos.com/v1/ServiceMonitor/apps/web-api",
    "networking.k8s.io/v1/NetworkPolicy/apps/web-api-ingress",
    "secrets.hashicorp.com/v1beta1/VaultStaticSecret/apps/web-api-db",
    "traefik.io/v1alpha1/IngressRoute/edge/web-api",
    "v1/ConfigMap/apps/web-api-config",
    "v1/PersistentVolumeClaim/apps/web-api-data",
    "v1/Service/apps/web-api",
  ]);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.extra, []);
  assert.deepEqual(report.changed, []);
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

  const driftPath = join(repo, "cluster/flux/apps/stateless/web-api/workload.yaml");
  writeFileSync(driftPath, `${readFileSync(driftPath, "utf8")}\n# drift\n`);

  const driftCheckIo = streams();
  assert.equal(await runCli(["render-flux", "--repo", repo, "--env", "production", "--check"], driftCheckIo), 1);
  assert.equal(JSON.parse(driftCheckIo.stdout.text()).ok, false);
});

test("imported parity compile de-duplicates repeated current object identities in rendered files", () => {
  const current = tempDir();
  cpSync(goldenFluxTree, current, { recursive: true });
  mkdirSync(join(current, "apps", "duplicate"), { recursive: true });
  const namespace = [
    "apiVersion: v1",
    "kind: Namespace",
    "metadata:",
    "  name: apps",
    "",
  ].join("\n");
  writeFileSync(join(current, "apps", "namespace.yaml"), namespace);
  writeFileSync(join(current, "apps", "duplicate", "namespace.yaml"), namespace);

  const importedDir = tempDir();
  const renderedDir = tempDir();
  importLiveFleet({
    fleetPath,
    fluxTreePath: current,
    outDir: importedDir,
    deploymentName: "imported-fleet",
  });

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
  const report = compareParityTrees({ current, rendered: renderedDir });
  assert.deepEqual(report.summary, {
    currentObjects: 14,
    renderedObjects: 14,
    missing: 0,
    extra: 0,
    changed: 0,
    duplicates: 1,
  });
  assert.deepEqual(report.duplicates, [{
    key: "v1/Namespace/_cluster/apps",
    paths: [
      "current/apps/duplicate/namespace.yaml#0",
      "current/apps/namespace.yaml#0",
    ],
  }]);
});

function zeroDiffKeys(currentRoot, report) {
  const missing = new Set(report.missing);
  const changed = new Set(report.changed.map((change) => change.key));
  return [...normalizeParityTree(currentRoot).keys()]
    .filter((key) => !missing.has(key) && !changed.has(key))
    .sort();
}
