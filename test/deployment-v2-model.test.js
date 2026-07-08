import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeImageLock,
  validateDeploymentSemantics,
} from "../src/index.js";

function publicContext() {
  return {
    apiVersion: "deployment.jorisjonkers.dev/cluster-context/v1",
    kind: "ClusterContext",
    metadata: { name: "production-public", visibility: "public" },
    spec: {
      cluster: "production",
      schemaVersion: "0.16.0",
      labels: { allowed: { "kubernetes.io/arch": ["amd64"] } },
      routeTiers: {
        "public-frankfurt": { class: "public", hostnamePolicy: "public", authModes: ["forward-auth"] },
        lan: { class: "lan", hostnamePolicy: "lan", authModes: ["internal", "lan"] },
      },
      capacity: { nodeLabels: {} },
      adapterCompat: { manifest: "adapter-compat.yaml" },
    },
  };
}

function minimalDeployment(workloads) {
  return {
    apiVersion: "deployment.jorisjonkers.dev/v2",
    kind: "Deployment",
    metadata: { name: "test-service" },
    spec: {
      namespace: "test-ns",
      workloads: workloads ?? [{ name: "app", image: { alias: "app" } }],
    },
  };
}

test("T-A3: route without owner inherits routeDefaults.owner", () => {
  const dep = minimalDeployment([{
    name: "app",
    routeDefaults: { owner: "team-a", authMode: "forward-auth" },
    routes: [{ host: "x.example.com" }],
  }]);
  validateDeploymentSemantics(dep, publicContext());
});

test("T-A3: route without owner and no routeDefaults → E_ROUTE_OWNER_REQUIRED", () => {
  const dep = minimalDeployment([{ name: "app", routes: [{ host: "x.example.com", authMode: "forward-auth" }] }]);
  assert.throws(() => validateDeploymentSemantics(dep, publicContext()), /E_ROUTE_OWNER_REQUIRED/);
});

test("T-A3: route without authMode → E_ROUTE_AUTH_MODE_REQUIRED", () => {
  const dep = minimalDeployment([{ name: "app", routes: [{ host: "x.example.com", owner: "team-a" }] }]);
  assert.throws(() => validateDeploymentSemantics(dep, publicContext()), /E_ROUTE_AUTH_MODE_REQUIRED/);
});

test("T-A3: deployment-level routeDefaults also resolve", () => {
  const dep = minimalDeployment([{ name: "app", routes: [{ host: "x.example.com" }] }]);
  dep.spec.routeDefaults = { owner: "team-b", authMode: "forward-auth" };
  validateDeploymentSemantics(dep, publicContext());
});

test("T-A4: stateful workload without migrationPolicy → E_STATEFUL_MIGRATION_POLICY_REQUIRED", () => {
  const dep = minimalDeployment([{ name: "db", stateful: true }]);
  assert.throws(() => validateDeploymentSemantics(dep, publicContext()), /E_STATEFUL_MIGRATION_POLICY_REQUIRED/);
});

test("T-A4: stateful workload with migrationPolicy passes", () => {
  const dep = minimalDeployment([{ name: "db", stateful: true, migrationPolicy: { required: false, strategy: "none" } }]);
  validateDeploymentSemantics(dep, publicContext());
});

test("T-A4: invalid migration strategy → E_MIGRATION_POLICY_STRATEGY_INVALID", () => {
  const dep = minimalDeployment([{ name: "db", stateful: true, migrationPolicy: { required: true, strategy: "yolo" } }]);
  assert.throws(() => validateDeploymentSemantics(dep, publicContext()), /E_MIGRATION_POLICY_STRATEGY_INVALID/);
});

test("rollback retention not acknowledged → E_ROLLBACK_RETENTION_ACK_REQUIRED", () => {
  const dep = minimalDeployment([{ name: "app", rollbackTargetRetention: { minimumDays: 120, acknowledged: false } }]);
  assert.throws(() => validateDeploymentSemantics(dep, publicContext()), /E_ROLLBACK_RETENTION_ACK_REQUIRED/);
});

test("rollback retention below 90 days → E_ROLLBACK_RETENTION_MIN_DAYS", () => {
  const dep = minimalDeployment([{ name: "app", rollbackTargetRetention: { minimumDays: 30, acknowledged: true } }]);
  assert.throws(() => validateDeploymentSemantics(dep, publicContext()), /E_ROLLBACK_RETENTION_MIN_DAYS/);
});

test("rollback retention acknowledged and >= 90 days passes", () => {
  const dep = minimalDeployment([{ name: "app", rollbackTargetRetention: { minimumDays: 90, acknowledged: true } }]);
  validateDeploymentSemantics(dep, publicContext());
});

test("route authMode not in tier → E_ROUTE_AUTH_MODE_NOT_IN_TIER", () => {
  const dep = minimalDeployment([{
    name: "app",
    routes: [{ host: "x.lan", owner: "team-a", authMode: "forward-auth", expose: { tier: "lan" } }],
  }]);
  assert.throws(() => validateDeploymentSemantics(dep, publicContext()), /E_ROUTE_AUTH_MODE_NOT_IN_TIER/);
});

test("legacy apiVersion emits warning but does not throw", () => {
  const dep = minimalDeployment();
  dep.apiVersion = "deployment.jorisjonkers.dev";
  validateDeploymentSemantics(dep, publicContext());
});

test("T-A7: array image lock normalizes to object form", () => {
  const raw = [{ alias: "app", ref: "ghcr.io/org/app@sha256:abc123" }];
  assert.deepEqual(normalizeImageLock(raw), { app: "ghcr.io/org/app@sha256:abc123" });
});

test("T-A7: object image lock passes through unchanged", () => {
  const raw = { app: "ghcr.io/org/app@sha256:abc123" };
  assert.deepEqual(normalizeImageLock(raw), raw);
});

test("T-A7: invalid image lock shape throws", () => {
  assert.throws(() => normalizeImageLock("nope"), /E_IMAGE_LOCK_INVALID_SHAPE/);
});
