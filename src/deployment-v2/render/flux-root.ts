import type { FluxWait, ProjectModel, RendererResult } from "../model.js";

export function renderFluxRoot(_model: ProjectModel, _waits: FluxWait[]): RendererResult {
  return { files: [] };
}
