import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import {
  assertNoFloatingImages,
  assertNoUnselectedMutations,
  emitKustomizationHealth,
  validateDeploymentSemantics,
  buildOutputPaths,
  checkScopedParity,
  computeRenderHash,
  deterministicTimestamp,
  forbidAmbientAdapterInputs,
  getPackageVersion,
  isDeterministicRuntime,
  loadFragmentInput,
  loadFragmentInputFromPaths,
  parseDeploymentV2,
  renderEdgeCatalogFragment,
  renderGatusEndpointFragment,
  renderImageMetadataFragment,
  renderKubernetesWorkloadFragment,
  renderTraefikRouteFragment,
  requireDigestRef,
  validateContextCompatibility,
  withDeterministicRuntime,
} from "../src/index.js";
import { runCli } from "../src/cli.js";

const FIXTURES = "test/fixtures/deployment-v2";
const GOLDEN_PATH = "test/fixtures/golden/render-hash.txt";
const PINNED_REF = `ghcr.io/org/ctx@sha256:${"0".repeat(64)}`;
const PINNED_IMAGE = "ghcr.io/org/app:v1.0.0@sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

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

function versionedContextPath(filename = "public.yml") {
  const raw = readFileSync(join(FIXTURES, "contexts", filename), "utf8");
  const doc = YAML.parse(raw);
  doc.spec.schemaVersion = getPackageVersion();
  const tmp = join(mkdtempSync(join(tmpdir(), "dcs-ctx-")), filename);
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

function inputWith(deploymentPatch = {}, imagesPatch) {
  const base = fixtureInput();
  return {
    ...base,
    deployment: { ...base.deployment, spec: { ...base.deployment.spec, ...deploymentPatch } },
    ...(imagesPatch ? { images: imagesPatch } : {}),
  };
}

function renderAllFragments(input) {
  const env = input.environment;
  return {
    [`out/manifests/${env}/workloads.yaml`]: YAML.stringify(renderKubernetesWorkloadFragment(input), { lineWidth: 0 }),
    [`out/metadata/${env}/routes.yaml`]: YAML.stringify(renderTraefikRouteFragment(input), { lineWidth: 0 }),
    [`out/metadata/${env}/gatus-endpoints.yaml`]: YAML.stringify(renderGatusEndpointFragment(input), { lineWidth: 0 }),
    [`out/metadata/${env}/catalog.yaml`]: YAML.stringify(renderEdgeCatalogFragment(input), { lineWidth: 0 }),
    [`out/metadata/${env}/image-metadata.yaml`]: YAML.stringify(renderImageMetadataFragment(input), { lineWidth: 0 }),
  };
}

test("T-B1: render hash is stable across identical inputs (golden)", () => {
  const input = fixtureInput();
  const inputDigests = { deployment: input.deploymentDigest, imagesLock: input.imagesDigest, context: input.contextDigest };
  const hash1 = computeRenderHash(renderAllFragments(input), inputDigests, input.adapterCompatDigest, "sha512-AAAA==");
  const hash2 = computeRenderHash(renderAllFragments(fixtureInput()), inputDigests, input.adapterCompatDigest, "sha512-AAAA==");
  assert.equal(hash1, hash2);
  assert.ok(hash1.startsWith("sha256:"));
  if (!existsSync(GOLDEN_PATH)) {
    mkdirSync("test/fixtures/golden", { recursive: true });
    writeFileSync(GOLDEN_PATH, `${hash1}\n`);
  }
  assert.equal(hash1, readFileSync(GOLDEN_PATH, "utf8").trim());
});

test("T-B2: minimal deployment renders expected kubernetes-workload-fragment", () => {
  const result = renderKubernetesWorkloadFragment(fixtureInput());
  assert.deepEqual(result.manifests.map((m) => m.kind).sort(), ["Deployment", "ServiceAccount"]);
  assert.equal(result.manifests[0].metadata.namespace, "test-ns");
});

test("T-B2: routes render expected traefik-route-fragment", () => {
  const input = inputWith({
    workloads: [{
      name: "app",
      image: { alias: "app" },
      routeDefaults: { owner: "team-a", authMode: "forward-auth" },
      routes: [{ host: "app.example.com", expose: { tier: "public-frankfurt" } }],
    }],
  });
  const result = renderTraefikRouteFragment(input);
  assert.equal(result.routes.length, 1);
  assert.equal(result.routes[0].host, "app.example.com");
  assert.equal(result.routes[0].authMode, "forward-auth");
  assert.equal(result.routes[0].owner, "team-a");
  assert.equal(result.routes[0].tier, "public-frankfurt");
});

test("T-B2: gatus, edge-catalog and image-metadata fragments render", () => {
  const input = inputWith({
    workloads: [{
      name: "app",
      image: { alias: "app" },
      health: { path: "/health", port: 8080, timeoutClass: "stateless" },
      routeDefaults: { owner: "team-a", authMode: "forward-auth" },
      routes: [{ host: "app.example.com" }],
    }],
  });
  const gatus = renderGatusEndpointFragment(input);
  assert.equal(gatus.endpoints.length, 1);
  assert.equal(gatus.endpoints[0].name, "app");
  const catalog = renderEdgeCatalogFragment(input);
  assert.equal(catalog.entries.length, 1);
  assert.equal(catalog.entries[0].owner, "team-a");
  const meta = renderImageMetadataFragment(input);
  assert.equal(meta.images.length, 1);
  assert.equal(meta.images[0].alias, "app");
});

test("image-metadata: alias missing from lock → E_IMAGE_ALIAS_NOT_IN_LOCK", () => {
  const input = inputWith({ workloads: [{ name: "other", image: { alias: "other" } }] });
  assert.throws(() => renderImageMetadataFragment(input), /E_IMAGE_ALIAS_NOT_IN_LOCK/);
});

test("image-metadata: unpinned ref → E_FLOATING_IMAGE", () => {
  const input = inputWith(
    { workloads: [{ name: "app", image: { alias: "app" } }] },
    { app: "ghcr.io/org/app-v100" },
  );
  assert.throws(() => renderImageMetadataFragment(input), /E_FLOATING_IMAGE/);
});

test("kubernetes fragment: VaultStaticSecret credentials allowed, others forbidden", () => {
  const good = inputWith({
    workloads: [{
      name: "app",
      image: { alias: "app" },
      configMap: { LOG_LEVEL: "info" },
      credentials: [{ kind: "VaultStaticSecret", name: "app-secrets", mount: "kv" }],
    }],
  });
  const rendered = renderKubernetesWorkloadFragment(good);
  assert.deepEqual(rendered.manifests.map((m) => m.kind).sort(), ["ConfigMap", "Deployment", "ServiceAccount", "VaultStaticSecret"]);
  const bad = inputWith({
    workloads: [{ name: "app", image: { alias: "app" }, credentials: [{ kind: "Secret" }] }],
  });
  assert.throws(() => renderKubernetesWorkloadFragment(bad), /E_FORBIDDEN_KIND/);
});

test("kubernetes fragment: stateful workload renders StatefulSet with nodeSelector", () => {
  const input = inputWith({
    workloads: [{
      name: "db",
      image: { alias: "app" },
      stateful: true,
      migrationPolicy: { required: false, strategy: "none" },
      placement: { nodeSelector: { "kubernetes.io/arch": ["amd64"] } },
    }],
  });
  const rendered = renderKubernetesWorkloadFragment(input);
  const sts = rendered.manifests.find((m) => m.kind === "StatefulSet");
  assert.ok(sts);
  assert.deepEqual(sts.spec.template.spec.nodeSelector, { "kubernetes.io/arch": "amd64" });
});

test("T-B4: :latest image throws E_FLOATING_IMAGE (latest-tag)", () => {
  const dep = parseDeploymentV2(YAML.parse(readFileSync(join(FIXTURES, "minimal/deployment.yml"), "utf8")));
  assert.throws(() => assertNoFloatingImages(dep, { app: "ghcr.io/org/app:latest" }), /E_FLOATING_IMAGE.*latest-tag/);
});

test("T-B4: tag-only ref throws E_FLOATING_IMAGE (tag-only-unpinned)", () => {
  const dep = parseDeploymentV2(YAML.parse(readFileSync(join(FIXTURES, "minimal/deployment.yml"), "utf8")));
  assert.throws(() => assertNoFloatingImages(dep, { app: "ghcr.io/org/app:v1.2.3" }), /E_FLOATING_IMAGE.*tag-only-unpinned/);
});

test("T-B4: digest-pinned ref passes", () => {
  const dep = parseDeploymentV2(YAML.parse(readFileSync(join(FIXTURES, "minimal/deployment.yml"), "utf8")));
  assertNoFloatingImages(dep, { app: PINNED_IMAGE });
});

test("T-B4: bare image throws E_FLOATING_IMAGE (bare-no-tag-no-digest)", () => {
  const dep = parseDeploymentV2(YAML.parse(readFileSync(join(FIXTURES, "minimal/deployment.yml"), "utf8")));
  assert.throws(() => assertNoFloatingImages(dep, { app: "ghcr.io/org/app" }), /E_FLOATING_IMAGE.*bare-no-tag-no-digest/);
});

test("T-B5: route authMode not in tier.authModes → E_ROUTE_AUTH_MODE_NOT_IN_TIER", () => {
  const input = inputWith({
    workloads: [{
      name: "app",
      image: { alias: "app" },
      routes: [{ host: "x.lan", owner: "team-a", authMode: "forward-auth", expose: { tier: "lan" } }],
    }],
  });
  assert.throws(() => renderTraefikRouteFragment(input), /E_ROUTE_AUTH_MODE_NOT_IN_TIER/);
});

test("unknown route tier → E_UNKNOWN_ROUTE_TIER", () => {
  const input = inputWith({
    workloads: [{
      name: "app",
      image: { alias: "app" },
      routes: [{ host: "x.example.com", owner: "team-a", authMode: "forward-auth", expose: { tier: "nope" } }],
    }],
  });
  assert.throws(() => renderTraefikRouteFragment(input), /E_UNKNOWN_ROUTE_TIER/);
  assert.throws(() => validateContextCompatibility(input.deployment, input.context), /E_UNKNOWN_ROUTE_TIER/);
});

test("route missing owner/authMode in fragment render fails loud", () => {
  const noOwner = inputWith({ workloads: [{ name: "app", image: { alias: "app" }, routes: [{ host: "x.example.com", authMode: "forward-auth" }] }] });
  assert.throws(() => renderTraefikRouteFragment(noOwner), /E_ROUTE_OWNER_REQUIRED/);
  const noAuth = inputWith({ workloads: [{ name: "app", image: { alias: "app" }, routes: [{ host: "x.example.com", owner: "team-a" }] }] });
  assert.throws(() => renderTraefikRouteFragment(noAuth), /E_ROUTE_AUTH_MODE_REQUIRED/);
});

test("T-B6: multi-env kustomization-health render via CLI", async () => {
  const outRoot = mkdtempSync(join("dist", "multi-env-"));
  try {
    for (const env of ["production", "staging"]) {
      const stdout = stream();
      const stderr = stream();
      const code = await runCli([
        "artifact", "emit-kustomization-health",
        "--deployment", join(FIXTURES, "minimal/deployment.yml"),
        "--env", env,
        "--image-digests", join(FIXTURES, "minimal/images.lock.json"),
        "--out", join(outRoot, `out/metadata/${env}/kustomization-health.yml`),
      ], { stdout, stderr });
      assert.equal(code, 0, stderr.text());
      const doc = YAML.parse(readFileSync(join(outRoot, `out/metadata/${env}/kustomization-health.yml`), "utf8"));
      assert.equal(doc.kind, "KustomizationHealth");
      assert.equal(doc.spec.timeout, "5m");
      assert.equal(doc.spec.healthChecks[0].namespace, "test-ns");
    }
  } finally {
    rmSync(outRoot, { recursive: true, force: true });
  }
});

test("T-B7: placement label key not in allowlist → E_PLACEMENT_LABEL_NOT_ALLOWED", () => {
  const input = inputWith({
    workloads: [{ name: "app", image: { alias: "app" }, placement: { nodeSelector: { "platform.jorisjonkers.dev/unknown-key": ["val"] } } }],
  });
  assert.throws(() => validateContextCompatibility(input.deployment, input.context), /E_PLACEMENT_LABEL_NOT_ALLOWED/);
});

test("T-B7: placement label value not in allowlist → E_PLACEMENT_LABEL_VALUE_NOT_ALLOWED", () => {
  const input = inputWith({
    workloads: [{ name: "app", image: { alias: "app" }, placement: { nodeSelector: { "kubernetes.io/arch": ["riscv"] } } }],
  });
  assert.throws(() => validateContextCompatibility(input.deployment, input.context), /E_PLACEMENT_LABEL_VALUE_NOT_ALLOWED/);
});

test("T-B8: service-owned out-of-scope resource mutation fails parity", () => {
  const labels = { "app.kubernetes.io/name": "agents-api" };
  const current = [
    { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "agents-api", labels: { ...labels, "app.kubernetes.io/component": "server" } } },
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "agents-api-config-extra", labels }, data: { key: "ORIGINAL" } },
  ];
  const rendered = [
    { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "agents-api", labels: { ...labels, "app.kubernetes.io/component": "server" } } },
    { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "agents-api-config-extra", labels }, data: { key: "CHANGED" } },
  ];
  assert.throws(
    () => assertNoUnselectedMutations(current, rendered, "agents-api", "app.kubernetes.io/component=server"),
    /E_PARITY_UNSELECTED_MUTATION/,
  );
});

