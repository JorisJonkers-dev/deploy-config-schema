import assert from "node:assert/strict";
import { test } from "node:test";
import { loadYamlDocument } from "../src/deployment/io.js";
import { readDeploymentLock, updateDeploymentLock } from "../src/deployment/lockfile.js";

test("updateDeploymentLock can refresh rendered root digest", () => {
  const lock = readDeploymentLock(loadYamlDocument("fixtures/deployment/deployment.lock.yml"));
  const updated = updateDeploymentLock(lock, {
    renderedFiles: [
      { path: "b.yaml", content: "b\n", adapter: "test" },
      { path: "a.yaml", content: "a\n", adapter: "test" },
    ],
  });

  assert.match(updated.metadata.renderedRootDigest, /^sha256:[a-f0-9]{64}$/);
});
