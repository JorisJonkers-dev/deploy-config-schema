import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import YAML from "yaml";
import { validateArtifact } from "../src/artifact-validator.js";
import { compileProject } from "../src/deployment-v2/compiler.js";
import { importFleetV1 } from "../src/deployment-v2/import/fleet-v1.js";

const fixtureRoot = "test/fixtures/deployment-v2";
const importRoot = `${fixtureRoot}/import`;
const goldenRoot = `${fixtureRoot}/golden/imported`;

function options(outDir) {
  return {
    fleetPath: `${importRoot}/fleet.yaml`,
    fluxTreePath: `${importRoot}/flux-tree`,
    outDir,
    deploymentName: "imported-fleet",
    generatedAt: "2026-06-29T00:00:00.000Z",
    sourceSha: "1111111111111111111111111111111111111111",
  };
}

test("importFleetV1 writes schema-compatible v2 sources that match golden files", () => {
  const outDir = mkdtempSync(join(tmpdir(), "deploy-v2-import-"));
  const result = importFleetV1(options(outDir));
  const paths = listFiles(goldenRoot);

  assert.deepEqual(result.files.map((file) => file.path), paths);
  for (const path of paths) {
    assert.equal(readFileSync(join(outDir, path), "utf8"), readFileSync(join(goldenRoot, path), "utf8"), path);
  }

  assertValid("deployment-v2", join(outDir, "deployment.yml"));
  assertValid("deployment-sources-v1", join(outDir, "deployment-sources.yml"));
  assertValid("deployment-lock-v1", join(outDir, "deployment.lock.yml"));
  assertValid("node-contract-v1", join(outDir, "inventory/node-contract.lock.yml"));
  assertValid("reachability-v1", join(outDir, "catalog/reachability.yml"));

  const compiled = compileProject({
    environment: "production",
    sourcesPath: join(outDir, "deployment-sources.yml"),
    lockPath: join(outDir, "deployment.lock.yml"),
    nodeContractPath: join(outDir, "inventory/node-contract.lock.yml"),
    reachabilityPath: join(outDir, "catalog/reachability.yml"),
    deploymentPaths: [join(outDir, "deployment.yml")],
    outDir: mkdtempSync(join(tmpdir(), "deploy-v2-compile-")),
  });
  assert.equal(compiled.ok, true);
  assert.deepEqual(compiled.diagnostics, []);
});

test("importFleetV1 imports fleet intent, workload details, Flux layers, and parity objects", () => {
  const result = importFleetV1(options());
  const workload = result.model.workloads["web-api"];

  assert.equal(workload.group, "stateless");
  assert.equal(workload.namespace, "apps");
  assert.equal(workload.image.ref, "ghcr.io/example/web-api:v1.0.0");
  assert.equal(workload.replicas, 2);
  assert.deepEqual(workload.service?.ports, [{ name: "http", containerPort: 8080, servicePort: 80, protocol: "TCP" }]);
  assert.equal(workload.storage.volumes[0].size, "5Gi");
  assert.deepEqual(workload.secrets, [{ name: "web-api-db", destinationSecretName: "web-api-db", envKeys: ["uri"] }]);
  assert.equal(workload.autoscaling?.targetCpuUtilization, 70);
  assert.equal(workload.observability.status[0].url, "http://web-api.apps.svc.cluster.local:80/healthz");
  assert.deepEqual(workload.observability.metrics, [{ kind: "ServiceMonitor", port: "http", path: "/metrics", interval: "30s" }]);
  assert.deepEqual(result.model.routes.map((route) => ({
    ...route,
    rules: route.rules.map(({ priority, ...rule }) => rule),
  })), [{
    name: "web-api",
    serviceName: "web-api",
    host: "api.example.test",
    tier: "public-frankfurt",
    authScope: "application",
    rules: [{ path: "/api", operation: "prefix", port: "http", middleware: [] }],
  }]);
  assert.deepEqual(result.model.flux.layers.map(({ name, path, dependsOn, wait, timeout }) => ({ name, path, dependsOn, wait, timeout })), [
    { name: "apps-core", path: "./cluster/flux/apps/core", dependsOn: [], wait: true, timeout: "15m" },
    { name: "apps-stateless", path: "./cluster/flux/apps/stateless", dependsOn: ["apps-core"], wait: undefined, timeout: undefined },
  ]);
  assert.equal(result.model.parityImports.networkPolicies.length, 1);
  assert.equal(result.model.parityImports.extraObjects.length, 2);
  assert.equal(result.model.parityImports.existingFiles.length, 5);
  assert.equal(workload.importedParity.networkPolicies.length, 1);
});