test("T-B8: checkScopedParity pass and drift over manifest trees", () => {
  const root = mkdtempSync(join("dist", "parity-"));
  try {
    const currentDir = join(root, "current");
    const renderedDir = join(root, "rendered");
    mkdirSync(currentDir, { recursive: true });
    mkdirSync(renderedDir, { recursive: true });
    const manifest = (replicas) => YAML.stringify({
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "svc", namespace: "ns", labels: { "app.kubernetes.io/name": "svc" } },
      spec: { replicas },
    });
    writeFileSync(join(currentDir, "svc.yaml"), manifest(1));
    writeFileSync(join(renderedDir, "svc.yaml"), manifest(1));
    const pass = checkScopedParity({
      currentManifestRoot: currentDir,
      renderedManifestRoot: renderedDir,
      profile: "flux",
      mode: "behavioral",
      service: "svc",
      selector: "app.kubernetes.io/name=svc",
    });
    assert.equal(pass.status, "pass");
    writeFileSync(join(renderedDir, "svc.yaml"), manifest(3));
    const drift = checkScopedParity({
      currentManifestRoot: currentDir,
      renderedManifestRoot: renderedDir,
      profile: "flux",
      mode: "behavioral",
      service: "svc",
      selector: "app.kubernetes.io/name=svc",
    });
    assert.equal(drift.status, "drift");
    assert.equal(drift.driftItems.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("requireDigestRef: pinned ref passes, unpinned throws", () => {
  requireDigestRef(PINNED_REF);
  assert.throws(() => requireDigestRef("ghcr.io/org/ctx:v1"), /E_CONTEXT_REF_NOT_PINNED/);
});

test("loadFragmentInputFromPaths: unpinned contextRef → E_CONTEXT_REF_NOT_PINNED", () => {
  assert.throws(() => loadFragmentInputFromPaths({
    deployPath: join(FIXTURES, "minimal/deployment.yml"),
    imagesPath: join(FIXTURES, "minimal/images.lock.json"),
    contextRef: "ghcr.io/org/ctx:v1",
    contextPath: join(FIXTURES, "contexts/public.yml"),
    env: "production",
    adapterCompatDigest: "sha256:deadbeef",
  }), /E_CONTEXT_REF_NOT_PINNED/);
});

test("forbidAmbientAdapterInputs: ambient env var → E_AMBIENT_INPUT_FORBIDDEN", () => {
  process.env.DEPLOY_CONTEXT = "sneaky";
  try {
    assert.throws(() => forbidAmbientAdapterInputs("production", "deployment.yml"), /E_AMBIENT_INPUT_FORBIDDEN/);
  } finally {
    delete process.env.DEPLOY_CONTEXT;
  }
});

test("forbidAmbientAdapterInputs: deploy path outside cwd → E_INPUT_OUTSIDE_WORKDIR", () => {
  assert.throws(() => forbidAmbientAdapterInputs("production", "/etc/deployment.yml"), /E_INPUT_OUTSIDE_WORKDIR/);
});

test("loadFragmentInput full flow (no ambient vars) matches loadFragmentInputFromPaths", () => {
  for (const variable of ["DEPLOY_CONTEXT", "DEPLOY_IMAGES", "ADAPTER_CONTEXT_REF"]) {
    delete process.env[variable];
  }
  const input = loadFragmentInput({
    deployPath: join(FIXTURES, "minimal/deployment.yml"),
    imagesPath: join(FIXTURES, "minimal/images.lock.json"),
    contextRef: PINNED_REF,
    contextPath: versionedContextPath(),
    env: "production",
    adapterCompatDigest: "sha256:deadbeef",
  });
  assert.equal(input.environment, "production");
  assert.ok(input.deploymentDigest.startsWith("sha256:"));
  assert.ok(input.imagesDigest.startsWith("sha256:"));
  assert.ok(input.contextDigest.startsWith("sha256:"));
  assert.equal(input.deployment.spec.namespace, "test-ns");
});

test("withDeterministicRuntime sets the flag and restores it", () => {
  assert.equal(isDeterministicRuntime(), false);
  const inside = withDeterministicRuntime(() => ({
    flag: isDeterministicRuntime(),
    ts: deterministicTimestamp(),
  }));
  assert.equal(inside.flag, true);
  assert.equal(inside.ts, "1970-01-01T00:00:00.000Z");
  assert.equal(isDeterministicRuntime(), false);
});

test("buildOutputPaths produces per-env out paths", () => {
  assert.deepEqual(buildOutputPaths(["production", "staging"]), {
    manifests: { production: "out/manifests/production", staging: "out/manifests/staging" },
    metadata: { production: "out/metadata/production", staging: "out/metadata/staging" },
  });
});

test("CLI: render fragment via --context-dir writes YAML output", async () => {
  const root = mkdtempSync(join("dist", "cli-frag-"));
  try {
    const deployDir = join(root, "deploy");
    mkdirSync(deployDir, { recursive: true });
    copyFileSync(join(FIXTURES, "minimal/deployment.yml"), join(deployDir, "deployment.yml"));
    writeFileSync(join(root, "cluster-context-public.yml"), readFileSync(versionedContextPath(), "utf8"));
    const stdout = stream();
    const stderr = stream();
    const code = await runCli([
      "render", "traefik-route-fragment", deployDir,
      "--env", "production",
      "--images", join(FIXTURES, "minimal/images.lock.json"),
      "--context-dir", root,
      "--output", join(root, "routes.yaml"),
    ], { stdout, stderr });
    assert.equal(code, 0, stderr.text());
    const doc = YAML.parse(readFileSync(join(root, "routes.yaml"), "utf8"));
    assert.equal(doc.kind, "TraefikRouteFragment");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: render fragment with missing options returns usage error", async () => {
  const stdout = stream();
  const stderr = stream();
  const code = await runCli(["render", "traefik-route-fragment", "somewhere"], { stdout, stderr });
  assert.equal(code, 2);
});

test("CLI: artifact emit-contract writes SC-3 contract", async () => {
  const root = mkdtempSync(join("dist", "cli-contract-"));
  try {
    const stdout = stream();
    const stderr = stream();
    const code = await runCli([
      "artifact", "emit-contract",
      "--artifact-name", "my-service",
      "--environments", "production",
      "--images", join(FIXTURES, "minimal/images.lock.json"),
      "--context-ref", PINNED_REF,
      "--deployment", join(FIXTURES, "minimal/deployment.yml"),
      "--context", versionedContextPath(),
      "--provenance-verified", "true",
      "--out", join(root, "artifact-contract.yaml"),
    ], { stdout, stderr });
    assert.equal(code, 0, stderr.text());
    const contract = YAML.parse(readFileSync(join(root, "artifact-contract.yaml"), "utf8"));
    assert.equal(contract.kind, "DeployArtifactContract");
    assert.equal(contract.metadata.name, "my-service-deploy");
    assert.equal(contract.spec.schemaVersion, getPackageVersion());
    assert.ok(contract.spec.renderHash.startsWith("sha256:"));
    assert.equal(contract.spec.provenance_verified, true);
    assert.ok(contract.spec.inputDigests.deployment.startsWith("sha256:"));
    assert.ok(contract.spec.inputDigests.imagesLock.startsWith("sha256:"));
    assert.ok(contract.spec.inputDigests.context.startsWith("sha256:"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: artifact unknown subcommand returns usage error", async () => {
  const stdout = stream();
  const stderr = stream();
  const code = await runCli(["artifact", "bogus"], { stdout, stderr });
  assert.equal(code, 2);
});

test("CLI: parity check --service routes to scoped parity", async () => {
  const root = mkdtempSync(join("dist", "cli-parity-"));
  try {
    const currentDir = join(root, "current");
    const renderedDir = join(root, "rendered");
    mkdirSync(currentDir, { recursive: true });
    mkdirSync(renderedDir, { recursive: true });
    const manifest = YAML.stringify({
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "svc", namespace: "ns", labels: { "app.kubernetes.io/name": "svc" } },
      spec: { replicas: 1 },
    });
    writeFileSync(join(currentDir, "svc.yaml"), manifest);
    writeFileSync(join(renderedDir, "svc.yaml"), manifest);
    const stdout = stream();
    const stderr = stream();
    const code = await runCli([
      "parity", "check",
      "--current", currentDir,
      "--rendered", renderedDir,
      "--service", "svc",
      "--selector", "app.kubernetes.io/name=svc",
    ], { stdout, stderr });
    assert.equal(code, 0, stderr.text());
    const result = JSON.parse(stdout.text());
    assert.equal(result.status, "pass");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Job workload tests (Phase 1 — healthClass: job)
// ---------------------------------------------------------------------------

test("job workload: kubernetes fragment renders batch/v1 Job with migration label", () => {
  const input = inputWith({
    workloads: [{
      name: "stalwart-provisioner",
      kind: "job",
      image: { alias: "app" },
    }],
  });
  const rendered = renderKubernetesWorkloadFragment(input);
  const job = rendered.manifests.find((m) => m.kind === "Job");
  assert.ok(job, "Job manifest not found in rendered output");
  assert.equal(job.apiVersion, "batch/v1");
  assert.equal(job.metadata.labels["app.kubernetes.io/component"], "migration",
    "Job must carry app.kubernetes.io/component=migration for prune-guardrails");
  assert.equal(job.spec.template.spec.restartPolicy, "Never");
  // TTL: Option B (owner decision 2026-07-12) — completed jobs must be cleaned up automatically
  assert.equal(job.spec.ttlSecondsAfterFinished, 3600,
    "Job must carry ttlSecondsAfterFinished:3600 so Flux can re-apply after cleanup");
  // No PVCs in output
  assert.ok(!rendered.manifests.some((m) => m.kind === "PersistentVolumeClaim"),
    "Job workload must not emit PVCs");
  // No Deployment in output
  assert.ok(!rendered.manifests.some((m) => m.kind === "Deployment"),
    "Job workload must not emit Deployment");
});

test("job workload: emit-kustomization-health produces kind:Job health check and wait:false", async () => {
  const tmpDir = mkdtempSync(join("dist", "kh-job-"));
  try {
    // Write a minimal job deployment.yml
    const deployment = {
      apiVersion: "deployment.jorisjonkers.dev/v2",
      kind: "Deployment",
      metadata: { name: "stalwart-provisioner" },
      spec: {
        namespace: "mail-system",
        workloads: [{
          name: "stalwart-provisioner",
          kind: "job",
          image: { alias: "stalwart-provisioner" },
          health: { timeoutClass: "job" },
        }],
      },
    };
    const deployPath = join(tmpDir, "deployment.yml");
    const imagesPath = join(tmpDir, "images.lock.json");
    const outPath = join(tmpDir, "kustomization-health.yml");
    writeFileSync(deployPath, YAML.stringify(deployment));
    writeFileSync(imagesPath, JSON.stringify({ "stalwart-provisioner": PINNED_IMAGE }));

    const stdout = stream();
    const stderr = stream();
    const code = await runCli([
      "artifact", "emit-kustomization-health",
      "--deployment", deployPath,
      "--env", "production",
      "--image-digests", imagesPath,
      "--out", outPath,
    ], { stdout, stderr });
    assert.equal(code, 0, `emit-kustomization-health failed: ${stderr.text()}`);

    const kh = YAML.parse(readFileSync(outPath, "utf8"));
    assert.equal(kh.kind, "KustomizationHealth");
    assert.equal(kh.spec.wait, false, "Job workload kustomization-health must have wait:false");
    assert.equal(kh.spec.healthChecks.length, 1);
    assert.equal(kh.spec.healthChecks[0].kind, "Job");
    assert.equal(kh.spec.healthChecks[0].apiVersion, "batch/v1");
    assert.equal(kh.spec.healthChecks[0].name, "stalwart-provisioner");
    assert.equal(kh.spec.healthChecks[0].namespace, "mail-system");
    assert.equal(kh.spec.timeout, "10m", "Job workload timeout should be 10m");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("job workload: emitKustomizationHealth with waitOverride:false sets wait:false", () => {
  const result = emitKustomizationHealth({
    workloads: [{ health: { timeoutClass: "job" } }],
    healthChecks: [{ apiVersion: "batch/v1", kind: "Job", name: "my-job", namespace: "default" }],
    waitOverride: false,
  });
  assert.equal(result.spec.wait, false);
  assert.equal(result.spec.healthChecks[0].kind, "Job");
  assert.equal(result.spec.timeout, "10m");
});

test("job workload: emitKustomizationHealth default wait:true for non-job workloads", () => {
  const result = emitKustomizationHealth({
    workloads: [{ health: { timeoutClass: "stateless" } }],
    healthChecks: [{ apiVersion: "apps/v1", kind: "Deployment", name: "svc", namespace: "default" }],
  });
  assert.equal(result.spec.wait, true);
});

test("job workload: mixed job+stateless deployment uses wait:true (only all-job deployments get wait:false)", async () => {
  const tmpDir = mkdtempSync(join("dist", "kh-mixed-"));
  try {
    const deployment = {
      apiVersion: "deployment.jorisjonkers.dev/v2",
      kind: "Deployment",
      metadata: { name: "mixed-svc" },
      spec: {
        namespace: "mixed-ns",
        workloads: [
          {
            name: "worker-job",
            kind: "job",
            image: { alias: "app" },
            health: { timeoutClass: "job" },
          },
          {
            name: "api-server",
            image: { alias: "app" },
            health: { timeoutClass: "stateless" },
          },
        ],
      },
    };
    const deployPath = join(tmpDir, "deployment.yml");
    const imagesPath = join(tmpDir, "images.lock.json");
    const outPath = join(tmpDir, "kustomization-health.yml");
    writeFileSync(deployPath, YAML.stringify(deployment));
    writeFileSync(imagesPath, JSON.stringify({ app: PINNED_IMAGE }));

    const stdout = stream();
    const stderr = stream();
    const code = await runCli([
      "artifact", "emit-kustomization-health",
      "--deployment", deployPath,
      "--env", "production",
      "--image-digests", imagesPath,
      "--out", outPath,
    ], { stdout, stderr });
    assert.equal(code, 0, `emit-kustomization-health failed: ${stderr.text()}`);

    const kh = YAML.parse(readFileSync(outPath, "utf8"));
    // Mixed deployment: wait must NOT be forced to false (stateless workload needs wait:true)
    assert.equal(kh.spec.wait, true, "Mixed job+stateless deployment must use wait:true");
    // Both workloads produce health checks
    assert.equal(kh.spec.healthChecks.length, 2);
    const jobCheck = kh.spec.healthChecks.find((hc) => hc.kind === "Job");
    const depCheck = kh.spec.healthChecks.find((hc) => hc.kind === "Deployment");
    assert.ok(jobCheck, "Job workload must produce kind:Job healthCheck");
    assert.ok(depCheck, "Stateless workload must produce kind:Deployment healthCheck");
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("job workload: kind:job + stateful:true conflict → E_JOB_STATEFUL_CONFLICT", () => {
  const deployment = {
    apiVersion: "deployment.jorisjonkers.dev/v2",
    kind: "Deployment",
    metadata: { name: "bad-svc" },
    spec: {
      namespace: "test-ns",
      workloads: [{
        name: "bad-workload",
        kind: "job",
        stateful: true,
        image: { alias: "app" },
        migrationPolicy: { required: false, strategy: "none" },
      }],
    },
  };
  const ctx = fixtureInput().context;
  assert.throws(() => validateDeploymentSemantics(deployment, ctx), /E_JOB_STATEFUL_CONFLICT/);
});
