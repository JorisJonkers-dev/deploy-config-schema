import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  emitAdapterCompat,
  emitArtifactContract,
  computeRenderHash,
  emitKustomizationHealth,
  validateRawManifests,
  FORBIDDEN_KINDS,
  resolveHealthTimeout,
  validateHealthTimeoutClass,
  HEALTH_TIMEOUT_CLASS_MAP,
} from "../src/index.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// T-B3: emitArtifactContract produces a valid contract
test("T-B3: emitArtifactContract produces a valid contract", () => {
  const options = {
    name: "my-service",
    environments: ["production"],
    imageDigests: { "my-image": "sha256:aabbcc" },
    contextRef: "sha256:contextref",
    inputDigests: {
      deployment: "sha256:deploy",
      imagesLock: "sha256:images",
      context: "sha256:ctx",
    },
    adapterCompatDigest: "sha256:compat",
    schemaPackageIntegrity: "sha512-abc",
    provenanceVerified: true,
    outputs: {
      manifests: { "kustomization.yaml": "sha256:manfest" },
      metadata: { "health.yaml": "sha256:health" },
    },
    files: {
      "kustomization.yaml": "apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\n",
    },
  };
  const contract = emitArtifactContract(options);
  assert.equal(contract.apiVersion, "deployment.jorisjonkers.dev/artifact-contract/v1");
  assert.equal(contract.kind, "DeployArtifactContract");
  assert.equal(contract.metadata.name, "my-service");
  assert.equal(contract.spec.artifactType, "application/vnd.jorisjonkers.deployment.artifact.v1+tar");
  assert.ok(contract.spec.renderHash.startsWith("sha256:"));
  assert.equal(contract.spec.provenance_verified, true);
});

// T-B1: render hash stability (golden test)
test("T-B1: computeRenderHash is stable (golden)", () => {
  const files = {
    "kustomization.yaml": "apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\n",
    "deployment.yaml": "apiVersion: apps/v1\nkind: Deployment\n",
  };
  const inputDigests = {
    deployment: "sha256:deploy111",
    imagesLock: "sha256:images222",
    context: "sha256:ctx333",
  };
  const hash1 = computeRenderHash(files, inputDigests, "sha256:compat444", "sha512-pkg555");
  const hash2 = computeRenderHash(files, inputDigests, "sha256:compat444", "sha512-pkg555");
  assert.equal(hash1, hash2);
  assert.ok(hash1.startsWith("sha256:"));
});

// T-B4: emitAdapterCompat produces valid doc
test("T-B4: emitAdapterCompat produces valid doc", () => {
  const doc = emitAdapterCompat("0.16.0", "sha512-abc123");
  assert.equal(doc.apiVersion, "deployment.jorisjonkers.dev/adapter-compat/v1");
  assert.equal(doc.kind, "AdapterCompat");
  assert.equal(doc.metadata.schemaVersion, "0.16.0");
  assert.ok(doc.digest.startsWith("sha256:"));
  assert.ok("traefik-route-fragment" in doc.spec.fragments);
  assert.ok("kubernetes-workload-fragment" in doc.spec.fragments);
});

// emitAdapterCompat digest is deterministic
test("emitAdapterCompat digest is stable across calls", () => {
  const doc1 = emitAdapterCompat("0.16.0", "sha512-abc");
  const doc2 = emitAdapterCompat("0.16.0", "sha512-abc");
  assert.equal(doc1.digest, doc2.digest);
});

// T-B2 (partial): emitKustomizationHealth
test("T-B2: emitKustomizationHealth stateless workload → 5m timeout", () => {
  const result = emitKustomizationHealth({
    workloads: [{ health: { timeoutClass: "stateless" } }],
    healthChecks: [{ apiVersion: "apps/v1", kind: "Deployment", name: "my-app", namespace: "default" }],
  });
  assert.equal(result.spec.timeout, "5m");
  assert.equal(result.spec.wait, true);
  assert.equal(result.spec.healthChecks.length, 1);
});

test("emitKustomizationHealth stateful workload → 10m timeout", () => {
  const result = emitKustomizationHealth({
    workloads: [{ health: { timeoutClass: "stateful" } }],
    healthChecks: [],
  });
  assert.equal(result.spec.timeout, "10m");
});

