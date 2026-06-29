import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateArtifact } from "../artifact-validator.js";
import { applyEnvironment, loadEnvironmentFiles } from "./env.js";
import { loadYamlDocument } from "./io.js";
import { readDeploymentLock } from "./lockfile.js";
import {
  buildProjectModel,
  type DeploymentEnvironment,
  type Diagnostic,
  type ProjectModel,
  type RenderFile,
} from "./model.js";
import { resolveSources } from "./source-resolver.js";
import { assertSafeRenderPath, renderManagedDeployV2Content, sortRenderFiles } from "./render/files.js";
import { renderProject } from "./render/index.js";
export { renderProject } from "./render/index.js";
export { renderManagedDeployV2Content } from "./render/files.js";

export type CompileOptions = {
  environment: DeploymentEnvironment;
  sourcesPath: string;
  lockPath: string;
  nodeContractPath: string;
  reachabilityPath: string;
  deploymentPaths?: string[];
  collectionPaths?: string[];
  envPaths?: string[];
  outDir?: string;
  check?: boolean;
};

export type CompileResult = {
  ok: boolean;
  model?: ProjectModel;
  files: RenderFile[];
  diagnostics: Diagnostic[];
  writeResults?: WriteDeployV2Result[];
};

export type WriteDeployV2Result = {
  path: string;
  action: "create" | "update" | "unchanged";
  currentHash?: string;
  nextHash: string;
};

export function compileProject(options: CompileOptions): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const namedInputs: Array<[string, string]> = [
    ["deployment-sources-v1", options.sourcesPath],
    ["deployment-lock-v1", options.lockPath],
    ["node-contract-v1", options.nodeContractPath],
    ["reachability-v1", options.reachabilityPath],
    ...deploymentPaths(options).map((path): [string, string] => ["deployment-v2", path]),
    ...collectionPaths(options).map((path): [string, string] => ["collection-v1", path]),
  ];

  for (const [kind, path] of namedInputs) {
    const document = loadYamlDocument(path);
    const validation = validateArtifact(kind, document);
    diagnostics.push(...validation.diagnostics.map((diagnostic) => ({ ...diagnostic, path: `${path}${diagnostic.path}` })));
  }
  if (diagnostics.length > 0) {
    return { ok: false, files: [], diagnostics: diagnostics.sort(compareDiagnostics) };
  }

  const sourcesDocument = loadYamlDocument(options.sourcesPath) as any;
  const lockDocument = loadYamlDocument(options.lockPath);
  const lock = readDeploymentLock(lockDocument);
  const sources = {
    environments: sourcesDocument.spec?.environments ?? [],
    firstParty: sourcesDocument.spec?.firstParty ?? {},
    collections: sourcesDocument.spec?.collections ?? {},
    hosts: sourcesDocument.spec?.hosts,
    platformBlueprints: sourcesDocument.spec?.platformBlueprints,
    policies: sourcesDocument.spec?.policies ?? {},
  };
  const sourceResolution = resolveSources(sources, lock);
  if (!sourceResolution.valid) {
    return { ok: false, files: [], diagnostics: sourceResolution.diagnostics };
  }

  const deployments = deploymentPaths(options).map((path) => {
    const document = loadYamlDocument(path);
    const envFiles = loadEnvironmentFiles({ deploymentPath: path, environment: options.environment, envPaths: options.envPaths });
    return applyEnvironment(document, envFiles, options.environment);
  });
  const collections = collectionPaths(options).map((path) => loadYamlDocument(path));
  try {
    const model = buildProjectModel({
      environment: options.environment,
      sources,
      lock,
      nodeContract: loadYamlDocument(options.nodeContractPath) as any,
      reachability: loadYamlDocument(options.reachabilityPath) as any,
      deployments,
      collections,
      envFiles: options.envPaths ? {} : loadEnvironmentFiles({ deploymentPath: deploymentPaths(options)[0], environment: options.environment }),
    });
    const files = renderProject(model);
    const writeResults = options.outDir ? writeDeployV2Files(files, options.outDir, { check: options.check }) : undefined;
    return {
      ok: !writeResults || writeResults.every((result) => result.action === "unchanged") || !options.check,
      model,
      files,
      diagnostics: [],
      writeResults,
    };
  } catch (error) {
    const semanticDiagnostics = (error as { diagnostics?: Diagnostic[] }).diagnostics;
    return {
      ok: false,
      files: [],
      diagnostics: semanticDiagnostics ?? [{ code: "E_PROJECT_MODEL", path: "/", message: error instanceof Error ? error.message : String(error) }],
    };
  }
}

export function writeDeployV2Files(files: RenderFile[], root: string, options: { check?: boolean } = {}): WriteDeployV2Result[] {
  const results: WriteDeployV2Result[] = [];
  for (const file of sortRenderFiles(files)) {
    assertSafeRenderPath(file.path);
    const path = join(root, file.path);
    const content = renderManagedDeployV2Content(file);
    const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    const result: WriteDeployV2Result = {
      path: file.path,
      action: current === content ? "unchanged" : current === undefined ? "create" : "update",
      currentHash: current === undefined ? undefined : sha256(current),
      nextHash: sha256(content),
    };
    results.push(result);
    if (!options.check && result.action !== "unchanged") {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
  }
  return results;
}

function deploymentPaths(options: CompileOptions): string[] {
  return options.deploymentPaths ?? [join(dirname(options.sourcesPath), "deployment.yml")];
}

function collectionPaths(options: CompileOptions): string[] {
  const path = join(dirname(options.sourcesPath), "collection.yml");
  return options.collectionPaths ?? (existsSync(path) ? [path] : []);
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);
}
