import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import YAML from "yaml";
import { runCli } from "../src/cli.js";

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

function streams() {
  return {
    stdout: stream(),
    stderr: stream(),
  };
}

function tempDir() {
  return mkdtempSync(join(tmpdir(), "deploy-v2-"));
}

const fixture = (name) => `fixtures/deployment-v2/${name}`;

test("validate accepts every deploy-v2 artifact kind", async () => {
  const cases = [
    ["deployment-v2", "deployment.yml"],
    ["deployment-env-v1", "runtime.env.yml"],
    ["collection-v1", "collection.yml"],
    ["deployment-sources-v1", "deployment-sources.yml"],
    ["deployment-lock-v1", "deployment.lock.yml"],
    ["node-contract-v1", "node-contract.lock.yml"],
    ["reachability-v1", "reachability.yml"],
    ["state-move-plan-v1", "state-move-plan.yml"],
  ];

  for (const [kind, path] of cases) {
    const io = streams();
    const exitCode = await runCli(["validate", kind, fixture(path)], io);
    const result = JSON.parse(io.stdout.text());

    assert.equal(exitCode, 0, `${kind}: ${io.stdout.text()} ${io.stderr.text()}`);
    assert.equal(result.valid, true);
    assert.equal(result.results[0].kind, kind);
  }
});

test("lock images emits deterministic image-tags output", async () => {
  const io = streams();
  const exitCode = await runCli(["lock", "images", "--lock", fixture("deployment.lock.yml"), "--format", "image-tags"], io);

  assert.equal(exitCode, 0);
  assert.equal(io.stderr.text(), "");
  assert.equal(io.stdout.text(), [
    "ghcr.io/jorisjonkers-dev/assistant-api:v1.2.3",
    "ghcr.io/jorisjonkers-dev/platform-postgres:v16",
    "ghcr.io/twin/gatus:v5.20.0",
    "",
  ].join("\n"));
});

test("lock images emits json and lock update preserves a valid lock file", async () => {
  const dir = tempDir();
  const lockPath = join(dir, "deployment.lock.yml");
  writeFileSync(lockPath, readFileSync(fixture("deployment.lock.yml"), "utf8"));
  const imagesIo = streams();
  const updateIo = streams();

  assert.equal(await runCli(["lock", "images", "--lock", lockPath], imagesIo), 0);
  assert.deepEqual(JSON.parse(imagesIo.stdout.text()).images, [
    "ghcr.io/jorisjonkers-dev/assistant-api:v1.2.3",
    "ghcr.io/jorisjonkers-dev/platform-postgres:v16",
    "ghcr.io/twin/gatus:v5.20.0",
  ]);

  assert.equal(await runCli(["lock", "--sources", fixture("deployment-sources.yml"), "--lock", lockPath, "--update"], updateIo), 0);
  assert.equal(YAML.parse(readFileSync(lockPath, "utf8")).kind, "DeploymentLock");
});

test("resolve-sources reports unlocked source entries", async () => {
  const dir = tempDir();
  const lock = YAML.parse(readFileSync(fixture("deployment.lock.yml"), "utf8"));
  delete lock.inputs.firstParty["assistant-api"];
  const lockPath = join(dir, "deployment.lock.yml");
  writeFileSync(lockPath, YAML.stringify(lock));
  const io = streams();

  const exitCode = await runCli(["resolve-sources", "--sources", fixture("deployment-sources.yml"), "--lock", lockPath, "--check"], io);
  const result = JSON.parse(io.stdout.text());

  assert.equal(exitCode, 1);
  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.path), ["/firstParty/assistant-api"]);
});

test("compile validates inputs and writes no files for empty stubs", async () => {
  const out = tempDir();
  const writeIo = streams();
  const checkIo = streams();

  const args = [
    "compile",
    "--env", "production",
    "--sources", fixture("deployment-sources.yml"),
    "--lock", fixture("deployment.lock.yml"),
    "--node-contract", fixture("node-contract.lock.yml"),
    "--reachability", fixture("reachability.yml"),
    "--out", out,
  ];

  assert.equal(await runCli(args, writeIo), 0, writeIo.stderr.text());
  assert.deepEqual(JSON.parse(writeIo.stdout.text()).files, []);
  assert.equal(await runCli([...args, "--check"], checkIo), 0, checkIo.stdout.text());
});

test("compile usage errors are structured", async () => {
  const io = streams();
  const exitCode = await runCli(["compile", "--env", "production"], io);
  const result = JSON.parse(io.stderr.text());

  assert.equal(exitCode, 1);
  assert.equal(result.diagnostics[0].code, "E_USAGE");
});

test("bundle pack writes a deterministic manifest file", async () => {
  const dir = tempDir();
  const deployDir = join(dir, "deploy");
  mkdirSync(deployDir);
  writeFileSync(join(deployDir, "deployment.yml"), readFileSync(fixture("deployment.yml"), "utf8"));
  const imagesPath = join(dir, "images.json");
  writeFileSync(imagesPath, JSON.stringify({ images: ["ghcr.io/jorisjonkers-dev/assistant-api:v1.2.3"] }));
  const out = join(dir, "bundle.json");
  const io = streams();

  const exitCode = await runCli([
    "bundle", "pack",
    "--deploy-dir", deployDir,
    "--images", imagesPath,
    "--repo", "JorisJonkers-dev/assistant-api",
    "--git-sha", "ffffffffffffffffffffffffffffffffffffffff",
    "--version", "v1.2.3",
    "--out", out,
  ], io);

  assert.equal(exitCode, 0, io.stderr.text());
  const manifest = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(manifest.artifactType, "application/vnd.jorisjonkers.deployment.bundle.v1+tar");
  assert.equal(manifest.files[0].path, "deployment.yml");
});

test("parity succeeds for identical normalized Kubernetes trees", async () => {
  const current = tempDir();
  const rendered = tempDir();
  const object = [
    "apiVersion: source.toolkit.fluxcd.io/v1",
    "kind: GitRepository",
    "metadata:",
    "  name: flux-system",
    "  namespace: flux-system",
    "spec:",
    "  url: https://github.com/old/source",
    "  ref:",
    "    branch: main",
    "",
  ].join("\n");
  writeFileSync(join(current, "source.yaml"), object);
  writeFileSync(join(rendered, "source.yaml"), object.replace("old/source", "new/source"));
  const io = streams();

  const exitCode = await runCli([
    "parity",
    "--current", current,
    "--rendered", rendered,
  ], io);
  const result = JSON.parse(io.stdout.text());

  assert.equal(exitCode, 0, io.stderr.text());
  assert.equal(result.ok, true);
});
