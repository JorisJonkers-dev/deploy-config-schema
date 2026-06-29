// @ts-nocheck -- CLI command handlers intentionally accept the untyped option
// bag produced by src/cli.ts and route it into typed deployment modules.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import YAML from "yaml";
import { validateArtifact } from "../artifact-validator.js";
import { buildCollectionIndex, validateCollectionTree } from "../collections/index.js";
import {
  readHostInventory,
  renderNodeContract,
  renderNodeLabelsManifest,
  stringifyHostYaml,
  validateHostInventory,
} from "../hosts/inventory.js";
import { compileProject } from "./compiler.js";
import { createCutoverPlan } from "./cutover.js";
import { validateImageTags } from "./image-tags.js";
import { importLiveFleet } from "./import/live-fleet.js";
import { loadYamlDocument } from "./io.js";
import { extractLockedImages, readDeploymentLock, updateDeploymentLock } from "./lockfile.js";
import { compareParityTrees } from "./parity.js";
import { resolveSources } from "./source-resolver.js";

export function runBundle(args, streams, parseOptions) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "pack") {
    writeDiagnostics(streams.stderr, usageDiagnostic("bundle pack --deploy-dir <dir> --images <file> --repo <repo> --git-sha <sha> --version <version> --out <file>"));
    return 1;
  }
  const { options, diagnostics } = parseOptions(rest);
  const required = ["deployDir", "images", "repo", "gitSha", "version", "out"];
  const missing = required.filter((key) => !options[key]);
  if (diagnostics.length > 0 || missing.length > 0) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : missing.map((key) => ({
      code: "E_USAGE",
      message: `--${optionName(key)} is required`,
      path: "/",
    })));
    return 1;
  }

  const deployFiles = listFiles(options.deployDir).filter((path) => /\.(json|ya?ml|env)$/.test(path));
  const images = loadYamlDocument(options.images);
  const manifest = {
    artifactType: "application/vnd.jorisjonkers.deployment.bundle+tar",
    repo: options.repo,
    gitSha: options.gitSha,
    version: options.version,
    deployDir: options.deployDir,
    files: deployFiles.map((path) => ({
      path: relative(options.deployDir, path).replaceAll("\\", "/"),
      digest: sha256(readFileSync(path)),
    })),
    images,
  };

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(manifest, null, 2)}\n`);
  streams.stdout.write(`${JSON.stringify({
    out: options.out,
    manifestDigest: sha256(JSON.stringify(manifest)),
    files: manifest.files.length,
  }, null, 2)}\n`);
  return 0;
}

export function runResolveSources(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.sources || !options.lock) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("resolve-sources --sources deployment-sources.yml --lock deployment.lock.yml [--check]"));
    return 1;
  }
  const validation = validateNamedInputs([
    ["deployment-sources", options.sources],
    ["deployment-lock", options.lock],
  ]);
  if (!validation.valid) {
    writeValidationResult(streams.stdout, validation);
    return 1;
  }
  const report = sourceReport(options.sources, options.lock);
  streams.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.valid ? 0 : 1;
}

export function runLock(args, streams, parseOptions) {
  if (args[0] === "images") {
    return runLockImages(args.slice(1), streams, parseOptions);
  }
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.sources || !options.lock) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("lock --sources deployment-sources.yml --lock deployment.lock.yml [--update]"));
    return 1;
  }
  const validation = validateNamedInputs([
    ["deployment-sources", options.sources],
    ["deployment-lock", options.lock],
  ]);
  if (!validation.valid) {
    writeValidationResult(streams.stdout, validation);
    return 1;
  }
  const report = sourceReport(options.sources, options.lock);
  if (options.update) {
    const lock = readDeploymentLock(loadYamlDocument(options.lock));
    writeFileSync(options.lock, stringifyDocument(options.lock, {
      apiVersion: "deployment.jorisjonkers.dev/lock",
      kind: "DeploymentLock",
      ...updateDeploymentLock(lock),
    }));
  }
  streams.stdout.write(`${JSON.stringify({ ...report, updated: Boolean(options.update) }, null, 2)}\n`);
  return report.valid ? 0 : 1;
}

export function runCompile(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.env || !options.sources || !options.lock || !options.nodeContract || !options.reachability || !options.out) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("compile --env <name> --sources <path> --lock <path> --node-contract <path> --reachability <path> --out <dir> [--deployment <path>] [--collection <path>] [--check]"));
    return 2;
  }
  const result = compileProjectResult(() => compileProject({
    environment: options.env,
    sourcesPath: options.sources,
    lockPath: options.lock,
    nodeContractPath: options.nodeContract,
    reachabilityPath: options.reachability,
    deploymentPaths: optionList(options.deployment),
    collectionPaths: optionList(options.collection),
    outDir: options.out,
    check: Boolean(options.check),
  }));
  streams.stdout.write(`${JSON.stringify({
    ok: result.ok,
    files: result.files.map((file) => file.path),
    results: result.writeResults ?? [],
    diagnostics: result.diagnostics,
  }, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

export function runHosts(args, streams, parseOptions) {
  const [subcommand, ...rest] = args;
  if (subcommand === "validate" || subcommand === "render-node-contract" || subcommand === "check-node-contract") {
    const { options, diagnostics } = parseOptions(rest);
    if (diagnostics.length > 0 || !options.inventory) {
      writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("hosts validate|render-node-contract|check-node-contract --inventory inventory/fleet.yml"));
      return 2;
    }
    if (subcommand === "render-node-contract") {
      if (!options.out) {
        writeDiagnostics(streams.stderr, usageDiagnostic("hosts render-node-contract --inventory inventory/fleet.yml --out generated/node-contract.lock.yml [--labels-out generated/k3s-labels.yml]"));
        return 2;
      }
      const validation = validateHostInventory(options.inventory);
      if (!validation.valid) {
        writeDiagnostics(streams.stderr, validation.diagnostics);
        return 1;
      }
      const inventory = readHostInventory(options.inventory);
      const contract = renderNodeContract(inventory, { labelPrefixes: optionList(options.labelPrefix) });
      mkdirSync(dirname(options.out), { recursive: true });
      writeFileSync(options.out, stringifyHostYaml(contract));
      if (options.labelsOut) {
        mkdirSync(dirname(options.labelsOut), { recursive: true });
        writeFileSync(options.labelsOut, stringifyHostYaml(renderNodeLabelsManifest(contract)));
      }
      streams.stdout.write(`${JSON.stringify({
        out: options.out,
        labelsOut: options.labelsOut,
        nodes: Object.keys(contract.nodes).sort(),
      }, null, 2)}\n`);
      return 0;
    }
    if (subcommand === "check-node-contract") {
      if (!options.contract) {
        writeDiagnostics(streams.stderr, usageDiagnostic("hosts check-node-contract --inventory inventory/fleet.yml --contract generated/node-contract.lock.yml"));
        return 2;
      }
      const validation = validateHostInventory(options.inventory);
      if (!validation.valid) {
        writeDiagnostics(streams.stderr, validation.diagnostics);
        return 1;
      }
      const expected = stringifyHostYaml(renderNodeContract(readHostInventory(options.inventory), { labelPrefixes: optionList(options.labelPrefix) }));
      const actual = readFileSync(options.contract, "utf8");
      const valid = actual === expected;
      streams.stdout.write(`${JSON.stringify({
        valid,
        diagnostics: valid ? [] : [{
          code: "E_NODE_CONTRACT_STALE",
          path: options.contract,
          message: "node contract is stale; rerun hosts render-node-contract",
        }],
      }, null, 2)}\n`);
      return valid ? 0 : 1;
    }
    const validation = validateHostInventory(options.inventory);
    streams.stdout.write(`${JSON.stringify({
      valid: validation.valid,
      diagnostics: validation.diagnostics,
      files: validation.inventory ? {
        fleet: validation.inventory.fleetPath,
        sites: validation.inventory.sitePaths,
        nodes: validation.inventory.nodePaths,
      } : undefined,
    }, null, 2)}\n`);
    return validation.valid ? 0 : 1;
  }
  writeDiagnostics(streams.stderr, usageDiagnostic("hosts validate|render-node-contract|check-node-contract --inventory inventory/fleet.yml"));
  return 2;
}

export function runCollections(args, streams, parseOptions) {
  const [subcommand, ...rest] = args;
  const { options, diagnostics } = parseOptions(rest);
  if (diagnostics.length > 0 || !options.root || !["validate", "index"].includes(subcommand)) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("collections validate|index --root collections [--out generated/collections.lock.yml]"));
    return 2;
  }
  if (subcommand === "validate") {
    const validation = validateCollectionTree(options.root);
    streams.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
    return validation.valid ? 0 : 1;
  }
  try {
    const index = buildCollectionIndex(options.root, { generatedAt: options.generatedAt });
    if (options.out) {
      mkdirSync(dirname(options.out), { recursive: true });
      writeFileSync(options.out, stringifyDocument(options.out, index));
    }
    streams.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeDiagnostics(streams.stderr, (error as { diagnostics?: any[] }).diagnostics ?? [{
      code: "E_COLLECTION_INDEX",
      path: "/",
      message: error instanceof Error ? error.message : String(error),
    }]);
    return 1;
  }
}

