import type { KubernetesObject, ProjectModel, RendererResult, VaultDynamicSyncModel, VaultStaticSyncModel } from "../model.js";
import { renderYamlDocument } from "./yaml.js";

const ADAPTER = "deploy-v2-vso";
const DEFAULT_VAULT_ADDRESS = "http://vault.vault-system.svc.cluster.local:8200";

export function renderVso(model: ProjectModel): RendererResult {
  const vault = model.providerGraph.vault;
  const basePath = vault.basePath;
  const files = [
    {
      path: `${basePath}/vault-connection.yaml`,
      content: yaml(vaultConnection(model)),
      adapter: ADAPTER,
    },
    {
      path: `${basePath}/vault-auth.yaml`,
      content: yaml(vaultAuth(model)),
      adapter: ADAPTER,
    },
  ];

  for (const namespace of targetNamespaces(model)) {
    files.push({
      path: `${basePath}/${namespace}-serviceaccount.yaml`,
      content: yaml(serviceAccount(namespace, vault.operatorServiceAccount)),
      adapter: ADAPTER,
    });
  }

  for (const [name, sync] of sortedEntries(vault.staticSyncs)) {
    files.push({
      path: `${basePath}/${name}.yaml`,
      content: yaml(vaultStaticSecret(model, name, sync)),
      adapter: ADAPTER,
    });
  }

  for (const [name, sync] of sortedEntries(vault.dynamicSyncs)) {
    files.push({
      path: `${basePath}/${name}.yaml`,
      content: yaml(vaultDynamicSecret(model, name, sync)),
      adapter: ADAPTER,
    });
  }

  files.push({
    path: `${basePath}/kustomization.yaml`,
    content: yaml({
      apiVersion: "kustomize.config.k8s.io/v1beta1",
      kind: "Kustomization",
      resources: files.map((file) => file.path.split("/").at(-1)).sort(),
    }),
    adapter: ADAPTER,
  });

  return { files: files.sort((left, right) => left.path.localeCompare(right.path)) };
}

function vaultConnection(model: ProjectModel): KubernetesObject {
  const vault = model.providerGraph.vault;
  return {
    apiVersion: "secrets.hashicorp.com/v1beta1",
    kind: "VaultConnection",
    metadata: {
      name: vault.connectionName,
      namespace: vault.namespace,
    },
    spec: {
      address: vault.address ?? DEFAULT_VAULT_ADDRESS,
    },
  };
}

function vaultAuth(model: ProjectModel): KubernetesObject {
  const vault = model.providerGraph.vault;
  return {
    apiVersion: "secrets.hashicorp.com/v1beta1",
    kind: "VaultAuth",
    metadata: {
      name: vault.authName,
      namespace: vault.namespace,
    },
    spec: {
      vaultConnectionRef: vault.connectionName,
      method: "kubernetes",
      mount: vault.authMount,
      kubernetes: {
        role: vault.authRole,
        serviceAccount: vault.operatorServiceAccount,
      },
    },
  };
}

function serviceAccount(namespace: string, name: string): KubernetesObject {
  return {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name, namespace },
  };
}

function vaultStaticSecret(model: ProjectModel, name: string, sync: VaultStaticSyncModel): KubernetesObject {
  const vault = model.providerGraph.vault;
  return withoutUndefined({
    apiVersion: "secrets.hashicorp.com/v1beta1",
    kind: "VaultStaticSecret",
    metadata: {
      name,
      namespace: sync.target.namespace,
    },
    spec: withoutUndefined({
      vaultAuthRef: `${vault.namespace}/${vault.authName}`,
      type: "kv-v2",
      mount: sync.mount,
      path: normalizeKvPath(sync.path, sync.mount),
      destination: {
        name: sync.target.name,
        create: true,
      },
      refreshAfter: sync.refreshAfter ?? "1h",
      rolloutRestartTargets: rolloutTargets(sync.rolloutRestartTargets, sync.target.namespace),
    }),
  }) as KubernetesObject;
}

function vaultDynamicSecret(model: ProjectModel, name: string, sync: VaultDynamicSyncModel): KubernetesObject {
  const vault = model.providerGraph.vault;
  return withoutUndefined({
    apiVersion: "secrets.hashicorp.com/v1beta1",
    kind: "VaultDynamicSecret",
    metadata: {
      name,
      namespace: sync.target.namespace,
    },
    spec: withoutUndefined({
      vaultAuthRef: `${vault.namespace}/${vault.authName}`,
      mount: sync.engine,
      path: `creds/${sync.role}`,
      destination: {
        name: sync.target.name,
        create: true,
      },
      renewalPercent: sync.renewalPercent ?? 67,
    }),
  }) as KubernetesObject;
}

function targetNamespaces(model: ProjectModel): string[] {
  const namespaces = new Set<string>();
  for (const sync of Object.values(model.providerGraph.vault.staticSyncs)) namespaces.add(sync.target.namespace);
  for (const sync of Object.values(model.providerGraph.vault.dynamicSyncs)) namespaces.add(sync.target.namespace);
  return [...namespaces].sort();
}

function rolloutTargets(targets: VaultStaticSyncModel["rolloutRestartTargets"], namespace: string): KubernetesObject[] | undefined {
  const rendered = targets.map((target) => ({
    kind: target.kind,
    name: target.name,
  }));
  return rendered.length > 0 ? rendered : undefined;
}

function normalizeKvPath(path: string, mount: string): string {
  const mountDataPrefix = `${mount}/data/`;
  const mountPrefix = `${mount}/`;
  if (path.startsWith(mountDataPrefix)) return path.slice(mountDataPrefix.length);
  if (path.startsWith(mountPrefix)) return path.slice(mountPrefix.length);
  return path;
}

function yaml(value: unknown): string {
  return renderYamlDocument(value).trimEnd();
}

function sortedEntries<T>(object: Record<string, T>): Array<[string, T]> {
  return Object.entries(object).sort(([left], [right]) => left.localeCompare(right));
}

function withoutUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, withoutUndefined(child)]),
  );
}
