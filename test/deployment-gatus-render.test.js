import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderGatus } from "../src/deployment/render/gatus.js";

function model() {
  return {
    cluster: { appsRoot: "apps" },
    adapterArtifacts: {
      "deploy-config": {
        adapter_output_intent: { namespaces: {}, configmap_names: {} },
      },
    },
    routes: [
      { serviceName: "public", tier: "public-frankfurt", authScope: "anonymous" },
      { serviceName: "protected", tier: "public-frankfurt", authScope: "application" },
    ],
    workloads: {
      public: workload("public", "web", [{ name: "public-health", group: "apps", url: "https://public.example.net/health", type: "http", conditions: [] }]),
      protected: workload("protected", "api", [{ name: "protected-health", group: "apps", url: "https://protected.example.net/ready", type: "http", conditions: ["[STATUS] == 204"] }]),
      tcp: workload("tcp", "data", [{ name: "postgres", group: "data", url: "tcp://postgres.example.net:5432", type: "tcp", conditions: [] }]),
      both: workload("both", "apps", [{ name: "search", group: "apps", url: "https://search.example.net/status", type: "http", strategy: "both", conditions: [] }]),
    },
  };
}

function workload(name, namespace, status) {
  return {
    name,
    namespace,
    service: {
      name,
      ports: [{ name: "http", containerPort: 8080, servicePort: 80 }],
    },
    probes: {},
    observability: { status },
  };
}

test("deployment Gatus renders sorted endpoint ConfigMap with probe strategy defaults", () => {
  const result = renderGatus(model());
  assert.equal(result.files[0].path, "apps/observability/gatus/gatus-endpoints-configmap.yaml");

  const configMap = YAML.parse(result.files[0].content);
  assert.equal(configMap.metadata.name, "gatus-endpoints");
  assert.equal(configMap.metadata.namespace, "observability");
  const embedded = YAML.parse(configMap.data["endpoints.yaml"]);

  assert.deepEqual(embedded.endpoints.map((endpoint) => endpoint.name), [
    "protected-health",
    "public-health",
    "search (external)",
    "search (internal)",
    "postgres",
  ]);
  assert.equal(embedded.endpoints[0].url, "http://protected.api.svc.cluster.local:80/ready");
  assert.equal(embedded.endpoints[0].conditions[0], "[STATUS] == 204");
  assert.equal(embedded.endpoints[1].url, "https://public.example.net/health");
  assert.equal(embedded.endpoints[2].url, "https://search.example.net/status");
  assert.equal(embedded.endpoints[3].url, "http://both.apps.svc.cluster.local:80/status");
  assert.equal(embedded.endpoints[4].url, "tcp://tcp.data.svc.cluster.local:80");
  assert.deepEqual(embedded.endpoints[4].conditions, ["[CONNECTED] == true"]);
});