export function runRenderFlux(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  const repo = options.repo ?? ".";
  const env = options.env ?? "production";
  if (diagnostics.length > 0) {
    writeDiagnostics(streams.stderr, diagnostics);
    return 2;
  }
  return runCompile([
    "--env", env,
    "--sources", join(repo, "deployment-sources.yml"),
    "--lock", join(repo, "deployment.lock.yml"),
    "--node-contract", join(repo, "inventory/node-contract.lock.yml"),
    "--reachability", join(repo, "catalog/reachability.yml"),
    "--deployment", join(repo, "deployment.yml"),
    ...(existsSync(join(repo, "collection.yml")) ? ["--collection", join(repo, "collection.yml")] : []),
    "--out", join(repo, "cluster/flux"),
    ...(options.check ? ["--check"] : []),
  ], streams, parseOptions);
}

export function runImportLiveFleet(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.fleet || !options.fluxTree || !options.out) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("import-live-fleet --fleet <fleet.yaml> --flux-tree <dir> --out <dir>"));
    return 1;
  }
  const result = importLiveFleet({
    fleetPath: options.fleet,
    fluxTreePath: options.fluxTree,
    outDir: options.out,
    deploymentName: options.deploymentName,
    platformBlueprintsPath: options.platformBlueprints,
    collectionsRootPath: options.collectionsRoot,
  });
  streams.stdout.write(`${JSON.stringify({
    out: options.out,
    files: result.files.map((file) => file.path),
    services: Object.keys(result.model.workloads).length,
  }, null, 2)}\n`);
  return 0;
}

