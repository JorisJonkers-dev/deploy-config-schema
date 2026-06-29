import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderAutoscaling } from "../src/deployment/render/autoscaling.js";

function docs(content) {
  return YAML.parseAllDocuments(content).map((document) => document.toJSON());
}

function model(kind = "deployment", autoscaling = { minReplicas: 2, maxReplicas: 5, targetCpuUtilization: 70, targetMemoryUtilization: 80 }) {
  const workload = {
    name: "api",
    deploymentName: "api",
    group: "stateless",
    namespace: "apps",
    kind,
    image: { repository: "example/api", tag: "1.0.0", ref: "example/api:1.0.0", pullSecrets: [], updateEligible: true },
    containers: [{ name: "api", ports: [], env: {}, envFromSecrets: [], volumeMounts: [] }],
    initContainers: [],
    sidecars: [],
    config: { values: {}, files: {} },
    secrets: [],
    credentials: [],
    storage: { volumes: [], mounts: [], tiers: {} },
    placement: { nodeSelector: {}, requiredCapabilities: [], tolerations: [], topologySpread: [] },
    autoscaling,
    probes: {},
    observability: { status: [], metrics: [] },
    hooks: { pre: [] },
    rollout: {},
    rawManifests: [],
  };
  return {
    renderMode: "parity",
    cluster: { appsRoot: "apps" },
    workloads: { api: workload },
  };
}

test("renderAutoscaling emits expected HPA metrics", () => {
  const [file] = renderAutoscaling(model()).files;
  const hpa = docs(file.content)[0];

  assert.equal(file.path, "apps/stateless/api/hpa.yaml");
  assert.equal(hpa.kind, "HorizontalPodAutoscaler");
  assert.equal(hpa.spec.scaleTargetRef.kind, "Deployment");
  assert.equal(hpa.spec.minReplicas, 2);
  assert.equal(hpa.spec.maxReplicas, 5);
  assert.deepEqual(hpa.spec.metrics.map((metric) => metric.resource.name), ["cpu", "memory"]);
});

test("renderAutoscaling rejects Job/CronJob targets and preserves imported KEDA parity", () => {
  assert.throws(() => renderAutoscaling(model("job")), /cannot use autoscaling with kind job/);
  assert.throws(() => renderAutoscaling(model("cronjob")), /cannot use autoscaling with kind cronjob/);

  const imported = model();
  imported.workloads.api.importedParity = { kedaObjects: [{ apiVersion: "keda.sh/v1alpha1", kind: "ScaledObject", metadata: { name: "api", namespace: "apps" }, spec: { triggers: [] } }] };
  assert.equal(docs(renderAutoscaling(imported).files[0].content)[0].kind, "ScaledObject");

  const nativeKeda = model("statefulset", { minReplicas: 1, maxReplicas: 3, keda: { triggers: [{ type: "rabbitmq", metadata: { queueName: "jobs" } }] } });
  nativeKeda.renderMode = "native";
  const scaledObject = docs(renderAutoscaling(nativeKeda).files[0].content)[0];
  assert.equal(scaledObject.kind, "ScaledObject");
  assert.equal(scaledObject.spec.maxReplicaCount, 3);

  const parityKeda = model("deployment", { minReplicas: 1, maxReplicas: 3, keda: { triggers: [{ type: "rabbitmq", metadata: { queueName: "jobs" } }] } });
  assert.deepEqual(renderAutoscaling(parityKeda).files, []);
});
