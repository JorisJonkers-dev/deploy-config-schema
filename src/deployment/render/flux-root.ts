import { posix } from "node:path";
import { inferFluxLayers } from "../../adapters/flux-root.js";
import type { AdapterArtifacts, AdapterContext } from "../../adapters/model.js";
import { fluxFile, fluxInterval, yamlDocuments } from "../../adapters/flux-utils.js";
import {
  projectModelToAdapterContext,
  type FluxLayerModel,
  type FluxWait,
  type ProjectModel,
  type RendererResult,
} from "../model.js";
import { sortRenderFiles } from "./files.js";

type RenderLayer = FluxLayerModel & {
  appPath?: string;
};

export function renderFluxRoot(model: ProjectModel, waits: FluxWait[]): RendererResult {
  if (!hasFluxRootInput(model, waits)) return { files: [] };
  const context = fluxAdapterContext(model);
  const layers = mergeWaits(model, normalizeLayers(model, context), waits);
  return {
    files: sortRenderFiles([
      fluxFile(posix.join(model.cluster.clusterRoot, "kustomization.yaml"), renderClusterKustomization(), "flux-root"),
      fluxFile(posix.join(model.cluster.clusterRoot, "kustomizations.yaml"), renderLayerKustomizations(model, layers), "flux-root"),
      fluxFile(posix.join(model.cluster.clusterRoot, "flux-system", "gotk-sync.yaml"), renderRootSync(model), "flux-root"),
    ]),
  };
}

function hasFluxRootInput(model: ProjectModel, waits: FluxWait[]): boolean {
  return model.flux.layers.length > 0 || Object.keys(model.flux.packs).length > 0 || waits.length > 0;
}

function fluxAdapterContext(model: ProjectModel): AdapterContext {
  const context = projectModelToAdapterContext(model) as AdapterContext & {
    artifacts: AdapterArtifacts;
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
  return context;
}

function normalizeLayers(model: ProjectModel, context: AdapterContext): RenderLayer[] {
  if (model.flux.layers.length > 0) {
    return model.flux.layers.map((layer) => ({
      ...layer,
      dependsOn: [...new Set(layer.dependsOn)].sort(),
      healthChecks: [...layer.healthChecks],
    }));
  }
  return inferFluxLayers(context).map((layer: {
    name: string;
    appPath: string;
    dependsOn: string[];
    wait?: boolean;
    timeout?: string;
    healthChecks?: FluxWait[];
  }) => ({
    name: layer.name,
    path: layer.appPath,
    appPath: layer.appPath,
    dependsOn: [...new Set(layer.dependsOn ?? [])].sort(),
    wait: layer.wait,
    timeout: layer.timeout,
    healthChecks: [...(layer.healthChecks ?? [])],
  }));
}

function mergeWaits(model: ProjectModel, layers: RenderLayer[], waits: FluxWait[]): RenderLayer[] {
  if (waits.length === 0) return layers;
  const merged = layers.map((layer) => ({ ...layer, healthChecks: [...layer.healthChecks] }));
  for (const wait of waits) {
    const layerName = owningLayerName(model, wait);
    const layer = merged.find((entry) => entry.name === layerName) ?? merged.find((entry) => entry.name === "apps-core") ?? merged[0];
    if (!layer) continue;
    layer.wait = true;
    if (!layer.healthChecks.some((entry) => sameWait(entry, wait))) {
      layer.healthChecks.push(wait);
    }
  }
  return merged;
}

function owningLayerName(model: ProjectModel, wait: FluxWait): string | undefined {
  for (const workload of Object.values(model.workloads)) {
    if (wait.namespace && wait.namespace !== workload.namespace) continue;
    if (workload.hooks.pre.some((hook) => wait.name === `${workload.name}-${hook.name}`) || wait.name.startsWith(`${workload.name}-`)) {
      return `apps-${workload.group.replaceAll("_", "-")}`;
    }
  }
  if (wait.namespace === model.providerGraph.vault.namespace) return "apps-vso-secrets";
  if (wait.namespace === "edge-system") return "apps-edge";
  if (wait.namespace === "observability") return "apps-observability";
  return undefined;
}

function sameWait(left: FluxWait, right: FluxWait): boolean {
  return left.apiVersion === right.apiVersion
    && left.kind === right.kind
    && left.name === right.name
    && left.namespace === right.namespace;
}

function renderClusterKustomization(): string {
  return [
    "apiVersion: kustomize.config.k8s.io/v1beta1",
    "kind: Kustomization",
    "resources:",
    "  - flux-system",
    "  - kustomizations.yaml",
  ].join("\n");
}

function renderLayerKustomizations(model: ProjectModel, layers: RenderLayer[]): string {
  const interval = fluxInterval(fluxAdapterContext(model));
  return yamlDocuments(layers.map((layer) => {
    const spec: Record<string, unknown> = {
      interval,
      path: layerPath(model, layer),
      prune: true,
    };
    if (layer.wait) spec.wait = true;
    if (layer.timeout) spec.timeout = layer.timeout;
    if (layer.healthChecks.length > 0) spec.healthChecks = layer.healthChecks;
    if (layer.dependsOn.length > 0) spec.dependsOn = layer.dependsOn.map((name) => ({ name }));
    spec.sourceRef = { kind: "GitRepository", name: model.flux.root.name };
    return {
      apiVersion: "kustomize.toolkit.fluxcd.io/v1",
      kind: "Kustomization",
      metadata: {
        name: layer.name,
        namespace: model.flux.root.namespace,
      },
      spec,
    };
  }));
}

function layerPath(model: ProjectModel, layer: RenderLayer): string {
  const path = layer.path || layer.appPath || layer.name.replace(/^apps-/, "");
  if (path.startsWith("./")) return path;
  if (path.startsWith(`${model.cluster.gitopsRoot}/`)) return `./${path}`;
  if (path.startsWith("apps/")) return `./${posix.join(model.cluster.gitopsRoot, path)}`;
  return `./${posix.join(model.cluster.gitopsRoot, "apps", path)}`;
}

function renderRootSync(model: ProjectModel): string {
  return yamlDocuments([
    {
      apiVersion: "source.toolkit.fluxcd.io/v1",
      kind: "GitRepository",
      metadata: {
        name: model.flux.root.name,
        namespace: model.flux.root.namespace,
      },
      spec: {
        interval: "1m0s",
        ref: {
          branch: model.flux.source.branch,
        },
        secretRef: {
          name: model.flux.source.secretRefName,
        },
        url: model.flux.source.url,
      },
    },
    {
      apiVersion: "kustomize.toolkit.fluxcd.io/v1",
      kind: "Kustomization",
      metadata: {
        name: model.flux.root.name,
        namespace: model.flux.root.namespace,
      },
      spec: {
        interval: fluxInterval(fluxAdapterContext(model)),
        path: model.flux.root.path,
        prune: true,
        sourceRef: {
          kind: "GitRepository",
          name: model.flux.root.name,
        },
      },
    },
  ]);
}
