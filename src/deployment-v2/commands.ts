// @ts-nocheck -- CLI command handlers intentionally accept the untyped option
// bag produced by src/cli.ts and route it into typed deployment-v2 modules.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import YAML from "yaml";
import { validateArtifact } from "../artifact-validator.js";
import { compileProject } from "./compiler.js";
import { loadYamlDocument } from "./io.js";
import { extractLockedImages, readDeploymentLock, updateDeploymentLock } from "./lockfile.js";
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
    artifactType: "application/vnd.jorisjonkers.deployment.bundle.v1+tar",
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
    ["deployment-sources-v1", options.sources],
    ["deployment-lock-v1", options.lock],
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
    ["deployment-sources-v1", options.sources],
    ["deployment-lock-v1", options.lock],
  ]);
  if (!validation.valid) {
    writeValidationResult(streams.stdout, validation);
    return 1;
  }
  const report = sourceReport(options.sources, options.lock);
  if (options.update) {
    const lock = readDeploymentLock(loadYamlDocument(options.lock));
    writeFileSync(options.lock, stringifyDocument(options.lock, {
      apiVersion: "deployment.jorisjonkers.dev/lock/v1",
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
    return 1;
  }
  const result = compileProject({
    environment: options.env,
    sourcesPath: options.sources,
    lockPath: options.lock,
    nodeContractPath: options.nodeContract,
    reachabilityPath: options.reachability,
    deploymentPaths: optionList(options.deployment),
    collectionPaths: optionList(options.collection),
    outDir: options.out,
    check: Boolean(options.check),
  });
  streams.stdout.write(`${JSON.stringify({
    ok: result.ok,
    files: result.files.map((file) => file.path),
    results: result.writeResults ?? [],
    diagnostics: result.diagnostics,
  }, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

export function runRenderFlux(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  const repo = options.repo ?? ".";
  const env = options.env ?? "production";
  if (diagnostics.length > 0) {
    writeDiagnostics(streams.stderr, diagnostics);
    return 1;
  }
  return runCompile([
    "--env", env,
    "--sources", join(repo, "deployment-sources.yml"),
    "--lock", join(repo, "deployment.lock.yml"),
    "--node-contract", join(repo, "inventory/node-contract.lock.yml"),
    "--reachability", join(repo, "catalog/reachability.yml"),
    "--deployment", join(repo, "deployment.yml"),
    "--collection", join(repo, "collection.yml"),
    "--out", join(repo, "cluster/flux"),
    ...(options.check ? ["--check"] : []),
  ], streams, parseOptions);
}

export function runImportFleetV1(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.fleet || !options.fluxTree || !options.out) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("import-fleet-v1 --fleet <fleet.yaml> --flux-tree <dir> --out <dir>"));
    return 1;
  }
  const fleet = loadYamlDocument(options.fleet);
  const imported = {
    apiVersion: "deployment.jorisjonkers.dev/v2",
    kind: "Deployment",
    metadata: {
      name: basename(options.out).replace(/[^a-z0-9._-]/g, "-") || "imported-fleet",
      labels: {
        "deployment.jorisjonkers.dev/imported-from": "fleet-v1",
      },
    },
    spec: {
      workloads: importedServices(fleet, options.fluxTree),
    },
  };
  mkdirSync(options.out, { recursive: true });
  const deploymentPath = join(options.out, "deployment.yml");
  writeFileSync(deploymentPath, YAML.stringify(imported, { lineWidth: 0 }));
  streams.stdout.write(`${JSON.stringify({
    out: deploymentPath,
    services: Object.keys(imported.spec.workloads).length,
  }, null, 2)}\n`);
  return 0;
}

export function runParity(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.current || !options.rendered) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("parity --current <old-tree> --rendered <new-tree>"));
    return 1;
  }
  const current = normalizedObjectMap(options.current);
  const rendered = normalizedObjectMap(options.rendered);
  const missing = [...current.keys()].filter((key) => !rendered.has(key)).sort();
  const extra = [...rendered.keys()].filter((key) => !current.has(key)).sort();
  const changed = [...current.keys()].filter((key) => rendered.has(key) && current.get(key) !== rendered.get(key)).sort();
  const ok = missing.length === 0 && extra.length === 0 && changed.length === 0;
  streams.stdout.write(`${JSON.stringify({ ok, missing, extra, changed }, null, 2)}\n`);
  return ok ? 0 : 1;
}

function runLockImages(args, streams, parseOptions) {
  const { options, diagnostics } = parseOptions(args);
  if (diagnostics.length > 0 || !options.lock) {
    writeDiagnostics(streams.stderr, diagnostics.length > 0 ? diagnostics : usageDiagnostic("lock images --lock deployment.lock.yml --format image-tags|json"));
    return 1;
  }
  const validation = validateNamedInputs([["deployment-lock-v1", options.lock]]);
  if (!validation.valid) {
    writeValidationResult(streams.stdout, validation);
    return 1;
  }
  const tags = extractLockedImages(readDeploymentLock(loadYamlDocument(options.lock)));
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

function importedServices(fleet, fluxTree) {
  const names = new Set();
  collectNames(fleet?.fleet?.exposure?.services ?? {}, names);
  for (const path of listFiles(fluxTree)) {
    if (!/\.(ya?ml|json)$/.test(path)) continue;
    try {
      const docs = YAML.parseAllDocuments(readFileSync(path, "utf8")).map((doc) => doc.toJSON()).filter(Boolean);
      for (const doc of docs) {
        if (doc?.metadata?.name) names.add(doc.metadata.name);
      }
    } catch {
      // Import remains best-effort until Wave C owns the full importer.
    }
  }
  if (names.size === 0) names.add("imported-service");
  return Object.fromEntries([...names].sort().map((name) => [slug(name), {
    image: "ghcr.io/jorisjonkers-dev/import-placeholder:latest",
    containers: [{ name: slug(name) }],
    routes: [],
    observability: {
      status: [],
    },
  }]));
}

function normalizedObjectMap(root) {
  const objects = new Map();
  for (const path of listFiles(root).filter((item) => /\.(json|ya?ml)$/.test(item))) {
    const docs = YAML.parseAllDocuments(readFileSync(path, "utf8")).map((doc) => doc.toJSON()).filter(Boolean);
    for (const doc of docs) {
      const normalized = normalizeKubernetesObject(doc);
      const key = [
        normalized.apiVersion ?? "",
        normalized.kind ?? "",
        normalized.metadata?.namespace ?? "default",
        normalized.metadata?.name ?? relative(root, path),
      ].join("/");
      objects.set(key, JSON.stringify(sortKeys(normalized)));
    }
  }
  return objects;
}

function normalizeKubernetesObject(value) {
  const copy = structuredClone(value);
  delete copy.metadata?.creationTimestamp;
  delete copy.metadata?.resourceVersion;
  delete copy.metadata?.uid;
  if (copy.kind === "GitRepository" && copy.metadata?.name === "flux-system" && copy.metadata?.namespace === "flux-system") {
    delete copy.spec?.url;
    delete copy.spec?.ref?.branch;
  }
  if (copy.kind === "Kustomization" && copy.metadata?.name === "flux-system" && copy.metadata?.namespace === "flux-system") {
    delete copy.spec?.path;
  }
  return copy;
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

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortKeys(item)]));
}

function collectNames(value, target) {
  for (const key of Object.keys(value)) target.add(key);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "imported-service";
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

function usageDiagnostic(command) {
  return [
    {
      code: "E_USAGE",
      message: `usage: deploy-config-schema ${command}`,
      path: "/",
    },
  ];
}
