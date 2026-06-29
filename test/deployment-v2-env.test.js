import assert from "node:assert/strict";
import { test } from "node:test";
import { applyEnvironment, deepMerge, loadEnvironmentFiles } from "../src/deployment-v2/env.js";
import { loadYamlDocument } from "../src/deployment-v2/io.js";

test("loadEnvironmentFiles applies runtime before selected environment", () => {
  const base = loadYamlDocument("fixtures/deployment-v2/deployment.yml");
  const envFiles = loadEnvironmentFiles({
    deploymentPath: "fixtures/deployment-v2/deployment.yml",
    environment: "production",
  });
  const merged = applyEnvironment(base, envFiles, "production");

  assert.equal(merged.spec.workloads["assistant-api"].replicas, 2);
  assert.equal(merged.spec.values.LOG_LEVEL, "warn");
});

test("deepMerge merges objects, replaces arrays and scalars, and preserves null", () => {
  assert.deepEqual(deepMerge(
    { object: { keep: true, replace: { old: true } }, list: [1], scalar: "old", nil: "value" },
    { object: { replace: { next: true } }, list: [2], scalar: "new", nil: null },
  ), {
    object: { keep: true, replace: { old: true, next: true } },
    list: [2],
    scalar: "new",
    nil: null,
  });
});
