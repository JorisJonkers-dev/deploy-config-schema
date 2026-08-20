import { test } from "node:test";
import assert from "node:assert/strict";
import { renderKubernetesWorkloadFragment, validateDeploymentSemantics } from "../src/index.js";

const IMAGE = `ghcr.io/org/app:v1.0.0@sha256:${"ab".repeat(32)}`;

function render(workload, name = "svc", namespace = "svc-system") {
  return renderKubernetesWorkloadFragment({
    deployment: {
      apiVersion: "deployment.jorisjonkers.dev/v2",
      kind: "Deployment",
      metadata: { name },
      spec: { namespace, workloads: [{ name, image: { alias: "app" }, ...workload }] },
    },
    images: { app: IMAGE },
    environment: "production",
  });
}
const controller = (f) => f.manifests.find((m) => m.kind === "Deployment" || m.kind === "StatefulSet");
const container = (f) => controller(f).spec.template.spec.containers[0];

const CONTEXT = { spec: { routeTiers: {} } };
function validate(workload) {
  return validateDeploymentSemantics(
    { kind: "Deployment", metadata: { name: "svc" }, spec: { namespace: "svc-system", workloads: [{ name: "svc", ...workload }] } },
    CONTEXT,
  );
}

const VOLUME = { name: "vault-clone", claimName: "knowledge-vault-clone", mountPath: "/vault" };

// ---- the controller kind ----

test("stateful: true does not turn a declared deployment into a StatefulSet", () => {
  // A workload whose state lives in Postgres or a mounted claim is still a
  // Deployment. Rendering a StatefulSet would change its identity, and a
  // StatefulSet names its storage after itself.
  const rendered = render({ kind: "deployment", stateful: true, migrationPolicy: { required: true, strategy: "pre-deploy-job" } });
  assert.equal(controller(rendered).kind, "Deployment");
});

test("a StatefulSet is rendered only when the kind says so", () => {
  assert.equal(controller(render({ kind: "statefulset" })).kind, "StatefulSet");
  assert.equal(controller(render({})).kind, "Deployment");
});

// ---- volumes ----

test("a declared claim becomes a pod volume and a container mount", () => {
  const rendered = render({ volumes: [VOLUME] });
  assert.deepEqual(controller(rendered).spec.template.spec.volumes, [
    { name: "vault-clone", persistentVolumeClaim: { claimName: "knowledge-vault-clone" } },
  ]);
  assert.deepEqual(container(rendered).volumeMounts, [{ name: "vault-clone", mountPath: "/vault" }]);
});

test("subPath and readOnly reach the mount only when set", () => {
  const full = render({ volumes: [{ ...VOLUME, subPath: "inner", readOnly: true }] });
  assert.deepEqual(container(full).volumeMounts[0], { name: "vault-clone", mountPath: "/vault", subPath: "inner", readOnly: true });
  const bare = render({ volumes: [VOLUME] });
  assert.equal("subPath" in container(bare).volumeMounts[0], false);
  assert.equal("readOnly" in container(bare).volumeMounts[0], false);
});

test("no volumes declared means no volumes key at all", () => {
  const rendered = render({});
  assert.equal("volumes" in controller(rendered).spec.template.spec, false);
  assert.equal("volumeMounts" in container(rendered), false);
});

test("a volumeClaimTemplate is never rendered, whatever the kind", () => {
  // This is the property that makes renaming or moving a workload safe: the
  // claim is referenced, not owned, so the data does not follow the name.
  for (const kind of ["deployment", "statefulset"]) {
    const rendered = render({ kind, volumes: [VOLUME] });
    assert.equal("volumeClaimTemplates" in controller(rendered).spec, false, `${kind} must not own its claim`);
    assert.equal(controller(rendered).spec.template.spec.volumes[0].persistentVolumeClaim.claimName, "knowledge-vault-clone");
  }
});

test("renaming the workload or its namespace leaves the claim reference untouched", () => {
  const before = render({ volumes: [VOLUME] }, "ingest-worker", "knowledge-system");
  const after = render({ volumes: [VOLUME] }, "renamed-worker", "other-system");
  const claimOf = (f) => controller(f).spec.template.spec.volumes[0].persistentVolumeClaim.claimName;
  assert.equal(claimOf(before), claimOf(after));
  assert.notEqual(controller(before).metadata.name, controller(after).metadata.name);
});

// ---- validation ----

test("every volume needs a name, a claimName and a mountPath", () => {
  assert.throws(() => validate({ volumes: [{ claimName: "c", mountPath: "/m" }] }), /E_VOLUME_INVALID/);
  assert.throws(() => validate({ volumes: [{ name: "n", mountPath: "/m" }] }), /E_VOLUME_INVALID/);
  assert.throws(() => validate({ volumes: [{ name: "n", claimName: "c" }] }), /E_VOLUME_INVALID/);
  assert.throws(() => validate({ volumes: [{ name: "", claimName: "c", mountPath: "/m" }] }), /E_VOLUME_INVALID/);
  assert.doesNotThrow(() => validate({ volumes: [VOLUME] }));
});

test("a claim template is rejected with an explanation, not silently dropped", () => {
  assert.throws(
    () => validate({ volumes: [{ ...VOLUME, volumeClaimTemplate: { spec: {} } }] }),
    /E_VOLUME_CLAIM_TEMPLATE_FORBIDDEN/,
  );
});

test("duplicate volume names are rejected", () => {
  assert.throws(() => validate({ volumes: [VOLUME, { ...VOLUME, mountPath: "/other" }] }), /E_VOLUME_NAME_DUPLICATE/);
});

test("volumes must be a list", () => {
  assert.throws(() => validate({ volumes: { name: "n" } }), /E_VOLUME_INVALID/);
});
