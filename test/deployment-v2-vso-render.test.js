import assert from "node:assert/strict";
import { test } from "node:test";
import YAML from "yaml";
import { renderVso } from "../src/deployment-v2/render/vso.js";

function doc(file) {
  return YAML.parse(file.content);
}

function model() {
  return {
    providerGraph: {
      vault: {
        namespace: "vso-system",
        basePath: "apps/vso-secrets",
        address: "https://vault.example.net",
        connectionName: "default",
        authName: "default",
        authMount: "kubernetes",
        authRole: "vso",
        operatorServiceAccount: "vault-secrets-operator",
        kvMount: "kv",
        staticSyncs: {
          "app-runtime": {
            target: { name: "app-runtime", namespace: "apps" },
            mount: "kv",
            path: "kv/data/apps/app-runtime",
            refreshAfter: "30m",
            rolloutRestartTargets: [{ kind: "Deployment", name: "app" }],
          },
        },
        dynamicSyncs: {
          "app-postgres": {
            target: { name: "app-postgres", namespace: "apps" },
            engine: "database",
            role: "app-postgres",
            renewalPercent: 80,
          },
        },
      },
    },
  };
}

test("deploy-v2 VSO renders connection auth sync resources and kustomization", () => {
  const result = renderVso(model());
  assert.deepEqual(result.files.map((file) => file.path), [
    "apps/vso-secrets/app-postgres.yaml",
    "apps/vso-secrets/app-runtime.yaml",
    "apps/vso-secrets/apps-serviceaccount.yaml",
    "apps/vso-secrets/kustomization.yaml",
    "apps/vso-secrets/vault-auth.yaml",
    "apps/vso-secrets/vault-connection.yaml",
  ]);

  assert.deepEqual(doc(result.files.find((file) => file.path.endsWith("vault-connection.yaml"))), {
    apiVersion: "secrets.hashicorp.com/v1beta1",
    kind: "VaultConnection",
    metadata: { name: "default", namespace: "vso-system" },
    spec: { address: "https://vault.example.net" },
  });

  const auth = doc(result.files.find((file) => file.path.endsWith("vault-auth.yaml")));
  assert.equal(auth.spec.vaultConnectionRef, "default");
  assert.equal(auth.spec.kubernetes.role, "vso");
  assert.equal(auth.spec.kubernetes.serviceAccount, "vault-secrets-operator");

  const staticSecret = doc(result.files.find((file) => file.path.endsWith("app-runtime.yaml")));
  assert.equal(staticSecret.spec.vaultAuthRef, "vso-system/default");
  assert.equal(staticSecret.spec.path, "apps/app-runtime");
  assert.equal(staticSecret.spec.refreshAfter, "30m");
  assert.deepEqual(staticSecret.spec.rolloutRestartTargets, [{ kind: "Deployment", name: "app" }]);

  const dynamicSecret = doc(result.files.find((file) => file.path.endsWith("app-postgres.yaml")));
  assert.equal(dynamicSecret.spec.mount, "database");
  assert.equal(dynamicSecret.spec.path, "creds/app-postgres");
  assert.equal(dynamicSecret.spec.renewalPercent, 80);

  const kustomization = doc(result.files.find((file) => file.path.endsWith("kustomization.yaml")));
  assert.deepEqual(kustomization.resources, [
    "app-postgres.yaml",
    "app-runtime.yaml",
    "apps-serviceaccount.yaml",
    "vault-auth.yaml",
    "vault-connection.yaml",
  ]);
});
