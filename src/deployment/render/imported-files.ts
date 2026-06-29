import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { parityObjectKey } from "../parity.js";
import type { KubernetesObject, ParityImportFile, ProjectModel, RenderFile } from "../model.js";
import { assertSafeRenderPath } from "./files.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTERS = {
  "model-rendered": "model-rendered",
  "pack-sourced": "pack-sourced",
  "collection-sourced": "collection-sourced",
  carried: "carried-parity",
} as const;

export function renderImportedParityFiles(model: ProjectModel, modelFiles: RenderFile[] = []): RenderFile[] | undefined {
  if (model.renderMode !== "parity" || !model.parityImports?.existingFiles?.length) {
    return undefined;
  }

  const seen = new Set<string>();
  const modelDocuments = indexModelDocuments(modelFiles);
  const files: RenderFile[] = [];
  for (const existing of model.parityImports.existingFiles) {
    const documents = documentsFor(model, existing, modelDocuments);
    const uniqueDocuments = documents.filter((document, documentIndex) => {
      const key = parityObjectKey(document, existing.path, documentIndex);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (uniqueDocuments.length === 0) continue;
    files.push({
      path: existing.path,
      content: renderYamlDocuments(uniqueDocuments).trimEnd(),
      adapter: ADAPTERS[existing.source.kind],
    });
  }

  return files;
}

function documentsFor(
  model: ProjectModel,
  existing: ParityImportFile,
  modelDocuments: Map<string, KubernetesObject>,
): KubernetesObject[] {
  if (existing.source.kind === "model-rendered") {
    const currentDocuments = parseDocuments(contentFor(model, existing));
    return currentDocuments.map((document, index) => {
      const key = parityObjectKey(document, existing.path, index);
      const rendered = modelDocuments.get(key);
      if (!rendered) {
        throw new Error(`model-rendered parity import ${existing.path} is not produced by the deployment model`);
      }
      return rendered;
    });
  }
  return parseDocuments(contentFor(model, existing));
}

function contentFor(model: ProjectModel, existing: ParityImportFile): string {
  const sourceContent = sourceBackedContent(model, existing);
  if (sourceContent !== undefined) return sourceContent;
  if (existing.content !== undefined) return existing.content;
  throw new Error(`parity import ${existing.path} does not include content or a resolvable source path`);
}

function sourceBackedContent(model: ProjectModel, existing: ParityImportFile): string | undefined {
  const source = existing.source;
  if (source.kind === "pack-sourced" && source.path) {
    return readOptional(model.sources.platformBlueprints?.paths?.[0], source.path);
  }
  if (source.kind === "collection-sourced" && source.path) {
    return readOptional(model.sources.collections[source.collection]?.paths?.[0], source.path);
  }
  return undefined;
}

function readOptional(root: string | undefined, path: string): string | undefined {
  if (!root) return undefined;
  assertSafeRenderPath(path);
  const resolved = join(root, path);
  return existsSync(resolved) ? readFileSync(resolved, "utf8") : undefined;
}

function parseDocuments(content: string): KubernetesObject[] {
  return YAML.parseAllDocuments(content).map((document) => document.toJSON()).filter(Boolean) as KubernetesObject[];
}

function indexModelDocuments(files: RenderFile[]): Map<string, KubernetesObject> {
  const result = new Map<string, KubernetesObject>();
  for (const file of files) {
    const documents = parseDocuments(file.content);
    documents.forEach((document, index) => result.set(parityObjectKey(document, file.path, index), document));
  }
  return result;
}
