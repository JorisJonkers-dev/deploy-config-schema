import assert from "node:assert/strict";
import { test } from "node:test";
import { loadYamlDocument } from "../src/deployment/io.js";
import {
  buildProjectModel,
  projectModelToAdapterContext,
  validateProjectModel,
} from "../src/deployment/model.js";

const fixture = (name) => `fixtures/deployment/${name}`;

function input(overrides = {}) {
  return {
    environment: "production",
    sources: loadYamlDocument(fixture("deployment-sources.yml")).spec,
    lock: loadYamlDocument(fixture("deployment.lock.yml")),
    nodeContract: loadYamlDocument(fixture("node-contract.lock.yml")),
    reachability: loadYamlDocument(fixture("reachability.yml")),
    deployments: [loadYamlDocument(fixture("deployment.yml"))],
    collections: [loadYamlDocument(fixture("collection.yml"))],
    envFiles: {},
    ...overrides,
  };
}

function assertBuildDiagnostics(overrides, expectedCodes) {
  assert.throws(
    () => buildProjectModel(input(overrides)),
    (error) => {
      assert.deepEqual(error.diagnostics.map((diagnostic) => diagnostic.code), expectedCodes);
      return true;
    },
  );
}

test("buildProjectModel parses fixture IR and exposes current adapter artifacts", () => {
  const model = buildProjectModel(input());
  const context = projectModelToAdapterContext(model);

  assert.equal(model.apiVersion, "deployment.jorisjonkers.dev/ir");
  assert.deepEqual(Object.keys(model.workloads).sort(), ["assistant-api", "platform-postgres"]);
  assert.equal(context.artifacts["deploy-config"].cluster.name, "homelab");
  assert.equal(context.artifacts["service-intent"].services["assistant-api"].image.repository, "ghcr.io/jorisjonkers-dev/assistant-api");
  assert.equal(context.artifacts.platform.gitops.root, "cluster/flux");
});

test("ProjectModel validation rejects duplicate workloads", () => {
  const deployment = loadYamlDocument(fixture("deployment.yml"));
  const duplicate = structuredClone(deployment);
  duplicate.metadata.name = "assistant-copy";

  assertBuildDiagnostics({ deployments: [deployment, duplicate] }, ["E_WORKLOAD_DUPLICATE"]);
});

test("ProjectModel validation rejects unresolved route ports", () => {
  const deployment = loadYamlDocument(fixture("deployment.yml"));
  deployment.spec.workloads["assistant-api"].routes[0].rules[0].port = "missing";

  assertBuildDiagnostics({ deployments: [deployment] }, ["E_ROUTE_PORT_UNKNOWN"]);
});

test("ProjectModel validation rejects missing locked images", () => {
  const lock = loadYamlDocument(fixture("deployment.lock.yml"));
  lock.inputs.firstParty["assistant-api"].images = [];

  assertBuildDiagnostics({ lock }, ["E_IMAGE_LOCK_MISSING", "E_IMAGE_LOCK_MISSING"]);
});

test("ProjectModel validation rejects impossible placement", () => {
  const deployment = loadYamlDocument(fixture("deployment.yml"));
  deployment.spec.workloads["assistant-api"].placement.requiredCapabilities = ["gpu"];

  assertBuildDiagnostics({ deployments: [deployment] }, ["E_PLACEMENT_UNSATISFIABLE"]);
});

test("ProjectModel resolves GPU memory placement from node contract GPUs", () => {
  const deployment = loadYamlDocument(fixture("deployment.yml"));
  deployment.spec.workloads["assistant-api"].placement.gpu = {
    count: 1,
    vendor: "nvidia",
    class: "transcode",
    minMemoryMiB: 6144,
  };
  const nodeContract = loadYamlDocument(fixture("node-contract.lock.yml"));
  nodeContract.nodes["k3s-01"].gpus = [{
    vendor: "nvidia",
    model: "t1000",
    class: "transcode",
    memoryMiB: 8192,
    count: 1,
    resourceName: "nvidia.com/gpu",
  }];

  const model = buildProjectModel(input({ deployments: [deployment], nodeContract }));

  assert.deepEqual(model.workloads["assistant-api"].placement.eligibleNodeNames, ["k3s-01"]);
  assert.equal(model.workloads["assistant-api"].placement.gpuResourceName, "nvidia.com/gpu");
});

test("ProjectModel validation rejects unsatisfied GPU memory placement at placement.gpu", () => {
  const deployment = loadYamlDocument(fixture("deployment.yml"));
  deployment.spec.workloads["assistant-api"].placement.gpu = {
    count: 1,
    vendor: "nvidia",
    minMemoryMiB: 24576,
  };
  const nodeContract = loadYamlDocument(fixture("node-contract.lock.yml"));
  nodeContract.nodes["k3s-01"].gpus = [{
    vendor: "nvidia",
    model: "t1000",
    class: "transcode",
    memoryMiB: 8192,
    count: 1,
    resourceName: "nvidia.com/gpu",
  }];

  assert.throws(
    () => buildProjectModel(input({ deployments: [deployment], nodeContract })),
    (error) => {
      assert.deepEqual(error.diagnostics, [{
        code: "E_PLACEMENT_UNSATISFIABLE",
        message: "workload assistant-api placement cannot match any active schedulable node",
        path: "/workloads/assistant-api/placement/gpu",
      }]);
      return true;
    },
  );
});

test("ProjectModel validation rejects inline secret material", () => {
  const deployment = loadYamlDocument(fixture("deployment.yml"));
  deployment.spec.workloads["assistant-api"].env = { PASSWORD: "super-secret" };

  assert.throws(
    () => buildProjectModel(input({ deployments: [deployment] })),
    (error) => {
      assert.equal(error.diagnostics.every((diagnostic) => diagnostic.code === "E_SECRET_MATERIAL_INLINE"), true);
      return true;
    },
  );
});

test("ProjectModel validation rejects invalid credential claims and auth scopes", () => {
  const deployment = loadYamlDocument(fixture("deployment.yml"));
  deployment.spec.workloads["assistant-api"].credentials[0].claim = "missing.provider";
  assertBuildDiagnostics({ deployments: [deployment] }, ["E_CREDENTIAL_CLAIM_UNKNOWN"]);

  const model = buildProjectModel(input());
  model.routes[0].authScope = "admin";
  assert.deepEqual(validateProjectModel(model).map((diagnostic) => diagnostic.code), ["E_ROUTE_AUTH_SCOPE_INVALID"]);
});