test("importFleetV1 falls back to Kubernetes service discovery and defaults optional inputs", () => {
  const root = mkdtempSync(join(tmpdir(), "deploy-v2-import-fallback-"));
  const fluxTree = join(root, "flux-tree");
  mkdirSync(fluxTree, { recursive: true });
  writeFileSync(join(root, "fleet.yaml"), YAML.stringify({
    cluster: { public_domain: "example.test" },
    nodes: { node1: { status: "active", site: "default", arch: "arm64" } },
    exposure_intent: { lan_only: ["fallback-lan"], internal_only: ["internal-only"] },
    access_intent: { host_labels: { "fallback-lan": "root" } },
    ingress_intent: { kubernetes_backends: { "fallback-lan": { namespace: "fallback", service: "fallback-lan", port: 8080 } } },
  }));
  writeFileSync(join(fluxTree, "services.yaml"), [
    "apiVersion: v1",
    "kind: Service",
    "metadata:",
    "  name: fallback-lan",
    "  namespace: fallback",
    "spec:",
    "  ports:",
    "    - name: web",
    "      port: 8080",
    "---",
    "apiVersion: v1",
    "kind: Service",
    "metadata:",
    "  name: internal-only",
    "  namespace: fallback",
    "spec:",
    "  ports:",
    "    - name: web",
    "      port: 9090",
    "",
  ].join("\n"));

  const result = importFleetV1({ fleetPath: join(root, "fleet.yaml"), fluxTreePath: fluxTree });

  assert.equal(result.documents.deployment.metadata.name, "imported-fleet");
  assert.equal(result.documents.lock.metadata.generatedAt, "1970-01-01T00:00:00.000Z");
  assert.equal(result.documents.nodeContract.metadata.sourceSha, "0000000000000000000000000000000000000000");
  assert.deepEqual(Object.keys(result.model.workloads).sort(), ["fallback-lan", "internal-only"]);
  assert.equal(result.model.workloads["fallback-lan"].group, "stateless");
  assert.equal(result.model.workloads["fallback-lan"].image.ref, "ghcr.io/jorisjonkers-dev/import-placeholder:latest");
  assert.deepEqual(result.model.routes.map((route) => ({
    name: route.name,
    host: route.host,
    tier: route.tier,
    authScope: route.authScope,
    rules: route.rules.map(({ priority, ...rule }) => rule),
  })), [{
    name: "fallback-lan",
    host: "example.test",
    tier: "lan",
    authScope: "anonymous",
    rules: [{ path: "/", operation: "prefix", port: "web", middleware: [] }],
  }]);
  assert.equal(result.model.parityImports.networkPolicies.length, 0);
  assert.equal(result.model.workloads["fallback-lan"].importedParity, undefined);
});

function assertValid(kind, path) {
  const validation = validateArtifact(kind, YAML.parse(readFileSync(path, "utf8")));
  assert.equal(validation.valid, true, `${path}: ${JSON.stringify(validation.diagnostics)}`);
}

function listFiles(root, base = root) {
  if (!existsSync(root)) return [];
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? listFiles(path, base) : [relative(base, path).replaceAll("\\", "/")];
  }).sort();
}
