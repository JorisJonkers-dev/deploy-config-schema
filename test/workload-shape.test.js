import { test } from "node:test";
import assert from "node:assert/strict";
import { renderKubernetesWorkloadFragment, validateDeploymentSemantics } from "../src/index.js";

const IMAGE = `ghcr.io/org/app:v1.0.0@sha256:${"ab".repeat(32)}`;

function input(workload) {
  return {
    deployment: {
      apiVersion: "deployment.jorisjonkers.dev/v2",
      kind: "Deployment",
      metadata: { name: "svc" },
      spec: { namespace: "svc-system", workloads: [{ name: "svc", image: { alias: "app" }, ...workload }] },
    },
    images: { app: IMAGE },
    environment: "production",
  };
}

const CONTEXT = { spec: { routeTiers: {} } };

function workloadOf(fragment) {
  return fragment.manifests.find((m) => m.kind === "Deployment" || m.kind === "StatefulSet");
}
function containerOf(fragment) {
  return workloadOf(fragment).spec.template.spec.containers[0];
}

test("replicas reaches the rendered workload when declared", () => {
  const rendered = renderKubernetesWorkloadFragment(input({ replicas: 3 }));
  assert.equal(workloadOf(rendered).spec.replicas, 3);
});

test("replicas is absent when not declared, so it cannot reset a running count", () => {
  // Emitting a default here would overwrite whatever the cluster is running the
  // moment the artifact is applied.
  const rendered = renderKubernetesWorkloadFragment(input({}));
  assert.equal("replicas" in workloadOf(rendered).spec, false);
});

test("replicas: 0 is preserved rather than treated as unset", () => {
  const rendered = renderKubernetesWorkloadFragment(input({ replicas: 0 }));
  assert.equal(workloadOf(rendered).spec.replicas, 0);
});

test("resources reach the container and are not shared with the input", () => {
  const resources = { requests: { cpu: "400m", memory: "2Gi" }, limits: { cpu: "2", memory: "4Gi" } };
  const source = input({ resources });
  const rendered = renderKubernetesWorkloadFragment(source);
  assert.deepEqual(containerOf(rendered).resources, resources);

  // Mutating the render must not reach back into the deployment document.
  containerOf(rendered).resources.requests.cpu = "999m";
  assert.equal(source.deployment.spec.workloads[0].resources.requests.cpu, "400m");
});

test("a health block with path and port produces both probes", () => {
  const rendered = renderKubernetesWorkloadFragment(input({ health: { path: "/", port: 80 } }));
  const c = containerOf(rendered);
  assert.deepEqual(c.readinessProbe, { httpGet: { path: "/", port: 80 }, timeoutSeconds: 5 });
  assert.deepEqual(c.livenessProbe, { httpGet: { path: "/", port: 80 }, timeoutSeconds: 5 });
});

test("livenessPath splits the two probes, as Spring actuator requires", () => {
  const rendered = renderKubernetesWorkloadFragment(
    input({ health: { path: "/api/actuator/health/readiness", livenessPath: "/api/actuator/health/liveness", port: 8081 } }),
  );
  const c = containerOf(rendered);
  assert.equal(c.readinessProbe.httpGet.path, "/api/actuator/health/readiness");
  assert.equal(c.livenessProbe.httpGet.path, "/api/actuator/health/liveness");
});

test("probeTimeoutSeconds overrides the default", () => {
  const rendered = renderKubernetesWorkloadFragment(input({ health: { path: "/", port: 80, probeTimeoutSeconds: 12 } }));
  assert.equal(containerOf(rendered).readinessProbe.timeoutSeconds, 12);
});

test("a workload with no health block gets no probes", () => {
  // The ingest worker is not an HTTP service and runs without probes in the
  // cluster; inventing one would fail the pod.
  const rendered = renderKubernetesWorkloadFragment(input({}));
  const c = containerOf(rendered);
  assert.equal("readinessProbe" in c, false);
  assert.equal("livenessProbe" in c, false);
});

test("health without a port produces no probes rather than an invalid one", () => {
  const rendered = renderKubernetesWorkloadFragment(input({ health: { path: "/", timeoutClass: "stateless" } }));
  assert.equal("readinessProbe" in containerOf(rendered), false);
});

test("the shape fields apply to a stateful workload too", () => {
  const rendered = renderKubernetesWorkloadFragment(
    input({ stateful: true, replicas: 1, resources: { requests: { cpu: "100m" } }, health: { path: "/", port: 80 } }),
  );
  const w = workloadOf(rendered);
  assert.equal(w.kind, "StatefulSet");
  assert.equal(w.spec.replicas, 1);
  assert.deepEqual(containerOf(rendered).resources, { requests: { cpu: "100m" } });
});

// ---- validation ----

function validate(workload) {
  return validateDeploymentSemantics(
    {
      kind: "Deployment",
      metadata: { name: "svc" },
      spec: { namespace: "svc-system", workloads: [{ name: "svc", ...workload }] },
    },
    CONTEXT,
  );
}

test("replicas must be a non-negative integer", () => {
  assert.throws(() => validate({ replicas: -1 }), /E_REPLICAS_INVALID/);
  assert.throws(() => validate({ replicas: 1.5 }), /E_REPLICAS_INVALID/);
  assert.doesNotThrow(() => validate({ replicas: 0 }));
  assert.doesNotThrow(() => validate({ replicas: 4 }));
});

test("resource quantities must be non-empty strings under requests or limits", () => {
  assert.throws(() => validate({ resources: { requests: { cpu: 400 } } }), /E_RESOURCES_INVALID/);
  assert.throws(() => validate({ resources: { limits: { cpu: "" } } }), /E_RESOURCES_INVALID/);
  assert.throws(() => validate({ resources: { requests: ["cpu"] } }), /E_RESOURCES_INVALID/);
  assert.doesNotThrow(() => validate({ resources: { requests: { cpu: "400m" }, limits: { memory: "2Gi" } } }));
});

test("probeTimeoutSeconds must be a positive integer", () => {
  assert.throws(() => validate({ health: { probeTimeoutSeconds: 0 } }), /E_PROBE_TIMEOUT_INVALID/);
  assert.throws(() => validate({ health: { probeTimeoutSeconds: 2.5 } }), /E_PROBE_TIMEOUT_INVALID/);
  assert.doesNotThrow(() => validate({ health: { probeTimeoutSeconds: 5 } }));
});
