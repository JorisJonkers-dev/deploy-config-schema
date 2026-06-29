import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderNetworkPolicies } from "../src/deployment/render/networkpolicy.js";

function docs(file) {
  return YAML.parseAllDocuments(file.content).map((document) => document.toJSON());
}

function baseModel(overrides = {}) {
  return {
    renderMode: "parity",
    cluster: { appsRoot: "apps" },
    parityImports: { networkPolicies: [] },
    adapterArtifacts: {
      "deploy-config": {
        ingress_intent: { defaults: { namespace: "edge" } },
      },
    },
    routes: [],
    workloads: {},
    providerGraph: { data: {}, messaging: {}, credentials: [] },
    ...overrides,
  };
}

test("deployment NetworkPolicy parity mode emits only imported policies", () => {
  const imported = {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: { name: "imported", namespace: "apps" },
    spec: { podSelector: {} },
  };
  const result = renderNetworkPolicies(baseModel({ parityImports: { networkPolicies: [imported] } }));
  assert.equal(result.files[0].path, "apps/network-policies/imported-networkpolicies.yaml");
  assert.deepEqual(docs(result.files[0]), [imported]);
});

test("deployment NetworkPolicy native mode derives edge and provider policies without default deny", () => {
  const result = renderNetworkPolicies(baseModel({
    renderMode: "native",
    routes: [{
      name: "web",
      serviceName: "web",
      tier: "public-frankfurt",
      rules: [{ port: "http" }],
    }],
    workloads: {
      web: {
        name: "web",
        namespace: "apps",
        service: {
          ports: [{ name: "http", containerPort: 8080, servicePort: 80, protocol: "TCP" }],
        },
        credentials: [{ name: "postgres", claim: "data.postgres" }],
      },
    },
    providerGraph: {
      data: {
        postgres: {
          name: "postgres",
          namespace: "data",
          endpoint: { service: "postgres", port: 5432 },
        },
      },
      messaging: {},
      credentials: [{ name: "postgres", claim: "data.postgres" }],
    },
  }));

  assert.equal(result.files[0].path, "apps/network-policies/networkpolicies.yaml");
  const rendered = docs(result.files[0]);
  assert.deepEqual(rendered.map((policy) => policy.metadata.name), ["web-allow-edge", "web-allow-postgres"]);
  assert.equal(rendered.some((policy) => policy.spec.policyTypes.includes("Ingress") && !policy.spec.ingress), false);
  assert.equal(rendered[0].spec.ingress[0].from[0].namespaceSelector.matchLabels["kubernetes.io/metadata.name"], "edge");
  assert.deepEqual(rendered[0].spec.ingress[0].ports, [{ protocol: "TCP", port: 80 }]);
  assert.equal(rendered[1].spec.egress[0].to[0].namespaceSelector.matchLabels["kubernetes.io/metadata.name"], "data");
  assert.deepEqual(rendered[1].spec.egress[0].ports, [{ protocol: "TCP", port: 5432 }]);
});
