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
import { validateImageTags } from "./image-tags.js";
import { loadYamlDocument } from "./io.js";
import { extractLockedImages, readDeploymentLock } from "./lockfile.js";
import { resolveSources } from "./source-resolver.js";
import { fileURLToPath } from "node:url";
import { getAdapter } from "../adapters/registry.js";
import { emitAdapterCompat } from "../adapters/adapter-compat.js";
import { loadFragmentInput, parseDeploymentV2, requireDigestRef } from "../adapters/fragment-model.js";
import { normalizeImageLock } from "./v2-model.js";
import { emitKustomizationHealth } from "../artifact/kustomization-health.js";
import { emitArtifactContract, buildOutputPaths } from "../artifact/contract.js";
import { getPackageVersion } from "../cluster-context/schema.js";

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

// deploy-config-schema render <fragment-id> <deploy-dir> --env E --images L (--context-dir D | --context REF --context-path P) [--output OUT]
export function runRender(args, streams, parseOptions) {
  const { positionals, options, diagnostics } = parseOptions(args);
  const [fragmentId, deployDir] = positionals;
  if (diagnostics.length > 0 || !fragmentId || !deployDir || !options.env || !options.images
      || (!options.contextDir && !(options.context && options.contextPath))) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("render <fragment-id> <deploy-dir> --env <env> --images <images.lock.json> (--context-dir <dir> | --context <ref@sha256:..> --context-path <file>) [--output <path>]"));
    return 2;
  }
  const adapter = getAdapter(fragmentId);
  if (!adapter || adapter.target !== "fragment") {
    writeDiagnostics(streams.stderr, [{ code: "E_ADAPTER_UNKNOWN", message: `unknown fragment adapter: ${fragmentId}`, path: "/" }]);
    return 1;
  }
  try {
    let contextPath;
    let contextRef;
    if (options.contextDir) {
      contextPath = join(options.contextDir, "cluster-context-public.yml");
      contextRef = `local://${contextPath}`;
    } else {
      requireDigestRef(options.context);
      contextPath = options.contextPath;
      contextRef = options.context;
    }
    const adapterCompat = emitAdapterCompat(getPackageVersion(), readPackageIntegrity());
    const input = loadFragmentInput({
      deployPath: join(deployDir, "deployment.yml"),
      imagesPath: options.images,
      contextRef,
      contextPath,
      env: options.env,
      adapterCompatDigest: adapterCompat.digest,
    });
    const rendered = adapter.render(input);
    writeRenderedText(rendered, options.output, streams.stdout);
    return 0;
  } catch (error) {
    writeDiagnostics(streams.stderr, [{ code: extractErrorCode(error), message: error instanceof Error ? error.message : String(error), path: "/" }]);
    return 1;
  }
}

// deploy-config-schema artifact emit-contract|emit-kustomization-health ...
export function runArtifact(args, streams, parseOptions) {
  const [subcommand, ...rest] = args;
  if (subcommand === "emit-kustomization-health") {
    return runEmitKustomizationHealth(rest, streams, parseOptions);
  }
  if (subcommand === "emit-contract") {
    return runEmitContract(rest, streams, parseOptions);
  }
  writeDiagnostics(streams.stderr, usageDiagnostic("artifact emit-contract|emit-kustomization-health <options>"));
  return 2;
}

// deploy-config-schema parity check --current C --rendered R --service S --selector K=V [--profile flux] [--mode behavioral]

function resolveWorkloadKind(workload) {
  if (workload.kind === "job") return "job";
  if (workload.stateful) return "statefulset";
  return "deployment";
}

