import YAML from "yaml";
import type { GatusEndpointModel, ProjectModel, RendererResult, WorkloadModel } from "../model.js";

const ADAPTER = "deploy-v2-gatus";

type GatusEndpoint = {
  name: string;
  group: string;
  url: string;
  interval: string;
  conditions: string[];
};

export function renderGatus(model: ProjectModel): RendererResult {
  const endpoints = Object.values(model.workloads)
    .flatMap((workload) => workload.observability.status.flatMap((status) => endpointEntries(model, workload, status)))
    .sort((left, right) => left.group.localeCompare(right.group) || left.name.localeCompare(right.name));

  return {
    files: [{
      path: `${model.cluster.appsRoot}/observability/gatus/gatus-endpoints-configmap.yaml`,
      content: renderConfigMap({
        name: adapterConfigMapName(model, "gatus", "gatus-endpoints"),
        namespace: adapterNamespace(model, "gatus", "observability"),
        dataKey: "endpoints.yaml",
        document: { endpoints },
      }),
      adapter: ADAPTER,
    }],
  };
}

function endpointEntries(model: ProjectModel, workload: WorkloadModel, status: GatusEndpointModel): GatusEndpoint[] {
  const strategy = resolveProbeStrategy(model, workload, status);
  const suffix = strategy === "both";
  const endpoints = [];
  if (strategy === "internal" || strategy === "both") {
    endpoints.push(endpoint(status, internalUrl(workload, status), suffix ? " (internal)" : ""));
  }
  if (strategy === "external" || strategy === "both") {
    endpoints.push(endpoint(status, status.url, suffix ? " (external)" : ""));
  }
  return endpoints;
}

function resolveProbeStrategy(model: ProjectModel, workload: WorkloadModel, status: GatusEndpointModel): "internal" | "external" | "both" {
  if (status.strategy) return status.strategy;
  if (status.type === "tcp") return "internal";
  const publicRoute = model.routes.find((route) => route.serviceName === workload.name && route.tier === "public-frankfurt");
  if (!publicRoute) return "internal";
  return publicRoute.authScope === "anonymous" ? "external" : "internal";
}

function endpoint(status: GatusEndpointModel, url: string, suffix: string): GatusEndpoint {
  return {
    name: `${status.name}${suffix}`,
    group: status.group,
    url,
    interval: status.interval ?? "60s",
    conditions: status.conditions.length > 0 ? status.conditions : defaultConditions(status),
  };
}

function internalUrl(workload: WorkloadModel, status: GatusEndpointModel): string {
  const service = workload.service;
  if (!service) return status.url;
  const health = workload.probes.importedHealth;
  const routePort = firstRoutePort(workload);
  const namedPort = health?.port ?? routePort ?? service.ports[0]?.name;
  const port = service.ports.find((candidate) => candidate.name === namedPort);
  const numericNamedPort = namedPort ? Number(namedPort) : Number.NaN;
  const renderedPort = port?.servicePort
    ?? port?.containerPort
    ?? (Number.isNaN(numericNamedPort) ? undefined : numericNamedPort)
    ?? service.ports[0]?.servicePort
    ?? service.ports[0]?.containerPort
    ?? 80;
  const host = `${service.name}.${workload.namespace}.svc.cluster.local`;
  if (status.type === "tcp") {
    return `tcp://${host}:${renderedPort}`;
  }
  return `http://${host}:${renderedPort}${health?.path ?? urlPath(status.url)}`;
}

function firstRoutePort(workload: WorkloadModel): string | undefined {
  return workload.service?.ports[0]?.name;
}

function urlPath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/";
  }
}

function defaultConditions(status: GatusEndpointModel): string[] {
  if (status.type === "tcp") return ["[CONNECTED] == true"];
  return ["[STATUS] == 200", "[RESPONSE_TIME] < 1500"];
}

function renderConfigMap({ name, namespace, dataKey, document }: {
  name: string;
  namespace: string;
  dataKey: string;
  document: unknown;
}): string {
  const body = YAML.stringify(document, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
    directives: true,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
    indentSeq: false,
  }).trimEnd();

  return [
    "apiVersion: v1",
    "kind: ConfigMap",
    "metadata:",
    `  name: ${name}`,
    `  namespace: ${namespace}`,
    "data:",
    `  ${dataKey}: |`,
    ...body.split("\n").map((line) => `    ${line}`),
  ].join("\n");
}

function adapterNamespace(model: ProjectModel, adapter: string, fallback: string): string {
  return model.adapterArtifacts["deploy-config"].adapter_output_intent.namespaces?.[adapter] ?? fallback;
}

function adapterConfigMapName(model: ProjectModel, adapter: string, fallback: string): string {
  return model.adapterArtifacts["deploy-config"].adapter_output_intent.configmap_names?.[adapter] ?? fallback;
}
