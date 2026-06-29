import assert from "node:assert/strict";
import { test } from "node:test";
import { loadYamlDocument } from "../src/deployment/io.js";
import { readDeploymentLock } from "../src/deployment/lockfile.js";
import { resolveSources } from "../src/deployment/source-resolver.js";

test("resolveSources reports deterministic lock mismatches", () => {
  const sourcesDocument = loadYamlDocument("fixtures/deployment/deployment-sources.yml");
  const lock = readDeploymentLock(loadYamlDocument("fixtures/deployment/deployment.lock.yml"));
  const sources = {
    environments: sourcesDocument.spec.environments,
    firstParty: sourcesDocument.spec.firstParty,
    collections: {
      ...sourcesDocument.spec.collections,
      data: { ...sourcesDocument.spec.collections.data, ref: "feature" },
    },
    hosts: sourcesDocument.spec.hosts,
    platformBlueprints: sourcesDocument.spec.platformBlueprints,
    policies: sourcesDocument.spec.policies,
  };

  const result = resolveSources(sources, lock);

  assert.equal(result.valid, false);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.path), ["/collections/data/ref"]);
});

test("resolveSources reports unlocked and git-ref mismatches", () => {
  const sourcesDocument = loadYamlDocument("fixtures/deployment/deployment-sources.yml");
  const lock = readDeploymentLock(loadYamlDocument("fixtures/deployment/deployment.lock.yml"));
  delete lock.inputs.firstParty["assistant-api"];
  delete lock.inputs.homelabHosts;
  lock.inputs.platformBlueprints.ref = "other";
  const sources = {
    environments: sourcesDocument.spec.environments,
    firstParty: sourcesDocument.spec.firstParty,
    collections: sourcesDocument.spec.collections,
    hosts: sourcesDocument.spec.hosts,
    platformBlueprints: sourcesDocument.spec.platformBlueprints,
    policies: sourcesDocument.spec.policies,
  };

  const result = resolveSources(sources, lock);

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.path), [
    "/firstParty/assistant-api",
    "/hosts",
    "/platformBlueprints/ref",
  ]);
});
