import YAML from "yaml";
import { parityObjectKey } from "../parity.js";
import type { KubernetesObject, ProjectModel, RenderFile } from "../model.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "import-live-fleet";

export function renderImportedParityFiles(model: ProjectModel): RenderFile[] | undefined {
  if (model.renderMode !== "parity" || !model.parityImports?.existingFiles?.length) {
    return undefined;
  }

  const seen = new Set<string>();
  const files: RenderFile[] = [];
  for (const existing of model.parityImports.existingFiles) {
    const documents = YAML.parseAllDocuments(existing.content).map((document) => document.toJSON()).filter(Boolean) as KubernetesObject[];
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
      adapter: ADAPTER,
    });
  }

  return files;
}
