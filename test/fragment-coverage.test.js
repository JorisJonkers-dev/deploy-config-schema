import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import {
  behavioralDiff,
  deterministicTimestamp,
  extractImageRefs,
  filterBySelector,
  getPackageVersion,
  listYamlFilesRecursive,
  loadFragmentInputFromPaths,
  renderEdgeCatalogFragment,
  renderGatusEndpointFragment,
  validateRawManifests,
} from "../src/index.js";
import { runCli } from "../src/cli.js";

const FIXTURES = "test/fixtures/deployment-v2";
const PINNED_REF = `ghcr.io/org/ctx@sha256:${"0".repeat(64)}`;

function stream() {
  return {
    chunks: [],
    write(chunk) {
      this.chunks.push(String(chunk));
      return true;
    },
    text() {
      return this.chunks.join("");
    },
  };
}

function versionedContextPath() {
  const raw = readFileSync(join(FIXTURES, "contexts/public.yml"), "utf8");
  const doc = YAML.parse(raw);
  doc.spec.schemaVersion = getPackageVersion();
  const tmp = join(mkdtempSync(join(tmpdir(), "dcs-ctx-")), "public.yml");
  writeFileSync(tmp, YAML.stringify(doc));
  return tmp;
}

function fixtureInput() {
  return loadFragmentInputFromPaths({
    deployPath: join(FIXTURES, "minimal/deployment.yml"),
    imagesPath: join(FIXTURES, "minimal/images.lock.json"),
    contextRef: PINNED_REF,
    contextPath: versionedContextPath(),
    env: "production",
    adapterCompatDigest: "sha256:deadbeef",
  });
}

function inputWith(deploymentPatch) {
  const base = fixtureInput();
  return {
    ...base,
    deployment: { ...base.deployment, spec: { ...base.deployment.spec, ...deploymentPatch } },
  };
}

test("behavioralDiff reports added, removed and changed resources", () => {
  const current = [
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "only-current", namespace: "ns" } },
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "shared", namespace: "ns" }, data: { key: "a" } },
  ];
  const rendered = [
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "shared", namespace: "ns" }, data: { key: "b" } },
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "only-rendered", namespace: "ns" } },
  ];
  assert.deepEqual(behavioralDiff(current, rendered), [
    "added: v1/ConfigMap/ns/only-rendered",
    "changed: v1/ConfigMap/ns/shared",
    "removed: v1/ConfigMap/ns/only-current",
  ]);
});

test("filterBySelector matches labels and rejects malformed selectors", () => {
  const manifests = [
    { kind: "Deployment", metadata: { name: "a", labels: { tier: "web" } } },
    { kind: "Deployment", metadata: { name: "b", labels: { tier: "db" } } },
    { kind: "Deployment", metadata: { name: "c" } },
  ];
  assert.deepEqual(filterBySelector(manifests, "tier=web").map((m) => m.metadata.name), ["a"]);
  assert.throws(() => filterBySelector(manifests, "no-equals-sign"), /E_INVALID_SELECTOR/);
  assert.throws(() => filterBySelector(manifests, "=value"), /E_INVALID_SELECTOR/);
});

test("extractImageRefs walks arrays and nested objects, skipping non-string image fields", () => {
  const doc = {
    spec: {
      containers: [
        { image: "ghcr.io/org/a@sha256:1" },
        { image: "ghcr.io/org/b@sha256:2" },
        { image: { nested: true } },
      ],
    },
  };
  assert.deepEqual(extractImageRefs(doc), ["ghcr.io/org/a@sha256:1", "ghcr.io/org/b@sha256:2"]);
  assert.deepEqual(extractImageRefs([{ image: "x@sha256:3" }]), ["x@sha256:3"]);
  assert.deepEqual(extractImageRefs("just-a-string"), []);
});

