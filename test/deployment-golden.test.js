import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runCli } from "../src/cli.js";
import { compileProject } from "../src/deployment/compiler.js";
import { importLiveFleet } from "../src/deployment/import/live-fleet.js";
import { compareParityTrees } from "../src/deployment/parity.js";

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
    mode: "behavioral",
    currentObjects: 13,
    renderedObjects: 13,
    missing: 0,
    extra: 0,
    changed: 5,
    duplicates: 0,
    behaviorEquivalent: 13,
    behaviorPreservingDiffs: 5,
    behaviorChangingDiffs: 0,
    sourceBreakdown: {
      "model-rendered": 10,
      "pack-sourced": 1,
      "collection-sourced": 0,
      carried: 2,
    },
  });
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.extra, []);
  assert.deepEqual(report.comparisons.flatMap((comparison) => comparison.diffs.filter((diff) => diff.classification === "behavior-changing")), []);
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
    mode: "behavioral",
    currentObjects: 14,
    renderedObjects: 14,
    missing: 0,
    extra: 0,
    changed: 5,
    duplicates: 1,
    behaviorEquivalent: 14,
    behaviorPreservingDiffs: 5,
    behaviorChangingDiffs: 1,
    sourceBreakdown: {
      "model-rendered": 10,
      "pack-sourced": 1,
      "collection-sourced": 0,
      carried: 3,
    },
  });
  assert.deepEqual(report.duplicates, [{
    key: "v1/Namespace/_cluster/apps",
    paths: [
      "current/apps/duplicate/namespace.yaml#0",
      "current/apps/namespace.yaml#0",
    ],
  }]);
});