function runEmitKustomizationHealth(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  const deploymentPath = Array.isArray(options.deployment) ? options.deployment[0] : options.deployment;
  if (diagnostics.length > 0 || !deploymentPath || !options.env || !options.imageDigests || !options.out) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("artifact emit-kustomization-health --deployment <deployment.yml> --env <env> --image-digests <images.lock.json> --out <path>"));
    return 2;
  }
  try {
    const deployment = parseDeploymentV2(YAML.parse(readFileSync(deploymentPath, "utf8")));
    const imageDigests = normalizeImageLock(JSON.parse(readFileSync(options.imageDigests, "utf8")));

    // wait:false only when ALL workloads are job-kind. Mixed job+stateless deployments
    // would incorrectly suppress wait for the stateless service if we set waitOverride globally.
    const allJobWorkloads = deployment.spec.workloads.length > 0 &&
      deployment.spec.workloads.every((w) => resolveWorkloadKind(w) === "job");

    const healthChecks = deployment.spec.workloads
      .filter((workload) => workload.health?.mandatory !== false)
      .map((workload) => {
        const wkind = resolveWorkloadKind(workload);
        if (wkind === "job") {
          return {
            apiVersion: "batch/v1",
            kind: "Job",
            name: workload.name,
            namespace: deployment.spec.namespace,
          };
        }
        return {
          apiVersion: "apps/v1",
          kind: wkind === "statefulset" ? "StatefulSet" : "Deployment",
          name: workload.name,
          namespace: deployment.spec.namespace,
        };
      });

    // Job workloads: wait must be false (Flux uses healthChecks for Job completion,
    // not Ready condition; setting wait:true would block on a condition that never fires).
    const health = emitKustomizationHealth({
      workloads: deployment.spec.workloads,
      healthChecks,
      imageDigests,
      pruneDecisions: [],
      ...(allJobWorkloads ? { waitOverride: false } : {}),
    });
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, YAML.stringify(health, { lineWidth: 0 }));
    streams.stdout.write(`${JSON.stringify({ out: options.out, env: options.env, timeout: health.spec.timeout }, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeDiagnostics(streams.stderr, [{ code: extractErrorCode(error), message: error instanceof Error ? error.message : String(error), path: "/" }]);
    return 1;
  }
}

function runEmitContract(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  const deploymentPath = Array.isArray(options.deployment) ? options.deployment[0] : options.deployment;
  const required = options.artifactName && options.environments && options.images && options.contextRef && deploymentPath && options.context && options.out;
  if (diagnostics.length > 0 || !required) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("artifact emit-contract --artifact-name <name> --environments <e1,e2> --images <images.lock.json> --context-ref <ref@sha256:..> --deployment <deployment.yml> --context <cluster-context.yml> --out <path> [--provenance-verified true|false] [--output-root <dir>]"));
    return 2;
  }
  try {
    requireDigestRef(options.contextRef);
    const rawDeployment = readFileSync(deploymentPath, "utf8");
    const rawImages = readFileSync(options.images, "utf8");
    const rawContext = readFileSync(options.context, "utf8");
    const environments = options.environments.split(",").map((env) => env.trim()).filter(Boolean);
    const adapterCompat = emitAdapterCompat(getPackageVersion(), readPackageIntegrity());
    const contract = emitArtifactContract({
      name: `${options.artifactName}-deploy`,
      environments,
      imageDigests: normalizeImageLock(JSON.parse(rawImages)),
      contextRef: options.contextRef,
      inputDigests: {
        deployment: sha256(rawDeployment),
        imagesLock: sha256(rawImages),
        context: sha256(rawContext),
      },
      adapterCompatDigest: adapterCompat.digest,
      schemaPackageIntegrity: readPackageIntegrity(),
      provenanceVerified: options.provenanceVerified === "true",
      outputs: buildOutputPaths(environments),
      files: loadOutputFileTree(options.outputRoot),
    });
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, YAML.stringify(contract, { lineWidth: 0 }));
    streams.stdout.write(`${JSON.stringify({ out: options.out, renderHash: contract.spec.renderHash, environments }, null, 2)}\n`);
    return 0;
  } catch (error) {
    writeDiagnostics(streams.stderr, [{ code: extractErrorCode(error), message: error instanceof Error ? error.message : String(error), path: "/" }]);
    return 1;
  }
}

function loadOutputFileTree(outputRoot) {
  if (!outputRoot || !existsSync(outputRoot)) return {};
  const files = {};
  for (const path of listFiles(outputRoot)) {
    const relativePath = relative(outputRoot, path).replaceAll("\\", "/");
    if (relativePath === "artifact-contract.yaml") continue;
    files[relativePath] = readFileSync(path, "utf8");
  }
  return files;
}

function readPackageIntegrity() {
  const pkgPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
  return `sha512-${createHash("sha512").update(readFileSync(pkgPath)).digest("base64")}`;
}

function extractErrorCode(error) {
  const match = error instanceof Error ? /^(E_[A-Z_]+)/.exec(error.message) : null;
  return match ? match[1] : "E_COMMAND";
}

function writeRenderedText(rendered, outputPath, stdout) {
  const text = typeof rendered === "string" && rendered.endsWith("\n") ? rendered : `${rendered}\n`;
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, text);
    return;
  }
  stdout.write(text);
}
