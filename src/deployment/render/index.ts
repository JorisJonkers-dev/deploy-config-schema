import type { FluxWait, ProjectModel, RenderFile, RendererResult } from "../model.js";
import { sortRenderFiles } from "./files.js";
import { renderFluxAssembly } from "./flux-assembly.js";
import { renderFluxRoot } from "./flux-root.js";
import { renderGatus } from "./gatus.js";
import { renderImportedParityFiles } from "./imported-files.js";
import { renderKubernetes } from "./kubernetes.js";
import { renderNetworkPolicies } from "./networkpolicy.js";
import { renderServiceMonitors } from "./servicemonitor.js";
import { renderTraefik } from "./traefik.js";
import { renderVso } from "./vso.js";

export type Renderer = (model: ProjectModel) => RendererResult;

export function renderProject(model: ProjectModel): RenderFile[] {
  const waits: FluxWait[] = [];
  const files: RenderFile[] = [];
  for (const result of [
    renderKubernetes(model),
    renderServiceMonitors(model),
    renderTraefik(model),
    renderVso(model),
    renderGatus(model),
    renderNetworkPolicies(model),
    renderFluxAssembly(model),
  ]) {
    files.push(...result.files);
    waits.push(...(result.waits ?? []));
  }
  const fluxRoot = renderFluxRoot(model, waits);
  files.push(...fluxRoot.files);
  const importedParityFiles = renderImportedParityFiles(model, files);
  if (importedParityFiles) return sortRenderFiles(importedParityFiles);
  return sortRenderFiles(files);
}
