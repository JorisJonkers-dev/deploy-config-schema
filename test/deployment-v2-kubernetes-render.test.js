import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderKubernetes as renderV1Kubernetes } from "../src/adapters/kubernetes.js";
import { buildProjectModel, projectModelToAdapterContext } from "../src/deployment-v2/model.js";
import { loadYamlDocument } from "../src/deployment-v2/io.js";
import { renderKubernetes } from "../src/deployment-v2/render/kubernetes.js";
import { renderWorkloads } from "../src/deployment-v2/render/workloads.js";

const fixture = (name) => `fixtures/deployment-v2/${name}`;

function fixtureModel() {
  return buildProjectModel({
    environment: "production",
    sources: loadYamlDocument(fixture("deployment-sources.yml")).spec,
    lock: loadYamlDocument(fixture("deployment.lock.yml")),
    nodeContract: loadYamlDocument(fixture("node-contract.lock.yml")),
    reachability: loadYamlDocument(fixture("reachability.yml")),
    deployments: [loadYamlDocument(fixture("deployment.yml"))],
    collections: [loadYamlDocument(fixture("collection.yml"))],
    envFiles: {},
  });
}

function docs(content) {
  return YAML.parseAllDocuments(content).map((document) => document.toJSON());
}

function file(files, path) {
  return files.find((item) => item.path === path);
}

