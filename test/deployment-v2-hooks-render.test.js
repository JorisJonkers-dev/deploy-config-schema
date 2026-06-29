import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { buildProjectModel } from "../src/deployment-v2/model.js";
import { loadYamlDocument } from "../src/deployment-v2/io.js";
import { renderHooks } from "../src/deployment-v2/render/hooks.js";
import { renderKubernetes } from "../src/deployment-v2/render/kubernetes.js";

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

test("renderHooks emits pre-deploy Jobs and Flux waits", () => {
  const result = renderHooks(fixtureModel());
  const job = docs(result.files[0].content)[0];

  assert.equal(result.files[0].path, "apps/agents/assistant-api/pre-deploy-jobs.yaml");
  assert.equal(job.kind, "Job");
  assert.equal(job.metadata.name, "assistant-api-migrate-db");
  assert.equal(job.spec.backoffLimit, 0);
  assert.equal(job.spec.template.spec.restartPolicy, "Never");
  assert.equal(job.spec.template.spec.serviceAccountName, "assistant-api");
  assert.deepEqual(result.waits, [{
    apiVersion: "batch/v1",
    kind: "Job",
    name: "assistant-api-migrate-db",
    namespace: "agents",
  }]);
});

test("renderKubernetes includes hook resources before workload resources", () => {
  const file = renderKubernetes(fixtureModel()).files.find((item) => item.path === "apps/agents/assistant-api/kustomization.yaml");
  const kustomization = docs(file.content)[0];

  assert.deepEqual(kustomization.resources.slice(0, 4), ["namespace.yaml", "serviceaccount.yaml", "pre-deploy-jobs.yaml", "deployment.yaml"]);
});

test("renderHooks carries workload env, secrets, placement, pull secrets, and latest annotations", () => {
  const model = fixtureModel();
  const workload = model.workloads["assistant-api"];
  workload.image = { ...workload.image, tag: "latest", ref: "ghcr.io/jorisjonkers-dev/assistant-api:latest", pullSecrets: ["registry"] };
  workload.config.values = { LOG_LEVEL: "debug" };
  workload.secrets = [{ name: "runtime", destinationSecretName: "assistant-runtime", envKeys: ["api-token"] }];
  workload.storage.volumes = [{ name: "cache", kind: "empty_dir" }];
  workload.storage.mounts = [{ volume: "cache", path: "/cache", readOnly: true }];
  workload.placement.nodeName = "k3s-01";
  workload.placement.nodeSelector = { disk: "fast" };
  workload.placement.tolerations = [{ key: "dedicated", operator: "Exists" }];
  workload.placement.topologySpread = ["hostname"];
  workload.hooks.pre = [{ name: "seed", env: { EXTRA: "1" }, command: ["node"], args: ["seed.js"] }];

  const job = docs(renderHooks(model).files[0].content)[0];
  const container = job.spec.template.spec.containers[0];

  assert.equal(job.metadata.annotations["keel.sh/policy"], "force");
  assert.deepEqual(job.spec.template.spec.imagePullSecrets, [{ name: "registry" }]);
  assert.equal(job.spec.template.spec.nodeSelector["kubernetes.io/hostname"], "k3s-01");
  assert.equal(job.spec.template.spec.nodeSelector.disk, "fast");
  assert.equal(job.spec.template.spec.tolerations[0].key, "dedicated");
  assert.equal(job.spec.template.spec.topologySpreadConstraints[0].topologyKey, "kubernetes.io/hostname");
  assert.deepEqual(container.command, ["node"]);
  assert.deepEqual(container.args, ["seed.js"]);
  assert.equal(container.env.some((entry) => entry.name === "API_TOKEN"), true);
  assert.deepEqual(container.volumeMounts, [{ name: "cache", mountPath: "/cache", readOnly: true }]);
});