export function runParity(args, streams, parseOptions) {
  const checkMode = args[0] === "check";
  const rest = checkMode ? args.slice(1) : args;
  const { options, diagnostics } = parseOptions(rest);
  const current = options.current ?? options.rendered;
  const rendered = options.compiled ?? options.candidate ?? options.rendered;
  if (diagnostics.length > 0 || !current || !rendered || (checkMode && !options.compiled)) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("parity check --rendered <current-tree> --compiled <compiled-tree> [--profile flux]"));
    return 2;
  }
  const report = compareParityTrees({ current, rendered, mode: options.mode ?? "behavioral" });
  streams.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.ok ? 0 : 1;
}

export function runState(args, streams, parseOptions) {
  if (args[0] !== "move-plan" || args[1] !== "validate") {
    writeDiagnostics(streams.stderr, usageDiagnostic("state move-plan validate <state/move-plan.yml>"));
    return 2;
  }
  const { positionals, diagnostics } = parseOptions(args.slice(2));
  if (diagnostics.length > 0 || positionals.length !== 1) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("state move-plan validate <state/move-plan.yml>"));
    return 2;
  }
  const validation = validateNamedInputs([["state-move-plan", positionals[0]]]);
  streams.stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
  return validation.valid ? 0 : 1;
}

export function runCutover(args, streams, parseOptions) {
  if (args[0] !== "plan") {
    writeDiagnostics(streams.stderr, usageDiagnostic("cutover plan --current cluster/flux --candidate build/flux [--out state/cutover-plan.yml]"));
    return 2;
  }
  const { options, diagnostics } = parseOptions(args.slice(1));
  if (diagnostics.length > 0 || !options.current || !options.candidate) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("cutover plan --current cluster/flux --candidate build/flux [--out state/cutover-plan.yml]"));
    return 2;
  }
  const plan = createCutoverPlan({ current: options.current, candidate: options.candidate, profile: options.profile });
  if (options.out) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, stringifyDocument(options.out, plan));
  }
  streams.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  return plan.diagnostics.length === 0 ? 0 : 1;
}

