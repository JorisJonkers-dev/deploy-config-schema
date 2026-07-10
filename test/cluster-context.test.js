import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateClusterContext,
  enforce_visibility_rules,
  assertNodeLabelsOnAllowlist,
  scanAllStringFields,
  redactToPublic,
  getPackageVersion,
} from "../src/index.js";

const SCHEMA_VERSION = getPackageVersion();

function makePublicCtx(overrides = {}) {
  return {
    apiVersion: "deployment.jorisjonkers.dev/cluster-context/v1",
    kind: "ClusterContext",
    metadata: { name: "production-public", visibility: "public" },
    spec: {
      cluster: "k3s-lab",
      schemaVersion: SCHEMA_VERSION,
      labels: {
        allowed: {
          "kubernetes.io/arch": ["amd64", "arm64"],
        },
      },
      routeTiers: {
        "public": {
          class: "public",
          hostnamePolicy: "public",
          authModes: ["forward-auth"],
        },
      },
      capacity: { nodeLabels: {} },
      adapterCompat: { manifest: "sha256:abc123" },
      ...overrides,
    },
  };
}

function makeInternalCtx(overrides = {}) {
  return {
    apiVersion: "deployment.jorisjonkers.dev/cluster-context/v1",
    kind: "ClusterContext",
    metadata: { name: "production-internal", visibility: "internal" },
    spec: {
      cluster: "k3s-lab",
      schemaVersion: SCHEMA_VERSION,
      labels: {
        allowed: {
          "kubernetes.io/arch": ["amd64"],
        },
      },
      routeTiers: {
        "lan": {
          class: "lan",
          hostnamePolicy: "lan",
          authModes: ["lan"],
        },
      },
      capacity: { nodeLabels: { "platform.jorisjonkers.dev/role": ["worker"] } },
      adapterCompat: { manifest: "sha256:def456" },
      internal: {
        nodeIps: { "node1": "10.0.0.1" },
        vaultAllowLists: {},
        providerExports: {},
      },
      ...overrides,
    },
  };
}

// T-A1: public context with spec.internal should throw E_PUBLIC_CONTEXT_HAS_INTERNAL_BLOCK
test("T-A1: public context with spec.internal → E_PUBLIC_CONTEXT_HAS_INTERNAL_BLOCK", () => {
  const ctx = makePublicCtx({ internal: { nodeIps: {}, vaultAllowLists: {}, providerExports: {} } });
  assert.throws(
    () => enforce_visibility_rules(ctx),
    (err) => {
      assert.ok(err.message.includes("E_PUBLIC_CONTEXT_HAS_INTERNAL_BLOCK"));
      return true;
    }
  );
});

// T-A2: public context with IP in capacity → E_PUBLIC_CONTEXT_LEAK
test("T-A2: public context with RFC1918 IP in capacity → E_PUBLIC_CONTEXT_LEAK", () => {
  const ctx = makePublicCtx({
    capacity: { nodeLabels: { "kubernetes.io/arch": ["192.168.1.1"] } },
  });
  assert.throws(
    () => enforce_visibility_rules(ctx),
    (err) => {
      assert.ok(err.message.includes("E_PUBLIC_CONTEXT_LEAK"));
      return true;
    }
  );
});

// T-A6: mismatched schemaVersion → E_SCHEMA_VERSION_MISMATCH
test("T-A6: mismatched schemaVersion → E_SCHEMA_VERSION_MISMATCH", () => {
  const ctx = makePublicCtx({ schemaVersion: "0.15.0" });
  assert.throws(
    () => validateClusterContext(ctx),
    (err) => {
      assert.ok(err.message.includes("E_SCHEMA_VERSION_MISMATCH"));
      return true;
    }
  );
});

// T-A8: redactToPublic removes spec.internal; SC-8 residuals → E_REDACT_LEAK_RESIDUAL
test("T-A8: redactToPublic removes spec.internal", () => {
  const internal = makeInternalCtx();
  const pub = redactToPublic(internal);
  assert.equal(pub.metadata.visibility, "public");
  assert.equal(pub.metadata.name, "production-public");
  assert.ok(!("internal" in pub.spec));
});

test("T-A8b: redactToPublic rejects non-internal context", () => {
  const pub = makePublicCtx();
  assert.throws(
    () => redactToPublic(pub),
    (err) => {
      assert.ok(err.message.includes("E_REDACT_NOT_INTERNAL"));
      return true;
    }
  );
});

test("T-A8c: redactToPublic throws E_REDACT_LEAK_RESIDUAL if SC-8 pattern in non-internal fields", () => {
  const internal = makeInternalCtx({
    // Put an IP in a non-internal field that won't be removed
    cluster: "192.168.1.100",
  });
  assert.throws(
    () => redactToPublic(internal),
    (err) => {
      assert.ok(err.message.includes("E_REDACT_LEAK_RESIDUAL"), `Expected E_REDACT_LEAK_RESIDUAL but got: ${err.message}`);
      return true;
    }
  );
});

// T-A3: unknown node label key → E_UNKNOWN_NODE_LABEL_KEY
test("T-A3: unknown node label key → E_UNKNOWN_NODE_LABEL_KEY", () => {
  assert.throws(
    () => assertNodeLabelsOnAllowlist({ "unknown-key": ["value"] }),
    (err) => {
      assert.ok(err.message.includes("E_UNKNOWN_NODE_LABEL_KEY"));
      return true;
    }
  );
});

// Known label key should not throw
test("T-A3b: known node label key passes", () => {
  assert.doesNotThrow(() => assertNodeLabelsOnAllowlist({ "kubernetes.io/arch": ["amd64"] }));
});

// scanAllStringFields tests
test("scanAllStringFields finds pattern in nested string", () => {
  const obj = { a: { b: "192.168.1.1" } };
  const hits = scanAllStringFields(obj, [{ category: "rfc1918", patterns: [/192\.168\./] }]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].category, "rfc1918");
  assert.equal(hits[0].path, "a.b");
});

test("scanAllStringFields finds pattern in array", () => {
  const obj = ["clean", "10.0.0.1"];
  const hits = scanAllStringFields(obj, [{ category: "rfc1918", patterns: [/10\./] }]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "[1]");
});

test("validateClusterContext passes for valid public context", () => {
  const ctx = makePublicCtx();
  const result = validateClusterContext(ctx);
  assert.equal(result.metadata.visibility, "public");
});