function baseWorkload(name, overrides = {}) {
  return {
    name,
    deploymentName: name,
    group: "apps",
    namespace: "apps",
    kind: "deployment",
    image: { repository: `example/${name}`, tag: "1.0.0", ref: `example/${name}:1.0.0`, pullSecrets: [], updateEligible: true },
    containers: [{ name, ports: [], env: {}, envFromSecrets: [], volumeMounts: [] }],
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

function modelWith(workloads) {
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
    workloads: Object.fromEntries(workloads.map((workload) => [workload.name, workload])),
    routes: [],
    providerGraph: { data: {}, messaging: {}, credentials: [], vault: {} },
    flux: { source: {}, root: {}, layers: [], packs: {} },
    adapterArtifacts: {},
  };
}

test("renderKubernetes mirrors v1 workload output for deployment fixture", () => {
  const model = fixtureModel();
  for (const workload of Object.values(model.workloads)) {
    workload.hooks.pre = [];
    workload.observability.status = [];
  }
  for (const service of Object.values(model.adapterArtifacts["service-intent"].services)) {
    service.gatus.endpoints = [];
  }

  const isB2File = (item) => item.path.endsWith("servicemonitor.yaml") || item.path.endsWith("podmonitor.yaml");
  const v1Files = renderV1Kubernetes(projectModelToAdapterContext(model)).filter((item) => !isB2File(item));
  const v2Files = renderKubernetes(model).files.filter((item) => !isB2File(item));

  assert.deepEqual(v2Files, v1Files);
  assert.deepEqual(docs(file(v2Files, "apps/agents/assistant-api/deployment.yaml").content).map((document) => document.kind), ["Deployment"]);
  assert.deepEqual(
    docs(file(v2Files, "apps/agents/assistant-api/kustomization.yaml").content)[0].resources,
    ["namespace.yaml", "serviceaccount.yaml", "deployment.yaml", "hpa.yaml", "servicemonitor.yaml"],
  );
});

test("renderKubernetes rejects raw Secret data and inline secret material", () => {
  const model = fixtureModel();
  model.workloads["assistant-api"].rawManifests = [{
    apiVersion: "v1",
    kind: "Secret",
    metadata: { name: "bad" },
    stringData: { token: "plaintext" },
  }];
  assert.throws(() => renderKubernetes(model), /contains Secret data/);

  const secretModel = fixtureModel();
  secretModel.workloads["assistant-api"].secrets = [{ name: "api", destinationSecretName: "api", envKeys: [], value: "plaintext" }];
  assert.throws(() => renderKubernetes(secretModel), /contains secret material/);
});

test("renderKubernetes covers workload variants, probes, raw manifests, and policies", () => {
  const web = baseWorkload("web", {
    image: { repository: "example/web", tag: "latest", ref: "example/web:latest", pullSecrets: [], updateEligible: true },
    replicas: 2,
    service: {
      name: "web",
      annotations: { "service.beta.kubernetes.io/test": "true" },
      ports: [{ name: "http", containerPort: 8080, servicePort: 80, protocol: "TCP" }],
    },
    containers: [{
      name: "web",
      command: ["node"],
      args: ["server.js"],
      ports: [{ name: "http", containerPort: 8080, servicePort: 80, protocol: "TCP" }],
      env: { FEATURE_FLAG: "on" },
      envFromSecrets: [{ name: "web-runtime", optional: true }],
      resources: { requests: { cpu: "100m" }, limits: { memory: "256Mi" } },
      volumeMounts: [],
      probes: { startup: { httpGet: { path: "/startup", port: "http" } } },
    }],
    initContainers: [{ name: "prepare", image: { repository: "example/prepare", tag: "1.0.0", ref: "example/prepare:1.0.0", pullSecrets: [], updateEligible: true }, command: ["sh"], args: ["-c", "true"], ports: [], env: {}, envFromSecrets: [], volumeMounts: [] }],
    sidecars: [{ name: "metrics", image: { repository: "example/metrics", tag: "latest", ref: "example/metrics:latest", pullSecrets: [], updateEligible: true }, args: ["scrape"], ports: [], env: { SCRAPE: "true" }, envFromSecrets: [], volumeMounts: [] }],
    config: { values: { LOG_LEVEL: "debug" }, files: { "app.conf": "port=8080" } },
    secrets: [{ name: "runtime", destinationSecretName: "web-runtime", envKeys: ["api-key"] }],
    storage: { volumes: [{ name: "cache", kind: "empty_dir" }], mounts: [{ volume: "cache", path: "/cache" }], tiers: {} },
    placement: { site: "edge", nodeSelector: {}, requiredCapabilities: ["web"], tolerations: [], topologySpread: ["hostname"] },
    rollout: { strategy: "recreate", pdbMinAvailable: 1, maxUnavailable: 0 },
    rawManifests: [
      { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "extra" }, data: { enabled: "true" } },
      { apiVersion: "v1", kind: "Namespace", metadata: { name: "external" } },
    ],
  });
  const worker = baseWorkload("worker", {
    kind: "job",
    restartPolicy: "Never",
    containers: [{ name: "worker", ports: [], env: {}, envFromSecrets: [], volumeMounts: [], probes: { importedHealth: { type: "tcp", port: "metrics" } } }],
  });
  const sweep = baseWorkload("sweep", { kind: "cronjob", schedule: "*/5 * * * *", restartPolicy: "OnFailure" });
  const external = baseWorkload("external", {
    kind: "external_service",
    service: { name: "external", annotations: {}, ports: [{ name: "http", containerPort: 8080, servicePort: 80 }] },
  });
  const model = modelWith([web, worker, sweep, external]);
  const files = renderKubernetes(model).files;
  const deploymentDocs = docs(file(files, "apps/apps/web/deployment.yaml").content);
  const deployment = deploymentDocs[0];
  const service = deploymentDocs[1];
  const raw = docs(file(files, "apps/apps/web/raw.yaml").content);

  assert.equal(renderWorkloads(model).files.length, 4);
  assert.equal(deployment.metadata.annotations["keel.sh/policy"], "force");
  assert.equal(deployment.spec.strategy.type, "Recreate");
  assert.equal(deployment.spec.progressDeadlineSeconds, 600);
  assert.equal(deployment.spec.template.spec.initContainers[0].command[0], "sh");
  assert.equal(deployment.spec.template.spec.containers[1].imagePullPolicy, "Always");
  assert.deepEqual(deployment.spec.template.spec.containers[0].envFrom, [{ secretRef: { name: "web-runtime", optional: true } }]);
  assert.equal(deployment.spec.template.spec.containers[0].startupProbe.httpGet.path, "/startup");
  assert.equal(deployment.spec.template.spec.containers[0].resources.requests.cpu, "100m");
  assert.equal(deployment.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0].matchExpressions[0].key, "personal-stack/site");
  assert.equal(deployment.spec.template.spec.topologySpreadConstraints[0].topologyKey, "kubernetes.io/hostname");
  assert.equal(service.metadata.annotations["service.beta.kubernetes.io/test"], "true");
  assert.equal(docs(file(files, "apps/apps/web/configmap.yaml").content)[0].data["app.conf"], "port=8080");
  assert.equal(docs(file(files, "apps/apps/web/pdb.yaml").content)[0].spec.minAvailable, 1);
  assert.equal(raw[0].metadata.namespace, "apps");
  assert.equal(raw[1].metadata.namespace, undefined);
  assert.equal(docs(file(files, "apps/apps/worker/job.yaml").content)[0].spec.template.spec.restartPolicy, "Never");
  assert.equal(docs(file(files, "apps/apps/sweep/cronjob.yaml").content)[0].spec.schedule, "*/5 * * * *");
  assert.equal(docs(file(files, "apps/apps/external/deployment.yaml").content)[0].kind, "Service");
});
