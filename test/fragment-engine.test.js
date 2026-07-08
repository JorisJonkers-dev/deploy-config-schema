import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import {
  assertNoFloatingImages,
  assertNoUnselectedMutations,
  buildOutputPaths,
  checkScopedParity,
  computeRenderHash,
  deterministicTimestamp,
  forbidAmbientAdapterInputs,
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

function fixtureInput(overrides = {}) {
  return loadFragmentInputFromPaths({
    deployPath: join(FIXTURES, "minimal/deployment.yml"),
    imagesPath: join(FIXTURES, "minimal/images.lock.json"),
    contextRef: PINNED_REF,
    contextPath: join(FIXTURES, "contexts/public.yml"),
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
    contextPath: join(FIXTURES, "contexts/public.yml"),
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
    copyFileSync(join(FIXTURES, "contexts/public.yml"), join(root, "cluster-context-public.yml"));
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
      "--context", join(FIXTURES, "contexts/public.yml"),
      "--provenance-verified", "true",
      "--out", join(root, "artifact-contract.yaml"),
    ], { stdout, stderr });
    assert.equal(code, 0, stderr.text());
    const contract = YAML.parse(readFileSync(join(root, "artifact-contract.yaml"), "utf8"));
    assert.equal(contract.kind, "DeployArtifactContract");
    assert.equal(contract.metadata.name, "my-service-deploy");
    assert.equal(contract.spec.schemaVersion, "0.16.0");
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