test("emitKustomizationHealth control-plane workload → 15m timeout", () => {
  const result = emitKustomizationHealth({
    workloads: [{ health: { timeoutClass: "control-plane" } }],
    healthChecks: [],
  });
  assert.equal(result.spec.timeout, "15m");
});

test("emitKustomizationHealth no workloads → default 5m", () => {
  const result = emitKustomizationHealth({ workloads: [], healthChecks: [] });
  assert.equal(result.spec.timeout, "5m");
});

function rawDeployment(enabled = true) {
  return {
    apiVersion: "deployment.jorisjonkers.dev/v2",
    kind: "Deployment",
    metadata: { name: "test-service" },
    spec: {
      namespace: "test-ns",
      workloads: [{ name: "app", ...(enabled ? { rawManifests: { enabled: true, path: "deploy/raw-manifests" } } : {}) }],
    },
  };
}

test("T-A5: validateRawManifests with Secret kind → E_RAW_MANIFESTS_VIOLATIONS", () => {
  const tmpDir = join(tmpdir(), `test-raw-${Date.now()}-a`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    writeFileSync(join(tmpDir, "secret.yaml"), [
      "apiVersion: v1",
      "kind: Secret",
      "metadata:",
      "  name: my-secret",
      "  namespace: test-ns",
      "  annotations:",
      "    platform.jorisjonkers.dev/raw-reason: needed",
      "",
    ].join("\n"));
    assert.throws(() => validateRawManifests({ deployment: rawDeployment(), root: tmpDir }), /E_RAW_MANIFESTS_VIOLATIONS/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("validateRawManifests with clean manifests → no violations", () => {
  const tmpDir = join(tmpdir(), `test-raw-${Date.now()}-b`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    writeFileSync(join(tmpDir, "deployment.yaml"), [
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      "  name: app",
      "  namespace: test-ns",
      "  annotations:",
      "    platform.jorisjonkers.dev/raw-reason: legacy",
      "",
    ].join("\n"));
    const guard = validateRawManifests({ deployment: rawDeployment(), root: tmpDir });
    assert.equal(guard.present, true);
    assert.equal(guard.violations.length, 0);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("validateRawManifests foreign namespace / missing annotation → E_RAW_MANIFESTS_VIOLATIONS", () => {
  const tmpDir = join(tmpdir(), `test-raw-${Date.now()}-c`);
  mkdirSync(tmpDir, { recursive: true });
  try {
    writeFileSync(join(tmpDir, "foreign.yaml"), "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: x\n  namespace: other-ns\n");
    assert.throws(() => validateRawManifests({ deployment: rawDeployment(), root: tmpDir }), /E_RAW_MANIFESTS_VIOLATIONS/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("validateRawManifests without rawManifests workloads → present=false", () => {
  const guard = validateRawManifests({ deployment: rawDeployment(false), root: "/nonexistent/path/xyz123" });
  assert.equal(guard.present, false);
  assert.equal(guard.violations.length, 0);
  assert.deepEqual(guard.forbidden_kinds_scanned, FORBIDDEN_KINDS);
});

// Health timeout map tests
test("resolveHealthTimeout with mixed workloads picks highest priority", () => {
  const workloads = [
    { health: { timeoutClass: "stateless" } },
    { health: { timeoutClass: "stateful" } },
  ];
  assert.equal(resolveHealthTimeout(workloads), "10m");
});

test("validateHealthTimeoutClass rejects unknown class", () => {
  assert.throws(
    () => validateHealthTimeoutClass("turbo"),
    (err) => {
      assert.ok(err.message.includes("E_UNKNOWN_HEALTH_TIMEOUT_CLASS"));
      return true;
    }
  );
});

test("validateHealthTimeoutClass accepts known classes", () => {
  assert.doesNotThrow(() => validateHealthTimeoutClass("stateless"));
  assert.doesNotThrow(() => validateHealthTimeoutClass("stateful"));
  assert.doesNotThrow(() => validateHealthTimeoutClass("control-plane"));
});

test("HEALTH_TIMEOUT_CLASS_MAP has expected values", () => {
  assert.equal(HEALTH_TIMEOUT_CLASS_MAP["stateless"], "5m");
  assert.equal(HEALTH_TIMEOUT_CLASS_MAP["stateful"], "10m");
  assert.equal(HEALTH_TIMEOUT_CLASS_MAP["control-plane"], "15m");
});
