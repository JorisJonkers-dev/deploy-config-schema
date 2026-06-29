import assert from "node:assert/strict";
import { test } from "node:test";
import { loadYamlDocument } from "../src/deployment/io.js";
import { extractLockedImages, readDeploymentLock, updateDeploymentLock } from "../src/deployment/lockfile.js";

test("extractLockedImages returns sorted unique image refs", () => {
  const lock = readDeploymentLock(loadYamlDocument("fixtures/deployment/deployment.lock.yml"));
  lock.inputs.images.duplicate = "ghcr.io/twin/gatus:v5.20.0";

  assert.deepEqual(extractLockedImages(lock), [
    "ghcr.io/jorisjonkers-dev/assistant-api:v1.2.3",
    "ghcr.io/jorisjonkers-dev/platform-postgres:v16",
    "ghcr.io/twin/gatus:v5.20.0",
  ]);
});

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
