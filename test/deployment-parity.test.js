import assert from "node:assert/strict";
import { copyFileSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  compareParityTrees,
  normalizeParityTree,
  unifiedDiff,
} from "../src/deployment/parity.js";

const fixtureRoot = join("test", "fixtures", "deployment", "parity");
const currentFixture = join(fixtureRoot, "current");
const renderedFixture = join(fixtureRoot, "rendered");

function tempTrees() {
  const root = mkdtempSync(join(tmpdir(), "deployment-parity-"));
  const current = join(root, "current");
  const rendered = join(root, "rendered");
  cpSync(currentFixture, current, { recursive: true });
  cpSync(renderedFixture, rendered, { recursive: true });
  return { current, rendered };
}

function edit(root, path, mutate) {
  const fullPath = join(root, path);
  writeFileSync(fullPath, mutate(readFileSync(fullPath, "utf8")));
}

function reportAfterRenderedMutation(mutate) {
  const trees = tempTrees();
  mutate(trees.rendered);
  return compareParityTrees(trees);
}

test("normalizeParityTree canonicalizes JSON, multidoc YAML, path objects, and volatile fields", () => {
  const objects = normalizeParityTree(currentFixture);

  assert.equal(objects.has("source.toolkit.fluxcd.io/v1/GitRepository/flux-system/flux-system"), true);
  assert.equal(objects.has("v1/Namespace/_cluster/demo"), true);
  assert.equal(objects.has("apps/v1/Deployment/demo/api"), true);
  assert.equal(objects.has("v1/Service/demo/api"), true);
  assert.equal(objects.has("_path/apps/kustomization.yaml#0"), true);

  const source = objects.get("source.toolkit.fluxcd.io/v1/GitRepository/flux-system/flux-system")?.normalized ?? "";
  assert.doesNotMatch(source, /url:/);
  assert.doesNotMatch(source, /branch:/);
  assert.doesNotMatch(source, /creationTimestamp/);
  assert.doesNotMatch(source, /last-applied-configuration/);
  assert.doesNotMatch(source, /^status:/m);
});

test("compareParityTrees passes identical normalized trees", () => {
  const report = compareParityTrees({ current: currentFixture, rendered: currentFixture });

  assert.equal(report.ok, true);
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.summary.changed, 0);
});

test("compareParityTrees allows only the mandatory Flux source switch differences", () => {
  const report = compareParityTrees({ current: currentFixture, rendered: renderedFixture });

  assert.equal(report.ok, true);
  assert.equal(report.summary.missing, 0);
  assert.equal(report.summary.extra, 0);
  assert.equal(report.summary.changed, 0);
  assert.equal(report.summary.duplicates, 0);
});

