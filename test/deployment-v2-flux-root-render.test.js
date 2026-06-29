import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { loadYamlDocument } from "../src/deployment-v2/io.js";
import { buildProjectModel } from "../src/deployment-v2/model.js";
import { renderFluxRoot } from "../src/deployment-v2/render/flux-root.js";

const fixture = (name) => `fixtures/deployment-v2/${name}`;

function baseModel() {
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

function file(files, path) {
  const match = files.find((entry) => entry.path === path);
  assert.ok(match, `expected ${path}`);
  return match;
}

function documents(content) {
  return YAML.parseAllDocuments(content).map((document) => document.toJSON());
}

test("renderFluxRoot renders root sync and preserves explicit layer graph", () => {
  const model = baseModel();
  model.flux.source = {
    url: "ssh://git@example.test/platform.git",
    branch: "deploy-v2",
    secretRefName: "flux-system",
  };
  model.flux.layers = [
    { name: "apps-core", path: "core", dependsOn: [], wait: true, timeout: "15m", healthChecks: [] },
    { name: "apps-agents", path: "apps/agents", dependsOn: ["apps-core"], healthChecks: [] },
  ];

  const files = renderFluxRoot(model, []).files;
  const root = file(files, "clusters/production/kustomization.yaml");
  const sync = documents(file(files, "clusters/production/flux-system/gotk-sync.yaml").content);
  const layerDocs = documents(file(files, "clusters/production/kustomizations.yaml").content);

  assert.equal(root.content, [
    "apiVersion: kustomize.config.k8s.io/v1beta1",
    "kind: Kustomization",
    "resources:",
    "  - flux-system",
    "  - kustomizations.yaml",
  ].join("\n"));
  assert.deepEqual(sync.map((doc) => [doc.kind, doc.metadata.name, doc.metadata.namespace]), [
    ["GitRepository", "flux-system", "flux-system"],
    ["Kustomization", "flux-system", "flux-system"],
  ]);
  assert.equal(sync[0].spec.url, "ssh://git@example.test/platform.git");
  assert.equal(sync[0].spec.ref.branch, "deploy-v2");
  assert.equal(sync[1].spec.path, "./clusters/production");
  assert.deepEqual(layerDocs.map((doc) => doc.metadata.name), ["apps-core", "apps-agents"]);
  assert.equal(layerDocs[0].spec.path, "./cluster/flux/apps/core");
  assert.equal(layerDocs[1].spec.path, "./cluster/flux/apps/agents");
  assert.deepEqual(layerDocs[1].spec.dependsOn, [{ name: "apps-core" }]);
});

test("renderFluxRoot adds hook waits to the owning layer health checks", () => {
  const model = baseModel();
  model.flux.layers = [
    { name: "apps-core", path: "core", dependsOn: [], healthChecks: [] },
    { name: "apps-agents", path: "agents", dependsOn: ["apps-core"], healthChecks: [] },
  ];

  const files = renderFluxRoot(model, [{
    apiVersion: "batch/v1",
    kind: "Job",
    name: "assistant-api-migrate-db",
    namespace: "agents",
  }]).files;
  const layerDocs = documents(file(files, "clusters/production/kustomizations.yaml").content);
  const agents = layerDocs.find((doc) => doc.metadata.name === "apps-agents");

  assert.equal(agents.spec.wait, true);
  assert.deepEqual(agents.spec.healthChecks, [{
    apiVersion: "batch/v1",
    kind: "Job",
    name: "assistant-api-migrate-db",
    namespace: "agents",
  }]);
});
