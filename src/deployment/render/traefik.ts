import type { ExposureTier, ProjectModel, RouteModel, RouteRuleModel, KubernetesObject, RendererResult } from "../model.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "deployment-traefik";

type RenderedRoute = {
  route: RouteModel;
  tier: ExposureTier;
};

export function renderTraefik(model: ProjectModel): RendererResult {
  const publicRoutes = routesForTier(model, "public-frankfurt");
  const lanRoutes = routesForTier(model, "lan");
  const files = [];

  if (publicRoutes.length > 0) {
    files.push({
      path: `${model.cluster.appsRoot}/edge/traefik-ingressroutes.yaml`,
      content: renderYamlDocuments(publicRoutes.map(({ route }) => ingressRoute(model, route, "public-frankfurt"))),
      adapter: ADAPTER,
    });
  }

  if (lanRoutes.length > 0) {
    files.push({
      path: `${model.cluster.appsRoot}/edge/traefik-lan-ingressroutes.yaml`,
      content: renderYamlDocuments(lanRoutes.map(({ route }) => ingressRoute(model, route, "lan"))),
      adapter: ADAPTER,
    });
  }

  return { files };
}

function routesForTier(model: ProjectModel, tier: ExposureTier): RenderedRoute[] {
  return model.routes
    .filter((route) => route.tier === tier)
    .filter((route) => model.workloads[route.serviceName]?.service)
    .map((route) => ({ route, tier }))
    .sort((left, right) => routeName(left.route, tier).localeCompare(routeName(right.route, tier)));
}

function ingressRoute(model: ProjectModel, route: RouteModel, tier: ExposureTier): KubernetesObject {
  const defaults = model.adapterArtifacts["deploy-config"].ingress_intent.defaults;
  const namespace = defaults.namespace;
  const isLan = tier === "lan";
  const annotations: Record<string, string> = {};

  if (!isLan) {
    annotations["external-dns.alpha.kubernetes.io/target"] = defaults.public_dns_target ?? `ingress.${model.cluster.publicDomain}`;
    annotations["external-dns.alpha.kubernetes.io/cloudflare-proxied"] = "true";
  }
  annotations["kubernetes.io/ingress.class"] = isLan ? defaults.lan_ingress_class : defaults.public_ingress_class;

  const spec: KubernetesObject = {
    entryPoints: [defaults.entrypoint],
    routes: route.rules.map((rule) => routeEntry(model, route, rule, isLan)),
  };
  if (defaults.tls) {
    spec.tls = {};
  }

  return {
    apiVersion: "traefik.io/v1alpha1",
    kind: "IngressRoute",
    metadata: {
      name: routeName(route, tier),
      namespace,
      annotations,
    },
    spec,
  };
}

function routeEntry(model: ProjectModel, route: RouteModel, rule: RouteRuleModel, isLan: boolean): KubernetesObject {
  const namespace = model.adapterArtifacts["deploy-config"].ingress_intent.defaults.namespace;
  const workload = model.workloads[route.serviceName];
  const service = workload.service;
  if (!service) {
    throw new Error(`route ${route.name} references workload ${route.serviceName} without a service`);
  }
  const servicePort = service.ports.find((port) => port.name === rule.port);
  if (!servicePort) {
    throw new Error(`route ${route.name} references unknown port ${rule.port}`);
  }

  const entry: KubernetesObject = {
    kind: "Rule",
    match: toTraefikMatch(route.host, rule),
  };
  const middlewares = routeMiddlewares(model, route, rule, isLan);
  if (middlewares.length > 0) {
    entry.middlewares = middlewares.map((name) => ({ name, namespace }));
  }
  if (model.renderMode === "native" && rule.priority !== undefined) {
    entry.priority = rule.priority;
  }
  entry.services = [{
    name: service.name,
    namespace: workload.namespace,
    port: servicePort.servicePort ?? servicePort.containerPort,
  }];
  return entry;
}

function routeMiddlewares(model: ProjectModel, route: RouteModel, rule: RouteRuleModel, isLan: boolean): string[] {
  if (isLan) return [...rule.middleware];
  const middlewares = [...rule.middleware];
  if (route.authScope !== "anonymous") {
    middlewares.push(model.adapterArtifacts["deploy-config"].ingress_intent.defaults.sso_middleware ?? "forward-auth");
  }
  return middlewares;
}

function toTraefikMatch(host: string, rule: RouteRuleModel): string {
  const pathPredicate = rule.operation === "exact"
    ? `Path(\`${rule.path}\`)`
    : rule.operation === "regexp"
      ? `PathRegexp(\`${rule.path}\`)`
      : `PathPrefix(\`${rule.path}\`)`;
  return `Host(\`${host}\`) && ${pathPredicate}`;
}

function routeName(route: RouteModel, tier: ExposureTier): string {
  return tier === "lan" ? `${route.name}-lan` : route.name;
}
