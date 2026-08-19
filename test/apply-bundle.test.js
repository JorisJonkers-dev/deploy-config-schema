import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { buildApplyBundle } from "../src/artifact/apply-bundle.js";
import { runCli } from "../src/cli.js";

const stream = () => {
  let text = "";
  return { write: (chunk) => { text += chunk; }, text: () => text };
};

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "apply-bundle-"));
  const manifests = join(root, "manifests");
  mkdirSync(manifests, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(manifests, name), typeof body === "string" ? body : YAML.stringify(body));
  }
  return { manifests, out: join(root, "out") };
}

const WORKLOAD = {
  kind: "KubernetesWorkloadFragment",
  manifests: [
    { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "auth-ui", namespace: "auth-system" } },
    { apiVersion: "v1", kind: "ServiceAccount", metadata: { name: "auth-ui", namespace: "auth-system" } },
  ],
};

test("lifts workload manifests into one applyable document per object", () => {
  const { manifests, out } = fixture({ "kubernetes-workload-fragment.yaml": WORKLOAD });
  const result = buildApplyBundle(manifests, out);

  assert.equal(result.valid, true);
  assert.deepEqual(result.resources, ["deployment-auth-ui.yaml", "serviceaccount-auth-ui.yaml"]);

  // Each file must be a bare Kubernetes object: a fragment wrapper here is
  // exactly what kustomize rejects.
  const deployment = YAML.parse(readFileSync(join(out, "deployment-auth-ui.yaml"), "utf8"));
  assert.equal(deployment.apiVersion, "apps/v1");
  assert.equal(deployment.kind, "Deployment");
  assert.equal(deployment.metadata.name, "auth-ui");
  assert.equal(deployment.manifests, undefined);
});

test("writes a kustomization listing every resource in sorted order", () => {
  const { manifests, out } = fixture({ "kubernetes-workload-fragment.yaml": WORKLOAD });
  buildApplyBundle(manifests, out);

  const kustomization = YAML.parse(readFileSync(join(out, "kustomization.yaml"), "utf8"));
  assert.equal(kustomization.apiVersion, "kustomize.config.k8s.io/v1beta1");
  assert.equal(kustomization.kind, "Kustomization");
  assert.deepEqual(kustomization.resources, ["deployment-auth-ui.yaml", "serviceaccount-auth-ui.yaml"]);
  assert.deepEqual(readdirSync(out).sort(), ["deployment-auth-ui.yaml", "kustomization.yaml", "serviceaccount-auth-ui.yaml"]);
});

test("skips each intent fragment and says why rather than dropping it silently", () => {
  const { manifests, out } = fixture({
    "kubernetes-workload-fragment.yaml": WORKLOAD,
    "traefik-route-fragment.yaml": { kind: "TraefikRouteFragment", routes: [{ host: "auth.example" }] },
    "gatus-endpoint-fragment.yaml": { kind: "GatusEndpointFragment", endpoints: [{ name: "auth-ui" }] },
    "edge-catalog-fragment.yaml": { kind: "EdgeCatalogFragment", entries: [{ service: "auth-ui" }] },
    "image-metadata-fragment.yaml": { kind: "ImageMetadataFragment", images: [{ alias: "auth-ui" }] },
  });
  const result = buildApplyBundle(manifests, out);

  assert.equal(result.valid, true);
  assert.deepEqual(
    result.skipped.map((s) => s.kind).sort(),
    ["EdgeCatalogFragment", "GatusEndpointFragment", "ImageMetadataFragment", "TraefikRouteFragment"],
  );
  for (const entry of result.skipped) assert.match(entry.reason, /composed cluster-wide/);
  assert.deepEqual(result.resources, ["deployment-auth-ui.yaml", "serviceaccount-auth-ui.yaml"]);
});

test("an unrecognised fragment kind is an error, not a silent skip", () => {
  // A new fragment type carrying cluster objects must not be dropped: the
  // artifact would publish objects that never reach the cluster.
  const { manifests, out } = fixture({ "future-fragment.yaml": { kind: "SomeFutureFragment", things: [] } });
  const result = buildApplyBundle(manifests, out);

  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].code, "E_FRAGMENT_KIND_UNKNOWN");
  assert.match(result.diagnostics[0].message, /SomeFutureFragment/);
});

test("refuses to write an empty bundle when only intent fragments are present", () => {
  const { manifests, out } = fixture({
    "traefik-route-fragment.yaml": { kind: "TraefikRouteFragment", routes: [] },
  });
  const result = buildApplyBundle(manifests, out);

  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].code, "E_NO_APPLYABLE_OBJECTS");
});

test("reports a missing manifests directory rather than throwing", () => {
  const result = buildApplyBundle(join(tmpdir(), "apply-bundle-absent-dir"), join(tmpdir(), "apply-bundle-out"));
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].code, "E_MANIFESTS_DIR_MISSING");
});

test("rejects a fragment whose payload is not an array", () => {
  const { manifests, out } = fixture({ "kubernetes-workload-fragment.yaml": { kind: "KubernetesWorkloadFragment", manifests: {} } });
  const result = buildApplyBundle(manifests, out);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].code, "E_FRAGMENT_PAYLOAD_MISSING");
});

test("rejects a payload entry that is not a Kubernetes object", () => {
  const { manifests, out } = fixture({
    "kubernetes-workload-fragment.yaml": { kind: "KubernetesWorkloadFragment", manifests: [{ metadata: { name: "x" } }] },
  });
  const result = buildApplyBundle(manifests, out);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].code, "E_MANIFEST_INVALID");
});

test("rejects a fragment with no kind and one that is not a mapping", () => {
  const missingKind = fixture({ "a.yaml": { manifests: [] } });
  assert.equal(buildApplyBundle(missingKind.manifests, missingKind.out).diagnostics[0].code, "E_FRAGMENT_KIND_MISSING");

  const notMapping = fixture({ "a.yaml": "- one\n- two\n" });
  assert.equal(buildApplyBundle(notMapping.manifests, notMapping.out).diagnostics[0].code, "E_FRAGMENT_MALFORMED");
});

test("refuses when two objects would render to the same file", () => {
  const { manifests, out } = fixture({
    "kubernetes-workload-fragment.yaml": {
      kind: "KubernetesWorkloadFragment",
      manifests: [
        { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "dup", namespace: "a" } },
        { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "dup", namespace: "b" } },
      ],
    },
  });
  const result = buildApplyBundle(manifests, out);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0].code, "E_RESOURCE_NAME_COLLISION");
  assert.match(result.diagnostics[0].message, /deployment-dup\.yaml/);
});

test("CLI emit-apply-bundle reports usage without both flags and succeeds with them", async () => {
  const stdout = stream();
  const stderr = stream();
  assert.equal(await runCli(["artifact", "emit-apply-bundle"], { stdout, stderr }), 2);
  assert.match(stderr.text(), /emit-apply-bundle --manifests <dir> --out <dir>/);

  const { manifests, out } = fixture({ "kubernetes-workload-fragment.yaml": WORKLOAD });
  const okOut = stream();
  const okErr = stream();
  assert.equal(await runCli(["artifact", "emit-apply-bundle", "--manifests", manifests, "--out", out], { stdout: okOut, stderr: okErr }), 0, okErr.text());
  const payload = JSON.parse(okOut.text());
  assert.equal(payload.valid, true);
  assert.deepEqual(payload.resources, ["deployment-auth-ui.yaml", "serviceaccount-auth-ui.yaml"]);
});