test("compareParityTrees fails for desired state differences", async (t) => {
  const cases = [
    {
      name: "image",
      mutate: (root) => edit(root, "apps/api.yaml", (content) => content.replace("ghcr.io/acme/api:v1", "ghcr.io/acme/api:v2")),
      assertReport: (report) => {
        assert.equal(report.summary.changed, 1);
        assert.equal(report.changed[0].key, "apps/v1/Deployment/demo/api");
        assert.match(report.changed[0].diff, /ghcr\.io\/acme\/api:v2/);
      },
    },
    {
      name: "Traefik annotation",
      mutate: (root) => edit(root, "edge/ingressroute.yaml", (content) => content.replace("api.example.com", "admin.example.com")),
      assertReport: (report) => assert.equal(report.changed[0].key, "traefik.io/v1alpha1/IngressRoute/demo/api-public"),
    },
    {
      name: "VSO destination Secret",
      mutate: (root) => edit(root, "secrets/vso.yaml", (content) => content.replace("  destination:\n    create: true\n    name: api-secret", "  destination:\n    create: true\n    name: api-secret-v2")),
      assertReport: (report) => assert.equal(report.changed[0].key, "secrets.hashicorp.com/v1beta1/VaultStaticSecret/demo/api-secret"),
    },
    {
      name: "namespace",
      mutate: (root) => edit(root, "apps/api.yaml", (content) => content.replace("  namespace: demo\n  annotations:", "  namespace: prod\n  annotations:")),
      assertReport: (report) => {
        assert.equal(report.summary.missing, 1);
        assert.equal(report.summary.extra, 1);
      },
    },
    {
      name: "ServiceMonitor",
      mutate: (root) => edit(root, "monitoring/servicemonitor.yaml", (content) => content.replace("interval: 30s", "interval: 60s")),
      assertReport: (report) => assert.equal(report.changed[0].key, "monitoring.coreos.com/v1/ServiceMonitor/demo/api"),
    },
    {
      name: "Gatus endpoint",
      mutate: (root) => edit(root, "observability/gatus.yaml", (content) => content.replace("/healthz", "/readyz")),
      assertReport: (report) => assert.equal(report.changed[0].key, "v1/ConfigMap/observability/gatus-endpoints"),
    },
    {
      name: "NetworkPolicy",
      mutate: (root) => edit(root, "network/networkpolicy.yaml", (content) => content.replace("10.0.0.0/24", "10.1.0.0/24")),
      assertReport: (report) => assert.equal(report.changed[0].key, "networking.k8s.io/v1/NetworkPolicy/demo/api-egress"),
    },
    {
      name: "RBAC",
      mutate: (root) => edit(root, "rbac/role.yaml", (content) => content.replace("- list", "- watch")),
      assertReport: (report) => assert.equal(report.changed[0].key, "rbac.authorization.k8s.io/v1/Role/demo/api-reader"),
    },
    {
      name: "dependsOn order",
      mutate: (root) => edit(root, "flux/apps.yaml", (content) => content.replace("dependsOn:\n    - name: infrastructure\n    - name: secrets", "dependsOn:\n    - name: secrets\n    - name: infrastructure")),
      assertReport: (report) => assert.equal(report.changed[0].key, "kustomize.toolkit.fluxcd.io/v1/Kustomization/flux-system/apps"),
    },
    {
      name: "array order",
      mutate: (root) => edit(root, "apps/api.yaml", (content) => content.replace("- name: FIRST\n              value: \"1\"\n            - name: SECOND\n              value: \"2\"", "- name: SECOND\n              value: \"2\"\n            - name: FIRST\n              value: \"1\"")),
      assertReport: (report) => assert.equal(report.changed[0].key, "apps/v1/Deployment/demo/api"),
    },
    {
      name: "non-ignored Flux source field",
      mutate: (root) => edit(root, "cluster/source.yaml", (content) => content.replace("interval: 1m", "interval: 5m")),
      assertReport: (report) => assert.equal(report.changed[0].key, "source.toolkit.fluxcd.io/v1/GitRepository/flux-system/flux-system"),
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, () => {
      const report = reportAfterRenderedMutation(entry.mutate);
      assert.equal(report.ok, false);
      entry.assertReport(report);
    });
  }
});

test("compareParityTrees reports duplicate object identities as hard failures", () => {
  const trees = tempTrees();
  copyFileSync(join(trees.rendered, "apps", "service.json"), join(trees.rendered, "apps", "service-copy.json"));

  const report = compareParityTrees(trees);

  assert.equal(report.ok, false);
  assert.equal(report.summary.duplicates, 1);
  assert.equal(report.duplicates[0].key, "v1/Service/demo/api");
  assert.deepEqual([...report.duplicates[0].paths].sort(), ["rendered/apps/service-copy.json#0", "rendered/apps/service.json#0"]);
});

test("unifiedDiff returns an in-package line diff", () => {
  const diff = unifiedDiff("alpha\nbravo", "alpha\ncharlie");

  assert.match(diff, /^--- current/m);
  assert.match(diff, /^\+\+\+ rendered/m);
  assert.match(diff, /^-bravo/m);
  assert.match(diff, /^\+charlie/m);
});