function runLockImages(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.lock) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("lock images --lock deployment.lock.yml --format image-tags|json"));
    return 1;
  }
  const validation = validateNamedInputs([["deployment-lock", options.lock]]);
  if (!validation.valid) {
    writeValidationResult(streams.stdout, validation);
    return 1;
  }
  const tags = extractLockedImages(readDeploymentLock(loadYamlDocument(options.lock)));
  if (options.rejectLatest) {
    const validation = validateImageTags(tags, { rejectLatest: true });
    if (!validation.valid) {
      writeDiagnostics(streams.stderr, validation.diagnostics);
      return 1;
    }
  }
  if (options.format === "image-tags") {
    streams.stdout.write(`${tags.join("\n")}${tags.length > 0 ? "\n" : ""}`);
  } else {
    streams.stdout.write(`${JSON.stringify({ images: tags }, null, 2)}\n`);
  }
  return 0;
}

function sourceReport(sourcesPath, lockPath) {
  const document = loadYamlDocument(sourcesPath);
  const sources = {
    environments: document.spec?.environments ?? [],
    firstParty: document.spec?.firstParty ?? {},
    collections: document.spec?.collections ?? {},
    hosts: document.spec?.hosts,
    platformBlueprints: document.spec?.platformBlueprints,
    policies: document.spec?.policies ?? {},
  };
  return resolveSources(sources, readDeploymentLock(loadYamlDocument(lockPath)));
}

function validateNamedInputs(inputs) {
  const results = inputs.map(([kind, path]) => {
    const validation = validateArtifact(kind, loadYamlDocument(path));
    return {
      file: path,
      kind,
      valid: validation.valid,
      diagnostics: validation.diagnostics,
    };
  });
  return {
    valid: results.every((result) => result.valid),
    diagnostics: results.flatMap((result) => result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      file: result.file,
      kind: result.kind,
    }))),
    results,
  };
}

function stringifyDocument(path, value) {
  return path.endsWith(".json") ? `${JSON.stringify(value, null, 2)}\n` : YAML.stringify(value, { lineWidth: 0 });
}

function optionList(value) {
  if (!value) return undefined;
  return Array.isArray(value) ? value : [value];
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const stats = statSync(root);
  if (!stats.isDirectory()) return [root];
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  }).sort();
}

function optionName(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function writeValidationResult(stream, validation) {
  stream.write(`${JSON.stringify(validation, null, 2)}\n`);
}

function writeDiagnostics(stream, diagnostics) {
  writeValidationResult(stream, {
    valid: false,
    diagnostics,
  });
}

function compileProjectResult(build) {
  try {
    return build();
  } catch (error) {
    return {
      ok: false,
      files: [],
      diagnostics: [{
        code: "E_COMPILE",
        path: "/",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

function usageDiagnostic(command) {
  return [
    {
      code: "E_USAGE",
      message: `usage: deploy-config-schema ${command}`,
      path: "/",
    },
  ];
}
