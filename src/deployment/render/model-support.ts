import YAML from "yaml";
import type { KubernetesObject, ParityImportFile, ProjectModel, RenderFile } from "../model.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "kubernetes";

export function renderImportedModelSupport(model: ProjectModel): RenderFile[] {
  if (model.renderMode !== "parity" || !model.parityImports?.existingFiles?.length) {
    return [];
  }

  const supportFiles: RenderFile[] = [];
  for (const existing of model.parityImports.existingFiles) {
    if (existing.source.kind !== "model-rendered" || !existing.content) continue;
    const documents = modelSupportDocuments(existing);
    if (documents.length === 0) continue;
    supportFiles.push({
      path: existing.path,
      content: renderYamlDocuments(documents).trimEnd(),
      adapter: ADAPTER,
    });
  }
  return supportFiles;
}

function modelSupportDocuments(existing: ParityImportFile): KubernetesObject[] {
  return parseDocuments(existing.content ?? "");
}

function parseDocuments(content: string): KubernetesObject[] {
  return YAML.parseAllDocuments(content).map((document) => document.toJSON()).filter(Boolean) as KubernetesObject[];
}
