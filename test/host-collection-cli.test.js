import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import YAML from "yaml";
import { runCli } from "../src/cli.js";
import {
  readHostInventory,
  renderNodeContract,
  validateHostInventory,
} from "../src/hosts/inventory.js";
import {
  buildCollectionIndex,
  validateCollectionTree,
} from "../src/collections/index.js";
import { validateImageTags } from "../src/deployment/image-tags.js";

const hostsFixture = "test/fixtures/hosts/fleet.yml";
const collectionsFixture = "test/fixtures/collections";
const deploymentFixture = (name) => `fixtures/deployment/${name}`;

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
  return mkdtempSync(join(tmpdir(), "deploy-config-schema-"));
}

test("host inventory validates and renders a generic node contract", () => {
  const validation = validateHostInventory(hostsFixture);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics, null, 2));

  const contract = renderNodeContract(readHostInventory(hostsFixture), { labelPrefixes: ["example.com/platform"] });
  assert.equal(contract.kind, "NodeContract");
  assert.equal(contract.nodes["k3s-01"].capabilities.includes("platform"), true);
  assert.equal(contract.nodes["k3s-01"].labels["example.com/platform/site"], "lab");
  assert.equal(contract.nodes["k3s-01"].labels["kubernetes.io/arch"], "amd64");
  assert.match(contract.metadata.sourceSha, /^[a-f0-9]{40}$/);
});

test("hosts CLI renders and checks node contract drift", async () => {
  const dir = tempDir();
  const contractPath = join(dir, "node-contract.lock.yml");
  const labelsPath = join(dir, "k3s-labels.yml");
  const renderIo = streams();
  const checkIo = streams();

  assert.equal(await runCli([
    "hosts", "render-node-contract",
    "--inventory", hostsFixture,
    "--out", contractPath,
    "--labels-out", labelsPath,
    "--label-prefix", "example.com/platform",
  ], renderIo), 0, renderIo.stderr.text());
  assert.equal(YAML.parse(readFileSync(contractPath, "utf8")).kind, "NodeContract");
  assert.equal(YAML.parse(readFileSync(labelsPath, "utf8")).kind, "NodeLabels");

  assert.equal(await runCli([
    "hosts", "check-node-contract",
    "--inventory", hostsFixture,
    "--contract", contractPath,
    "--label-prefix", "example.com/platform",
  ], checkIo), 0, checkIo.stdout.text());
});

test("collections validate and index command surfaces are deterministic", async () => {
  const validation = validateCollectionTree(collectionsFixture);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics, null, 2));

  const index = buildCollectionIndex(collectionsFixture);
  assert.deepEqual(index.collections.map((entry) => entry.name), ["catalog", "observability"]);
  assert.match(index.collections[0].digest, /^sha256:[a-f0-9]{64}$/);

  const dir = tempDir();
  const out = join(dir, "collections.lock.yml");
  const io = streams();
  assert.equal(await runCli(["collections", "index", "--root", collectionsFixture, "--out", out], io), 0, io.stderr.text());
  assert.equal(YAML.parse(readFileSync(out, "utf8")).kind, "CollectionIndex");
});

test("image tag validation rejects latest when requested", () => {
  assert.equal(validateImageTags(["ghcr.io/example/api:v1.0.0"], { rejectLatest: true }).valid, true);
  assert.equal(validateImageTags(["api=latest"], { rejectLatest: true }).valid, false);
});

