import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderServiceMonitors } from "../src/deployment-v2/render/servicemonitor.js";

function doc(file) {
  return YAML.parse(file.content);
}

test("deploy-v2 ServiceMonitor renderer mirrors v1 monitor object shape", () => {
  const result = renderServiceMonitors({
    cluster: { appsRoot: "apps" },
    workloads: {
      api: {
        name: "api",
        group: "stateless",
        namespace: "apps",
        observability: {
          metrics: [
            { kind: "ServiceMonitor", port: "http", path: "/actuator/prometheus", interval: "15s" },
            { kind: "PodMonitor", port: "metrics" },
          ],
        },
      },
    },
  });

  assert.deepEqual(result.files.map((file) => file.path), [
    "apps/stateless/api/podmonitor.yaml",
    "apps/stateless/api/servicemonitor.yaml",
  ]);

  const serviceMonitor = doc(result.files.find((file) => file.path.endsWith("servicemonitor.yaml")));
  assert.equal(serviceMonitor.apiVersion, "monitoring.coreos.com/v1");
  assert.equal(serviceMonitor.kind, "ServiceMonitor");
  assert.deepEqual(serviceMonitor.metadata, {
    name: "api",
    namespace: "apps",
    labels: { release: "metrics-stack" },
  });
  assert.equal(serviceMonitor.spec.jobLabel, "app.kubernetes.io/name");
  assert.deepEqual(serviceMonitor.spec.selector.matchLabels, { "app.kubernetes.io/name": "api" });
  assert.deepEqual(serviceMonitor.spec.endpoints, [{
    port: "http",
    path: "/actuator/prometheus",
    interval: "15s",
    scheme: "http",
  }]);

  const podMonitor = doc(result.files.find((file) => file.path.endsWith("podmonitor.yaml")));
  assert.equal(podMonitor.kind, "PodMonitor");
  assert.deepEqual(podMonitor.spec.podMetricsEndpoints, [{
    port: "metrics",
    path: "/metrics",
    interval: "30s",
    scheme: "http",
  }]);
});
