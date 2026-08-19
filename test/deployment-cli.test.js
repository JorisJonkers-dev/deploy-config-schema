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
  return mkdtempSync(join(tmpdir(), "deployment-"));
}

const fixture = (name) => `fixtures/deployment/${name}`;

test("validate accepts every deployment artifact kind", async () => {
  const cases = [
    ["deployment", "deployment.yml"],
    ["deployment-env", "runtime.env.yml"],
    ["collection", "collection.yml"],
    ["deployment-sources", "deployment-sources.yml"],
    ["deployment-lock", "deployment.lock.yml"],
    ["node-contract", "node-contract.lock.yml"],
    ["reachability", "reachability.yml"],
    ["state-move-plan", "state-move-plan.yml"],
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
  assert.equal(manifest.artifactType, "application/vnd.jorisjonkers.deployment.bundle+tar");
  assert.equal(manifest.files[0].path, "deployment.yml");
});

