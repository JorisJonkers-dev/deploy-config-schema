import { renderFluxPacks } from "../../adapters/flux-packs.js";
import { renderFluxSource } from "../../adapters/flux-source.js";
import type { AdapterArtifacts, AdapterContext } from "../../adapters/model.js";
import { projectModelToAdapterContext, type ProjectModel, type RendererResult } from "../model.js";
import { sortRenderFiles } from "./files.js";

export function renderFluxAssembly(model: ProjectModel): RendererResult {
  if (!hasFluxAssemblyInput(model)) return { files: [] };
  const context = fluxAdapterContext(model);
  return {
    files: sortRenderFiles([
      ...renderFluxPacks(context),
      ...renderFluxSource(context),
    ]),
  };
}

function fluxAdapterContext(model: ProjectModel): AdapterContext {
  const context = projectModelToAdapterContext(model) as AdapterContext & {
    artifacts: AdapterArtifacts;
    overrides?: Record<string, unknown>;
  };
  const platform = context.artifacts.platform ?? {};
  context.artifacts = {
    ...context.artifacts,
    platform: {
      ...platform,
      gitops: {
        ...platform.gitops,
        root: model.cluster.gitopsRoot,
        environment: model.cluster.fluxEnvironment,
        interval: model.cluster.interval,
      },
      packs: Object.keys(model.flux.packs).length > 0 ? model.flux.packs : platform.packs,
    },
  };

  const blueprintRoot = model.sources.platformBlueprints?.paths?.[0];
  if (blueprintRoot) {
    context.overrides = {
      ...context.overrides,
      flux: {
        ...((context.overrides?.flux as Record<string, unknown> | undefined) ?? {}),
        blueprintRoot,
      },
    };
  }
  return context;
}

function hasFluxAssemblyInput(model: ProjectModel): boolean {
  return Object.keys(model.flux.packs).length > 0 || model.flux.layers.length > 0;
}
