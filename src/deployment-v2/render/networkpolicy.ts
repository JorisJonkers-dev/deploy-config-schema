import type { KubernetesObject, ProjectModel, ProviderExportModel, RendererResult, RouteModel, WorkloadModel } from "../model.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "deploy-v2-networkpolicy";

export function renderNetworkPolicies(model: ProjectModel): RendererResult {
  if (model.renderMode === "parity") {
    const policies = [
      ...(model.parityImports?.networkPolicies ?? []),
      ...Object.values(model.workloads).flatMap((workload) => workload.importedParity?.networkPolicies ?? []),
    ];
    return policies.length > 0 ? {
      files: [{
        path: `${model.cluster.appsRoot}/network-policies/imported-networkpolicies.yaml`,
        content: renderYamlDocuments(policies),
        adapter: ADAPTER,
      }],
    } : { files: [] };
  }

  const policies = [
    ...model.routes.flatMap((route) => edgePolicy(model, route)),
    ...Object.values(model.providerGraph.data).flatMap((provider) => providerPolicies(model, provider)),
    ...Object.values(model.providerGraph.messaging).flatMap((provider) => providerPolicies(model, provider)),
  ].sort(comparePolicy);

  return policies.length > 0 ? {
    files: [{
      path: `${model.cluster.appsRoot}/network-policies/networkpolicies.yaml`,
      content: renderYamlDocuments(policies),
      adapter: ADAPTER,
    }],
  } : { files: [] };
}

function edgePolicy(model: ProjectModel, route: RouteModel): KubernetesObject[] {
  const workload = model.workloads[route.serviceName];
  if (!workload?.service) return [];
  return [{
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: `${workload.name}-allow-edge`,
      namespace: workload.namespace,
    },
    spec: {
      podSelector: { matchLabels: labels(workload.name) },
      policyTypes: ["Ingress"],
      ingress: [{
        from: [{
          namespaceSelector: {
            matchLabels: { "kubernetes.io/metadata.name": model.adapterArtifacts["deploy-config"].ingress_intent.defaults.namespace },
          },
        }],
        ports: route.rules.map((rule) => {
          const port = workload.service?.ports.find((candidate) => candidate.name === rule.port);
          return {
            protocol: port?.protocol ?? "TCP",
            port: port?.servicePort ?? port?.containerPort ?? rule.port,
          };
        }),
      }],
    },
  }];
}

function providerPolicies(model: ProjectModel, provider: ProviderExportModel): KubernetesObject[] {
  if (!provider.endpoint) return [];
  return model.providerGraph.credentials
    .filter((credential) => credential.claim === provider.name || credential.claim.endsWith(`.${provider.name}`))
    .flatMap((credential) => {
      const workload = Object.values(model.workloads).find((candidate) => candidate.credentials.some((item) => item.name === credential.name && item.claim === credential.claim));
      if (!workload) return [];
      return [providerPolicy(workload, provider)];
    });
}

function providerPolicy(workload: WorkloadModel, provider: ProviderExportModel): KubernetesObject {
  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name: `${workload.name}-allow-${provider.name}`,
      namespace: workload.namespace,
    },
    spec: {
      podSelector: { matchLabels: labels(workload.name) },
      policyTypes: ["Egress"],
      egress: [{
        to: [{
          namespaceSelector: {
            matchLabels: { "kubernetes.io/metadata.name": provider.namespace ?? workload.namespace },
          },
          podSelector: {
            matchLabels: labels(provider.endpoint?.service ?? provider.name),
          },
        }],
        ports: [{
          protocol: "TCP",
          port: provider.endpoint?.port,
        }],
      }],
    },
  };
}

function labels(serviceName: string): Record<string, string> {
  return { "app.kubernetes.io/name": serviceName };
}

function comparePolicy(left: KubernetesObject, right: KubernetesObject): number {
  const leftMetadata = left.metadata as { namespace?: string; name?: string } | undefined;
  const rightMetadata = right.metadata as { namespace?: string; name?: string } | undefined;
  return `${leftMetadata?.namespace ?? ""}/${leftMetadata?.name ?? ""}`.localeCompare(`${rightMetadata?.namespace ?? ""}/${rightMetadata?.name ?? ""}`);
}