test("listYamlFilesRecursive handles missing roots and single-file roots", () => {
  assert.deepEqual(listYamlFilesRecursive("/nonexistent/path/xyz123"), []);
  const root = mkdtempSync(join("dist", "yaml-list-"));
  try {
    const yamlFile = join(root, "one.yaml");
    writeFileSync(yamlFile, "kind: ConfigMap\n");
    const txtFile = join(root, "two.txt");
    writeFileSync(txtFile, "not yaml\n");
    assert.deepEqual(listYamlFilesRecursive(yamlFile), [yamlFile]);
    assert.deepEqual(listYamlFilesRecursive(txtFile), []);
    assert.deepEqual(listYamlFilesRecursive(root), [yamlFile]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("edge-catalog without owner/authMode defaults renders nulls", () => {
  const base = fixtureInput();
  const input = {
    ...base,
    deployment: {
      ...base.deployment,
      spec: {
        ...base.deployment.spec,
        workloads: [{ name: "other", image: { alias: "app" }, routes: [{ host: "x.example.com" }] }],
      },
    },
  };
  const catalog = renderEdgeCatalogFragment(input);
  assert.equal(catalog.entries.length, 1);
  assert.equal(catalog.entries[0].owner, null);
  assert.equal(catalog.entries[0].authMode, null);
  assert.equal(catalog.entries[0].imageDigest, null);
});

test("gatus fragment skips workloads without a health path", () => {
  const input = inputWith({ workloads: [{ name: "app", image: { alias: "app" } }] });
  assert.deepEqual(renderGatusEndpointFragment(input).endpoints, []);
});

test("deterministicTimestamp outside deterministic runtime is wall-clock", () => {
  assert.notEqual(deterministicTimestamp(), "1970-01-01T00:00:00.000Z");
});

test("validateRawManifests accepts a single yaml file root and ignores non-yaml roots", () => {
  const deployment = {
    kind: "Deployment",
    metadata: { name: "test-service" },
    spec: {
      namespace: "test-ns",
      workloads: [{ name: "app", rawManifests: { enabled: true, path: "deploy/raw-manifests" } }],
    },
  };
  const root = mkdtempSync(join("dist", "raw-single-"));
  try {
    const yamlFile = join(root, "cm.yaml");
    writeFileSync(yamlFile, [
      "apiVersion: v1",
      "kind: ConfigMap",
      "metadata:",
      "  name: cm",
      "  namespace: test-ns",
      "  annotations:",
      "    platform.jorisjonkers.dev/raw-reason: legacy",
      "",
    ].join("\n"));
    const guard = validateRawManifests({ deployment, root: yamlFile });
    assert.equal(guard.present, true);
    assert.equal(guard.violations.length, 0);
    const txtFile = join(root, "notes.txt");
    writeFileSync(txtFile, "not yaml\n");
    const guardTxt = validateRawManifests({ deployment, root: txtFile });
    assert.equal(guardTxt.present, true);
    assert.equal(guardTxt.violations.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: render fragment writes to stdout without --output", async () => {
  const root = mkdtempSync(join("dist", "cli-stdout-"));
  try {
    const deployDir = join(root, "deploy");
    mkdirSync(deployDir, { recursive: true });
    writeFileSync(join(deployDir, "deployment.yml"), readFileSync(join(FIXTURES, "minimal/deployment.yml")));
    const stdout = stream();
    const stderr = stream();
    const code = await runCli([
      "render", "gatus-endpoint-fragment", deployDir,
      "--env", "production",
      "--images", join(FIXTURES, "minimal/images.lock.json"),
      "--context", PINNED_REF,
      "--context-path", versionedContextPath(),
    ], { stdout, stderr });
    assert.equal(code, 0, stderr.text());
    assert.equal(YAML.parse(stdout.text()).kind, "GatusEndpointFragment");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: render fragment surfaces load errors with the E_ code", async () => {
  const root = mkdtempSync(join("dist", "cli-err-"));
  try {
    const deployDir = join(root, "deploy");
    mkdirSync(deployDir, { recursive: true });
    writeFileSync(join(deployDir, "deployment.yml"), readFileSync(join(FIXTURES, "minimal/deployment.yml")));
    writeFileSync(join(root, "images.lock.json"), JSON.stringify({ app: "ghcr.io/org/app:latest" }));
    writeFileSync(join(root, "cluster-context-public.yml"), readFileSync(versionedContextPath()));
    const stdout = stream();
    const stderr = stream();
    const code = await runCli([
      "render", "gatus-endpoint-fragment", deployDir,
      "--env", "production",
      "--images", join(root, "images.lock.json"),
      "--context-dir", root,
    ], { stdout, stderr });
    assert.equal(code, 1);
    assert.match(stderr.text(), /E_FLOATING_IMAGE/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: artifact emit-contract collects files from --output-root and rejects unpinned refs", async () => {
  const root = mkdtempSync(join("dist", "cli-contract-root-"));
  try {
    const outputRoot = join(root, "artifact");
    mkdirSync(join(outputRoot, "out/manifests/production"), { recursive: true });
    writeFileSync(join(outputRoot, "out/manifests/production/workloads.yaml"), "kind: KubernetesWorkloadFragment\n");
    writeFileSync(join(outputRoot, "artifact-contract.yaml"), "kind: DeployArtifactContract\n");
    const stdout = stream();
    const stderr = stream();
    const args = [
      "artifact", "emit-contract",
      "--artifact-name", "svc",
      "--environments", "production",
      "--images", join(FIXTURES, "minimal/images.lock.json"),
      "--deployment", join(FIXTURES, "minimal/deployment.yml"),
      "--context", versionedContextPath(),
      "--output-root", outputRoot,
      "--out", join(root, "artifact-contract.yaml"),
    ];
    const code = await runCli([...args, "--context-ref", PINNED_REF], { stdout, stderr });
    assert.equal(code, 0, stderr.text());
    const contract = YAML.parse(readFileSync(join(root, "artifact-contract.yaml"), "utf8"));
    assert.equal(contract.spec.provenance_verified, false);
    const badStderr = stream();
    const badCode = await runCli([...args, "--context-ref", "ghcr.io/org/ctx:v1"], { stdout: stream(), stderr: badStderr });
    assert.equal(badCode, 1);
    assert.match(badStderr.text(), /E_CONTEXT_REF_NOT_PINNED/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: artifact usage errors return exit code 2", async () => {
  const missingContract = await runCli(["artifact", "emit-contract", "--artifact-name", "svc"], { stdout: stream(), stderr: stream() });
  assert.equal(missingContract, 2);
  const missingHealth = await runCli(["artifact", "emit-kustomization-health", "--env", "production"], { stdout: stream(), stderr: stream() });
  assert.equal(missingHealth, 2);
});

