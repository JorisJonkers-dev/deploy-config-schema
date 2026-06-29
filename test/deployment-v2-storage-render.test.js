import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderKubernetes } from "../src/deployment-v2/render/kubernetes.js";
import { renderStorage } from "../src/deployment-v2/render/storage.js";

function docs(content) {
  return YAML.parseAllDocuments(content).map((document) => document.toJSON());
}

function baseModel(workload) {
  return {
    apiVersion: "deployment.jorisjonkers.dev/ir/v1",
    environment: "production",
    renderMode: "parity",
    cluster: { name: "personal-stack", publicDomain: "example.com", gitopsRoot: "cluster/flux", appsRoot: "apps", clusterRoot: "clusters/production", fluxEnvironment: "production", interval: "10m" },
    sources: { environments: ["production"], firstParty: {}, collections: {}, policies: {} },
    lock: { metadata: { generatedAt: "2026-06-29T00:00:00.000Z" }, inputs: { firstParty: {}, collections: {}, charts: {}, images: {} } },
    nodeContract: { metadata: { sourceSha: "test" }, nodes: {} },
    reachability: { channels: {} },
    collections: {},
    deployments: {},
    workloads: { [workload.name]: workload },
    routes: [],
    providerGraph: { data: {}, messaging: {}, credentials: [], vault: {} },
    flux: { source: {}, root: {}, layers: [], packs: {} },
    adapterArtifacts: {},
  };
}

function workload(overrides = {}) {
  return {
    name: "api",
    deploymentName: "api",
    group: "stateless",
    namespace: "default",
    kind: "deployment",
    image: { repository: "example/api", tag: "1.0.0", ref: "example/api:1.0.0", pullSecrets: [], updateEligible: true },
    containers: [{ name: "api", ports: [], env: {}, envFromSecrets: [], volumeMounts: [] }],
    initContainers: [],
    sidecars: [],
    config: { values: {}, files: {} },
    secrets: [],
    credentials: [],
    storage: { volumes: [], mounts: [], tiers: {} },
    placement: { nodeSelector: {}, requiredCapabilities: [], tolerations: [], topologySpread: [] },
    probes: {},
    observability: { status: [], metrics: [] },
    hooks: { pre: [] },
    rollout: {},
    rawManifests: [],
    ...overrides,
  };
}

test("renderStorage emits PVCs and hostPath PV/PVC pairs with v1 names", () => {
  const model = baseModel(workload({
    storage: {
      tiers: { fast: { storageClassName: "longhorn-fast" } },
      volumes: [
        { name: "data", kind: "persistent", size: "10Gi", tier: "fast" },
        { name: "uploads", kind: "host_path", size: "20Gi", hostPath: "/srv/uploads" },
      ],
      mounts: [{ volume: "data", path: "/data" }, { volume: "uploads", path: "/uploads" }],
    },
    placement: { nodeName: "node-1", nodeSelector: {}, requiredCapabilities: [], tolerations: [], topologySpread: [] },
  }));

  const [file] = renderStorage(model).files;
  const rendered = docs(file.content);

  assert.equal(file.path, "apps/stateless/api/pvc.yaml");
  assert.equal(rendered[0].metadata.name, "api-data");
  assert.equal(rendered[0].spec.storageClassName, "longhorn-fast");
  assert.equal(rendered[1].kind, "PersistentVolume");
  assert.equal(rendered[1].spec.hostPath.path, "/srv/uploads");
  assert.equal(rendered[1].spec.nodeAffinity.required.nodeSelectorTerms[0].matchExpressions[0].values[0], "node-1");
  assert.equal(rendered[2].spec.volumeName, "api-uploads");
});

test("renderStorage supports StatefulSet claim templates and validates unsafe storage", () => {
  const stateful = workload({
    kind: "statefulset",
    service: { name: "api", annotations: {}, ports: [] },
    storage: {
      volumes: [{ name: "data", kind: "persistent", size: "5Gi", statefulTemplate: true }],
      mounts: [{ volume: "data", path: "/var/lib/api" }],
      tiers: {},
    },
  });
  const statefulSet = docs(renderKubernetes(baseModel(stateful)).files.find((item) => item.path.endsWith("statefulset.yaml")).content)[0];
  assert.equal(statefulSet.spec.volumeClaimTemplates[0].metadata.name, "api-data");
  assert.equal(statefulSet.spec.volumeClaimTemplates[0].spec.resources.requests.storage, "5Gi");

  assert.throws(
    () => renderStorage(baseModel(workload({ storage: { volumes: [], mounts: [{ volume: "missing", path: "/data" }], tiers: {} } }))),
    /references undeclared volume missing/,
  );
  assert.throws(
    () => renderStorage(baseModel(workload({ storage: { volumes: [{ name: "data", kind: "host_path", hostPath: "/srv/data" }], mounts: [], tiers: {} } }))),
    /host_path volume data requires/,
  );
});
