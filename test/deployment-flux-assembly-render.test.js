import assert from "node:assert/strict";
import { test } from "node:test";
import { loadYamlDocument } from "../src/deployment/io.js";
import { buildProjectModel } from "../src/deployment/model.js";
import { renderFluxAssembly } from "../src/deployment/render/flux-assembly.js";

const fixture = (name) => `fixtures/deployment/${name}`;

function baseModel() {
  return buildProjectModel({
    environment: "production",
    sources: loadYamlDocument(fixture("deployment-sources.yml")).spec,
    lock: loadYamlDocument(fixture("deployment.lock.yml")),
    nodeContract: loadYamlDocument(fixture("node-contract.lock.yml")),
    reachability: loadYamlDocument(fixture("reachability.yml")),
    deployments: [loadYamlDocument(fixture("deployment.yml"))],
    collections: [loadYamlDocument(fixture("collection.yml"))],
    envFiles: {},
  });
}

function byPath(files) {
  return new Map(files.map((file) => [file.path, file]));
}

test("renderFluxAssembly mirrors live pack/source assembly and group kustomizations", () => {
  const model = baseModel();
  model.sources.platformBlueprints = {
    repo: "file://test/fixtures/blueprint-packs",
    ref: "fixture",
    paths: ["test/fixtures/blueprint-packs"],
  };
  model.flux.packs = {
    core: ["cert-manager"],
    observability: { gatus: true },
    data: {
      mariadb: {
        values: {
          database: "assistant",
          username: "assistant",
          storageSize: "20Gi",
        },
      },
    },
  };

  const files = renderFluxAssembly(model).files;
  const paths = byPath(files);

  assert.ok(paths.has("apps/core/cert-manager/kustomization.yaml"));
  assert.ok(paths.has("apps/core/cert-manager/source.yaml"));
  assert.ok(paths.has("apps/core/cert-manager/release.yaml"));
  assert.match(paths.get("apps/core/kustomization.yaml").content, /- cert-manager/);
  assert.ok(paths.has("apps/data/bitnami-source.yaml"));
  assert.ok(paths.has("apps/data/bitnami-oci-source.yaml"));
  assert.ok(paths.has("apps/data/mariadb/release.yaml"));
  assert.match(paths.get("apps/data/kustomization.yaml").content, /- mariadb/);
  assert.match(paths.get("apps/observability/gatus/kustomization.yaml").content, /gatus-endpoints-configmap\.yaml/);
  assert.doesNotMatch(paths.get("apps/observability/gatus/kustomization.yaml").content, /endpoints-placeholder\.yaml/);
  assert.deepEqual(files.map((file) => file.path), [...files].map((file) => file.path).sort());
  assert.doesNotMatch(files.map((file) => file.content).join("\n"), /\$\{[A-Z0-9_]+\}/);
});
