import { z } from "zod";
import type {
  AdapterContext,
  DeployConfig,
  FleetInventoryArtifact,
  PlatformConfig,
  ServiceIntentArtifact,
  VaultDynamicSecretsArtifact,
} from "../adapters/model.js";

export type DeploymentEnvironment = "runtime" | "development" | "staging" | "production";
export type RenderMode = "parity" | "v2";
export type AuthScope = "anonymous" | "application" | "user";
export type ExposureTier = "public-frankfurt" | "lan";
export type WorkloadKind = "deployment" | "statefulset" | "job" | "cronjob" | "external_service" | "host_native" | "nomad_job";

export type KubernetesObject = Record<string, unknown>;

export type RenderFile = {
  path: string;
  content: string;
  adapter: string;
  executable?: boolean;
};

export type FluxWait = {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
};

export type RendererResult = {
  files: RenderFile[];
  waits?: FluxWait[];
};

export type ClusterModel = {
  name: string;
  publicDomain: string;
  gitopsRoot: string;
  appsRoot: string;
  clusterRoot: string;
  fluxEnvironment: string;
  interval: string;
};

export type DeploymentModel = {
  name: string;
  sourceName: string;
  sourceKind: "firstParty" | "collection" | "imported";
  labels: Record<string, string>;
  workloadNames: string[];
};

export type CollectionModel = {
  name: string;
  domain?: string;
  deploymentNames: string[];
  providerExports: Record<string, ProviderExportModel>;
};

export type DeploymentSourcesModel = {
  environments: DeploymentEnvironment[];
  firstParty: Record<string, { bundle: string; repo?: string; policy?: "locked" | "release" }>;
  collections: Record<string, { repo: string; ref: string; sha?: string; paths: string[] }>;
  hosts?: { repo: string; ref: string; sha?: string; paths?: string[] };
  platformBlueprints?: { repo: string; ref: string; sha?: string; paths?: string[] };
  policies: Record<string, unknown>;
};

export type DeploymentLockModel = {
  metadata: { generatedAt: string; renderedRootDigest?: string };
  inputs: {
    firstParty: Record<string, { bundle: string; manifestDigest: string; repoSha: string; images: string[] }>;
    collections: Record<string, { repo: string; ref: string; sha?: string; paths: string[] }>;
    homelabHosts?: { repo: string; ref: string; sha?: string; paths?: string[] };
    platformBlueprints?: { repo: string; ref: string; sha?: string; paths?: string[] };
    charts: Record<string, { version: string; digest: string }>;
    images: Record<string, string>;
  };
};

export type NodeContractModel = {
  metadata: { sourceSha: string };
  nodes: Record<string, NodeModel>;
};

export type NodeModel = {
  status: "active" | "ignored" | "planned" | "retired";
  schedulable: boolean;
  site: string;
  arch: "amd64" | "arm64";
  labels: Record<string, string>;
  taints: Array<{ key: string; value?: string; effect: "NoSchedule" | "PreferNoSchedule" | "NoExecute" }>;
  storage: {
    longhorn: {
      eligible: boolean;
      nodeTags: string[];
      disks: Array<{ name: string; path: string; tags: string[] }>;
    };
  };
};

export type ReachabilityModel = {
  channels: Record<ExposureTier, { hosts: string[]; auth?: Record<string, unknown> }>;
};

export type ImageModel = {
  repository: string;
  tag: string;
  ref: string;
  pullPolicy?: "Always" | "IfNotPresent" | "Never";
  pullSecrets: string[];
  updateEligible: boolean;
};

export type ContainerModel = {
  name: string;
  image?: ImageModel;
  command?: string[];
  args?: string[];
  ports: PortModel[];
  env: Record<string, string>;
  envFromSecrets: Array<{ name: string; optional?: boolean }>;
  resources?: ResourceModel;
  volumeMounts: VolumeMountModel[];
  probes?: ProbeModel;
};

export type ResourceModel = {
  requests?: { cpu?: string; memory?: string };
  limits?: { cpu?: string; memory?: string };
};

export type PortModel = {
  name: string;
  containerPort: number;
  servicePort?: number;
  protocol?: "TCP" | "UDP";
};

export type ServiceModel = {
  name: string;
  annotations: Record<string, string>;
  ports: PortModel[];
};

export type ConfigModel = {
  values: Record<string, string>;
  files: Record<string, string>;
};

export type SecretEnvModel = {
  name: string;
  destinationSecretName: string;
  envKeys: string[];
};

export type CredentialBindingModel = {
  name: string;
  claim: string;
  provider: "vault-kv" | "postgres" | "mariadb" | "rabbitmq" | "external";
  destinationSecretName: string;
  namespace: string;
  rotation?: { refreshAfter?: string; renewalPercent?: number };
};

export type StorageModel = {
  volumes: StorageVolumeModel[];
  mounts: VolumeMountModel[];
  tiers: Record<string, { storageClassName: string }>;
};

export type StorageVolumeModel = {
  name: string;
  kind: "persistent" | "host_path" | "empty_dir" | "config_map" | "secret";
  size?: string;
  accessModes?: string[];
  storageClassName?: string;
  tier?: string;
  hostPath?: string;
  statefulTemplate?: boolean;
};

export type VolumeMountModel = {
  volume: string;
  path: string;
  readOnly?: boolean;
};

export type PlacementModel = {
  nodeName?: string;
  site?: string;
  nodeSelector: Record<string, string>;
  requiredCapabilities: string[];
  tolerations: KubernetesObject[];
  topologySpread: string[];
};

export type AutoscalingModel = {
  minReplicas?: number;
  maxReplicas: number;
  targetCpuUtilization?: number;
  targetMemoryUtilization?: number;
  keda?: { triggers: KubernetesObject[] };
};

export type ProbeModel = {
  startup?: KubernetesObject;
  readiness?: KubernetesObject;
  liveness?: KubernetesObject;
  importedHealth?: {
    type: "http" | "tcp";
    path?: string;
    port: string;
    expectedStatus?: number;
    responseTimeMs?: number;
  };
};

export type WorkloadObservabilityModel = {
  status: GatusEndpointModel[];
  metrics: ServiceMonitorModel[];
};

export type GatusEndpointModel = {
  name: string;
  group: string;
  url: string;
  type: "http" | "tcp";
  interval?: string;
  conditions: string[];
  strategy?: "internal" | "external" | "both";
};

export type ServiceMonitorModel = {
  kind: "ServiceMonitor" | "PodMonitor";
  port: string;
  path?: string;
  interval?: string;
};

export type HookModel = {
  pre: HookJobModel[];
};

export type HookJobModel = {
  name: string;
  image?: ImageModel;
  command?: string[];
  args?: string[];
  env: Record<string, string>;
};

export type RolloutModel = {
  strategy?: string;
  pdbMinAvailable?: number | string;
  maxUnavailable?: number | string;
};

export type WorkloadModel = {
  name: string;
  deploymentName: string;
  group: string;
  namespace: string;
  kind: WorkloadKind;
  replicas?: number;
  schedule?: string;
  restartPolicy?: string;
  serviceAccountName?: string;
  image: ImageModel;
  containers: ContainerModel[];
  initContainers: ContainerModel[];
  sidecars: ContainerModel[];
  service?: ServiceModel;
  config: ConfigModel;
  secrets: SecretEnvModel[];
  credentials: CredentialBindingModel[];
  storage: StorageModel;
  placement: PlacementModel;
  autoscaling?: AutoscalingModel;
  probes: ProbeModel;
  observability: WorkloadObservabilityModel;
  hooks: HookModel;
  rollout: RolloutModel;
  rawManifests: KubernetesObject[];
  importedParity?: {
    workloadFileName?: string;
    kedaObjects?: KubernetesObject[];
    networkPolicies?: KubernetesObject[];
  };
};

export type RouteModel = {
  name: string;
  serviceName: string;
  host: string;
  tier: ExposureTier;
  authScope: AuthScope;
  rules: RouteRuleModel[];
};

export type RouteRuleModel = {
  path: string;
  operation: "prefix" | "exact" | "regexp";
  port: string;
  priority?: number;
  middleware: string[];
};

export type ProviderGraphModel = {
  data: Record<string, ProviderExportModel>;
  messaging: Record<string, ProviderExportModel>;
  credentials: CredentialBindingModel[];
  vault: VaultModel;
};

export type ProviderExportModel = {
  name: string;
  type: "database" | "messaging" | "kv" | "external";
  namespace?: string;
  endpoint?: { service: string; port: number | string };
  grants?: Record<string, unknown>;
};

export type VaultModel = {
  namespace: string;
  basePath: string;
  address?: string;
  connectionName: string;
  authName: string;
  authMount: string;
  authRole: string;
  operatorServiceAccount: string;
  kvMount: string;
  staticSyncs: Record<string, VaultStaticSyncModel>;
  dynamicSyncs: Record<string, VaultDynamicSyncModel>;
};

export type VaultStaticSyncModel = {
  target: { name: string; namespace: string };
  mount: string;
  path: string;
  refreshAfter?: string;
  rolloutRestartTargets: Array<{ kind: string; name: string }>;
};

export type VaultDynamicSyncModel = {
  target: { name: string; namespace: string };
  engine: string;
  role: string;
  renewalPercent?: number;
};

export type FluxModel = {
  source: {
    url: string;
    branch: string;
    secretRefName: string;
  };
  root: {
    namespace: string;
    name: string;
    path: string;
  };
  layers: FluxLayerModel[];
  packs: Record<string, unknown>;
};

export type FluxLayerModel = {
  name: string;
  path: string;
  dependsOn: string[];
  wait?: boolean;
  timeout?: string;
  healthChecks: FluxWait[];
};

export type ParityImportModel = {
  networkPolicies: KubernetesObject[];
  extraObjects: KubernetesObject[];
  existingFiles: RenderFile[];
};

export type AdapterArtifactsModel = {
  "deploy-config": DeployConfig;
  "service-intent": ServiceIntentArtifact;
  "fleet-inventory": FleetInventoryArtifact;
  "vault-dynamic-secrets": VaultDynamicSecretsArtifact;
  platform: PlatformConfig;
};

export type ProjectModel = {
  apiVersion: "deployment.jorisjonkers.dev/ir/v1";
  environment: DeploymentEnvironment;
  renderMode: RenderMode;
  cluster: ClusterModel;
  sources: DeploymentSourcesModel;
  lock: DeploymentLockModel;
  nodeContract: NodeContractModel;
  reachability: ReachabilityModel;
  collections: Record<string, CollectionModel>;
  deployments: Record<string, DeploymentModel>;
  workloads: Record<string, WorkloadModel>;
  routes: RouteModel[];
  providerGraph: ProviderGraphModel;
  flux: FluxModel;
  parityImports?: ParityImportModel;
  adapterArtifacts: AdapterArtifactsModel;
};

export type CompilerInputSet = {
  environment: DeploymentEnvironment;
  sources: DeploymentSourcesModel | { spec?: unknown };
  lock: DeploymentLockModel | { inputs?: unknown };
  nodeContract: NodeContractModel;
  reachability: ReachabilityModel;
  deployments: unknown[];
  collections: unknown[];
  envFiles: Record<string, unknown>;
  repoRoot?: string;
};

export type Diagnostic = {
  code: string;
  message: string;
  path: string;
};

const stringRecordSchema = z.record(z.string());
const kubernetesObjectSchema = z.record(z.unknown());
const deploymentEnvironmentSchema = z.enum(["runtime", "development", "staging", "production"]);
const renderModeSchema = z.enum(["parity", "v2"]);
const authScopeSchema = z.enum(["anonymous", "application", "user"]);
const exposureTierSchema = z.enum(["public-frankfurt", "lan"]);
const workloadKindSchema = z.enum(["deployment", "statefulset", "job", "cronjob", "external_service", "host_native", "nomad_job"]);

export const imageModelSchema = z.object({
  repository: z.string().min(1),
  tag: z.string().min(1),
  ref: z.string().min(1),
  pullPolicy: z.enum(["Always", "IfNotPresent", "Never"]).optional(),
  pullSecrets: z.array(z.string()).default([]),
  updateEligible: z.boolean().default(true),
});

export const portModelSchema = z.object({
  name: z.string().min(1),
  containerPort: z.number().int().min(1).max(65535),
  servicePort: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["TCP", "UDP"]).optional(),
});

export const volumeMountModelSchema = z.object({
  volume: z.string().min(1),
  path: z.string().min(1),
  readOnly: z.boolean().optional(),
});

export const probeModelSchema = z.object({
  startup: kubernetesObjectSchema.optional(),
  readiness: kubernetesObjectSchema.optional(),
  liveness: kubernetesObjectSchema.optional(),
  importedHealth: z.object({
    type: z.enum(["http", "tcp"]),
    path: z.string().optional(),
    port: z.string(),
    expectedStatus: z.number().optional(),
    responseTimeMs: z.number().optional(),
  }).optional(),
});

export const containerModelSchema = z.object({
  name: z.string().min(1),
  image: imageModelSchema.optional(),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  ports: z.array(portModelSchema).default([]),
  env: stringRecordSchema.default({}),
  envFromSecrets: z.array(z.object({ name: z.string(), optional: z.boolean().optional() })).default([]),
  resources: z.object({
    requests: z.object({ cpu: z.string().optional(), memory: z.string().optional() }).optional(),
    limits: z.object({ cpu: z.string().optional(), memory: z.string().optional() }).optional(),
  }).optional(),
  volumeMounts: z.array(volumeMountModelSchema).default([]),
  probes: probeModelSchema.optional(),
});

export const serviceModelSchema = z.object({
  name: z.string(),
  annotations: stringRecordSchema.default({}),
  ports: z.array(portModelSchema).default([]),
});

export const configModelSchema = z.object({
  values: stringRecordSchema.default({}),
  files: stringRecordSchema.default({}),
});

export const secretEnvModelSchema = z.object({
  name: z.string(),
  destinationSecretName: z.string(),
  envKeys: z.array(z.string()).default([]),
});

export const credentialBindingModelSchema = z.object({
  name: z.string(),
  claim: z.string(),
  provider: z.enum(["vault-kv", "postgres", "mariadb", "rabbitmq", "external"]).default("external"),
  destinationSecretName: z.string(),
  namespace: z.string(),
  rotation: z.object({
    refreshAfter: z.string().optional(),
    renewalPercent: z.number().optional(),
  }).optional(),
});

export const storageModelSchema = z.object({
  volumes: z.array(z.object({
    name: z.string(),
    kind: z.enum(["persistent", "host_path", "empty_dir", "config_map", "secret"]),
    size: z.string().optional(),
    accessModes: z.array(z.string()).optional(),
    storageClassName: z.string().optional(),
    tier: z.string().optional(),
    hostPath: z.string().optional(),
    statefulTemplate: z.boolean().optional(),
  })).default([]),
  mounts: z.array(volumeMountModelSchema).default([]),
  tiers: z.record(z.object({ storageClassName: z.string() })).default({}),
});

export const placementModelSchema = z.object({
  nodeName: z.string().optional(),
  site: z.string().optional(),
  nodeSelector: stringRecordSchema.default({}),
  requiredCapabilities: z.array(z.string()).default([]),
  tolerations: z.array(kubernetesObjectSchema).default([]),
  topologySpread: z.array(z.string()).default([]),
});

export const autoscalingModelSchema = z.object({
  minReplicas: z.number().int().min(0).optional(),
  maxReplicas: z.number().int().min(1),
  targetCpuUtilization: z.number().int().min(1).max(100).optional(),
  targetMemoryUtilization: z.number().int().min(1).max(100).optional(),
  keda: z.object({ triggers: z.array(kubernetesObjectSchema) }).optional(),
});

export const workloadObservabilityModelSchema = z.object({
  status: z.array(z.object({
    name: z.string(),
    group: z.string(),
    url: z.string(),
    type: z.enum(["http", "tcp"]),
    interval: z.string().optional(),
    conditions: z.array(z.string()).default([]),
    strategy: z.enum(["internal", "external", "both"]).optional(),
  })).default([]),
  metrics: z.array(z.object({
    kind: z.enum(["ServiceMonitor", "PodMonitor"]),
    port: z.string(),
    path: z.string().optional(),
    interval: z.string().optional(),
  })).default([]),
});

export const hookModelSchema = z.object({
  pre: z.array(z.object({
    name: z.string(),
    image: imageModelSchema.optional(),
    command: z.array(z.string()).optional(),
    args: z.array(z.string()).optional(),
    env: stringRecordSchema.default({}),
  })).default([]),
});

export const rolloutModelSchema = z.object({
  strategy: z.string().optional(),
  pdbMinAvailable: z.union([z.number(), z.string()]).optional(),
  maxUnavailable: z.union([z.number(), z.string()]).optional(),
});

export const workloadModelSchema = z.object({
  name: z.string(),
  deploymentName: z.string(),
  group: z.string(),
  namespace: z.string(),
  kind: workloadKindSchema,
  replicas: z.number().int().min(0).optional(),
  schedule: z.string().optional(),
  restartPolicy: z.string().optional(),
  serviceAccountName: z.string().optional(),
  image: imageModelSchema,
  containers: z.array(containerModelSchema),
  initContainers: z.array(containerModelSchema),
  sidecars: z.array(containerModelSchema),
  service: serviceModelSchema.optional(),
  config: configModelSchema,
  secrets: z.array(secretEnvModelSchema),
  credentials: z.array(credentialBindingModelSchema),
  storage: storageModelSchema,
  placement: placementModelSchema,
  autoscaling: autoscalingModelSchema.optional(),
  probes: probeModelSchema,
  observability: workloadObservabilityModelSchema,
  hooks: hookModelSchema,
  rollout: rolloutModelSchema,
  rawManifests: z.array(kubernetesObjectSchema),
  importedParity: z.object({
    workloadFileName: z.string().optional(),
    kedaObjects: z.array(kubernetesObjectSchema).optional(),
    networkPolicies: z.array(kubernetesObjectSchema).optional(),
  }).optional(),
});

export const routeRuleModelSchema = z.object({
  path: z.string().min(1),
  operation: z.enum(["prefix", "exact", "regexp"]),
  port: z.string(),
  priority: z.number().optional(),
  middleware: z.array(z.string()),
});

export const routeModelSchema = z.object({
  name: z.string(),
  serviceName: z.string(),
  host: z.string(),
  tier: exposureTierSchema,
  authScope: authScopeSchema,
  rules: z.array(routeRuleModelSchema),
});

export const providerExportModelSchema = z.object({
  name: z.string(),
  type: z.enum(["database", "messaging", "kv", "external"]),
  namespace: z.string().optional(),
  endpoint: z.object({ service: z.string(), port: z.union([z.number(), z.string()]) }).optional(),
  grants: z.record(z.unknown()).optional(),
});

export const vaultModelSchema = z.object({
  namespace: z.string(),
  basePath: z.string(),
  address: z.string().optional(),
  connectionName: z.string(),
  authName: z.string(),
  authMount: z.string(),
  authRole: z.string(),
  operatorServiceAccount: z.string(),
  kvMount: z.string(),
  staticSyncs: z.record(z.object({
    target: z.object({ name: z.string(), namespace: z.string() }),
    mount: z.string(),
    path: z.string(),
    refreshAfter: z.string().optional(),
    rolloutRestartTargets: z.array(z.object({ kind: z.string(), name: z.string() })),
  })),
  dynamicSyncs: z.record(z.object({
    target: z.object({ name: z.string(), namespace: z.string() }),
    engine: z.string(),
    role: z.string(),
    renewalPercent: z.number().optional(),
  })),
});

export const projectModelSchema = z.object({
  apiVersion: z.literal("deployment.jorisjonkers.dev/ir/v1"),
  environment: deploymentEnvironmentSchema,
  renderMode: renderModeSchema,
  cluster: z.object({
    name: z.string(),
    publicDomain: z.string(),
    gitopsRoot: z.string(),
    appsRoot: z.string(),
    clusterRoot: z.string(),
    fluxEnvironment: z.string(),
    interval: z.string(),
  }),
  sources: z.object({
    environments: z.array(deploymentEnvironmentSchema),
    firstParty: z.record(z.object({ bundle: z.string(), repo: z.string().optional(), policy: z.enum(["locked", "release"]).optional() })),
    collections: z.record(z.object({ repo: z.string(), ref: z.string(), sha: z.string().optional(), paths: z.array(z.string()) })),
    hosts: z.object({ repo: z.string(), ref: z.string(), sha: z.string().optional(), paths: z.array(z.string()).optional() }).optional(),
    platformBlueprints: z.object({ repo: z.string(), ref: z.string(), sha: z.string().optional(), paths: z.array(z.string()).optional() }).optional(),
    policies: z.record(z.unknown()),
  }),
  lock: z.any(),
  nodeContract: z.any(),
  reachability: z.any(),
  collections: z.record(z.any()),
  deployments: z.record(z.any()),
  workloads: z.record(workloadModelSchema),
  routes: z.array(routeModelSchema),
  providerGraph: z.object({
    data: z.record(providerExportModelSchema),
    messaging: z.record(providerExportModelSchema),
    credentials: z.array(credentialBindingModelSchema),
    vault: vaultModelSchema,
  }),
  flux: z.any(),
  parityImports: z.any().optional(),
  adapterArtifacts: z.any(),
});

export const ProjectModel = projectModelSchema;
export const WorkloadModel = workloadModelSchema;
export const RouteModel = routeModelSchema;
export const ProviderGraphModel = z.object({
  data: z.record(providerExportModelSchema),
  messaging: z.record(providerExportModelSchema),
  credentials: z.array(credentialBindingModelSchema),
  vault: vaultModelSchema,
});
export const VaultModel = vaultModelSchema;
export const FluxModel = z.any();
export const NodeContractModel = z.any();
export const ReachabilityModel = z.any();
export const CollectionModel = z.any();
export const DeploymentSourcesModel = z.any();
export const DeploymentLockModel = z.any();

export function buildProjectModel(input: CompilerInputSet): ProjectModel {
  const sources = normalizeSources(input.sources);
  const lock = normalizeLock(input.lock);
  const nodeContract = input.nodeContract;
  const reachability = input.reachability;
  const deployments: Record<string, DeploymentModel> = {};
  const collections: Record<string, CollectionModel> = {};
  const workloads: Record<string, WorkloadModel> = {};
  const routes: RouteModel[] = [];
  const providerExports: Record<string, ProviderExportModel> = {};

  for (const collectionDocument of input.collections) {
    const collection = collectionDocument as Record<string, any>;
    const collectionName = String(collection.metadata?.name ?? "collection");
    const deploymentNames: string[] = [];
    for (const [name, value] of Object.entries(collection.spec?.providerExports ?? {})) {
      providerExports[`${collectionName}.${name}`] = normalizeProviderExport(name, value);
    }
    for (const deployment of collection.spec?.deployments ?? []) {
      const built = addDeployment(deployment, {
        sourceName: collectionName,
        sourceKind: "collection",
        deployments,
        workloads,
        routes,
      });
      deploymentNames.push(built.name);
    }
    collections[collectionName] = {
      name: collectionName,
      domain: collection.metadata?.domain,
      deploymentNames,
      providerExports: Object.fromEntries(Object.entries(collection.spec?.providerExports ?? {}).map(([name, value]) => [name, normalizeProviderExport(name, value)])),
    };
  }

  for (const deployment of input.deployments) {
    addDeployment(deployment, {
      sourceName: String((deployment as any).metadata?.name ?? "deployment"),
      sourceKind: sources.firstParty[(deployment as any).metadata?.name] ? "firstParty" : "imported",
      deployments,
      workloads,
      routes,
    });
  }

  const credentials = Object.values(workloads).flatMap((workload) => workload.credentials);
  const providerGraph: ProviderGraphModel = {
    data: providerExports,
    messaging: {},
    credentials,
    vault: {
      namespace: "vso-secrets",
      basePath: "apps/vso-secrets",
      connectionName: "vault",
      authName: "vault-auth",
      authMount: "kubernetes",
      authRole: "vso",
      operatorServiceAccount: "vault-secrets-operator",
      kvMount: "kv",
      staticSyncs: Object.fromEntries(Object.values(workloads).flatMap((workload) => workload.secrets.map((secret) => [secret.name, {
        target: { name: secret.destinationSecretName, namespace: workload.namespace },
        mount: "kv",
        path: `${workload.namespace}/${workload.name}/${secret.name}`,
        rolloutRestartTargets: [{ kind: "Deployment", name: workload.name }],
      }]))),
      dynamicSyncs: {},
    },
  };

  const cluster = clusterFromEnv(input.envFiles, reachability);
  const adapterArtifacts = adapterArtifactsFor({
    cluster,
    workloads,
    routes,
    nodeContract,
    providerGraph,
  });

  const model: ProjectModel = {
    apiVersion: "deployment.jorisjonkers.dev/ir/v1",
    environment: input.environment,
    renderMode: "parity",
    cluster,
    sources,
    lock,
    nodeContract,
    reachability,
    collections,
    deployments,
    workloads,
    routes,
    providerGraph,
    flux: {
      source: {
        url: "ssh://git@github.com/JorisJonkers-dev/homelab-deploy.git",
        branch: "main",
        secretRefName: "flux-system",
      },
      root: {
        namespace: "flux-system",
        name: "flux-system",
        path: "./clusters/production",
      },
      layers: [],
      packs: {},
    },
    adapterArtifacts,
  };

  const parsed = projectModelSchema.parse(model) as ProjectModel;
  const diagnostics = validateProjectModel(parsed);
  if (diagnostics.length > 0) {
    const error = new Error(`ProjectModel validation failed: ${diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.path}`).join(", ")}`);
    Object.assign(error, { diagnostics });
    throw error;
  }
  return parsed;
}

export function projectModelToAdapterContext(model: ProjectModel): AdapterContext {
  return {
    artifacts: model.adapterArtifacts,
    pathAllocator: {
      appsRoot: model.cluster.appsRoot,
      clusterRoot: model.cluster.clusterRoot,
    },
    diagnostics: validateProjectModel(model),
  };
}

export function validateProjectModel(model: ProjectModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const workloadNames = new Set<string>();
  const lockedImages = new Set([
    ...Object.values(model.lock.inputs.firstParty).flatMap((entry) => entry.images),
    ...Object.values(model.lock.inputs.images),
  ]);
  const providers = new Set([
    ...Object.keys(model.providerGraph.data),
    ...Object.values(model.collections).flatMap((collection) => Object.keys(collection.providerExports).map((name) => `${collection.name}.${name}`)),
  ]);

  for (const [name, workload] of Object.entries(model.workloads)) {
    if (workloadNames.has(workload.name)) {
      diagnostic(diagnostics, "E_WORKLOAD_DUPLICATE", pointer("workloads", name), `workload ${workload.name} is defined more than once`);
    }
    workloadNames.add(workload.name);

    if (!lockedImages.has(workload.image.ref)) {
      diagnostic(diagnostics, "E_IMAGE_LOCK_MISSING", pointer("workloads", name, "image"), `workload ${name} image ${workload.image.ref} is not present in deployment.lock.yml`);
    }

    for (const credential of workload.credentials) {
      const claimCollection = credential.claim.split(".")[0];
      if (!providers.has(credential.claim) && !model.collections[claimCollection] && !credential.claim.startsWith("external.")) {
        diagnostic(diagnostics, "E_CREDENTIAL_CLAIM_UNKNOWN", pointer("workloads", name, "credentials", credential.name), `credential ${credential.name} references unknown claim ${credential.claim}`);
      }
    }

    if (!placementSatisfiable(workload.placement, model.nodeContract)) {
      diagnostic(diagnostics, "E_PLACEMENT_UNSATISFIABLE", pointer("workloads", name, "placement"), `workload ${name} placement cannot match any active schedulable node`);
    }
  }

  for (const [index, route] of model.routes.entries()) {
    if (!["anonymous", "application", "user"].includes(route.authScope)) {
      diagnostic(diagnostics, "E_ROUTE_AUTH_SCOPE_INVALID", pointer("routes", index, "authScope"), `route ${route.name} has invalid auth scope ${route.authScope}`);
    }
    const workload = model.workloads[route.serviceName];
    const ports = new Set(workload?.service?.ports.map((port) => port.name) ?? []);
    for (const [ruleIndex, rule] of route.rules.entries()) {
      if (!ports.has(rule.port)) {
        diagnostic(diagnostics, "E_ROUTE_PORT_UNKNOWN", pointer("routes", index, "rules", ruleIndex, "port"), `route ${route.name} references unknown port ${rule.port}`);
      }
    }
  }

  rejectSecretMaterial(model, diagnostics);
  return diagnostics.sort(compareDiagnostics);
}

function addDeployment(document: unknown, options: {
  sourceName: string;
  sourceKind: "firstParty" | "collection" | "imported";
  deployments: Record<string, DeploymentModel>;
  workloads: Record<string, WorkloadModel>;
  routes: RouteModel[];
}): DeploymentModel {
  const deployment = document as Record<string, any>;
  const name = String(deployment.metadata?.name);
  const workloadNames: string[] = [];
  for (const [workloadName, workloadInput] of Object.entries(deployment.spec?.workloads ?? {})) {
    if (options.workloads[workloadName]) {
      const duplicate = options.workloads[workloadName];
      options.workloads[`${workloadName}__duplicate__${name}`] = { ...duplicate, deploymentName: name };
      continue;
    }
    const workload = normalizeWorkload(workloadName, name, workloadInput);
    options.workloads[workloadName] = workload;
    workloadNames.push(workloadName);
    for (const routeInput of (workloadInput as any).routes ?? []) {
      options.routes.push(normalizeRoute(workloadName, routeInput, options.routes.length));
    }
  }
  const model = {
    name,
    sourceName: options.sourceName,
    sourceKind: options.sourceKind,
    labels: deployment.metadata?.labels ?? {},
    workloadNames,
  };
  options.deployments[name] = model;
  return model;
}

function normalizeWorkload(name: string, deploymentName: string, input: unknown): WorkloadModel {
  const value = input as Record<string, any>;
  const image = parseImage(value.image);
  const ports = (value.ports ?? value.containers?.[0]?.ports ?? []).map(normalizePort);
  const containers = (value.containers ?? [{ name, ports }]).map((container: any) => ({
    name: container.name,
    image: container.image ? parseImage(container.image) : undefined,
    command: container.command ?? value.command,
    args: container.args ?? value.args,
    ports: (container.ports ?? []).map(normalizePort),
    env: container.env ?? value.env ?? {},
    envFromSecrets: container.envFromSecrets ?? [],
    resources: container.resources,
    volumeMounts: container.volumeMounts ?? [],
  }));

  return workloadModelSchema.parse({
    name,
    deploymentName,
    group: value.group ?? "stateless",
    namespace: value.namespace ?? value.group ?? "default",
    kind: value.kind ?? "deployment",
    replicas: value.replicas,
    schedule: value.schedule,
    restartPolicy: value.restartPolicy,
    serviceAccountName: value.serviceAccountName ?? value.account,
    image,
    containers,
    initContainers: (value.initContainers ?? []).map((container: any) => ({ ...container, image: container.image ? parseImage(container.image) : undefined })),
    sidecars: (value.sidecars ?? []).map((container: any) => ({ ...container, image: container.image ? parseImage(container.image) : undefined })),
    service: ports.length > 0 ? { name, annotations: value.serviceAnnotations ?? {}, ports } : undefined,
    config: { values: value.config?.values ?? value.env ?? {}, files: value.config?.files ?? {} },
    secrets: value.secrets ?? [],
    credentials: (value.credentials ?? []).map((credential: any) => ({
      name: credential.name,
      claim: credential.claim,
      provider: credential.provider ?? providerFromClaim(credential.claim),
      destinationSecretName: credential.destinationSecretName ?? credential.destinationSecret ?? `${name}-${credential.name}`,
      namespace: credential.namespace ?? value.namespace ?? value.group ?? "default",
      rotation: credential.rotation,
    })),
    storage: {
      volumes: value.storage?.volumes ?? [],
      mounts: value.storage?.mounts ?? [],
      tiers: value.storage?.tiers ?? {},
    },
    placement: {
      nodeName: value.placement?.nodeName,
      site: value.placement?.site,
      nodeSelector: value.placement?.nodeSelector ?? {},
      requiredCapabilities: value.placement?.requiredCapabilities ?? [],
      tolerations: value.placement?.tolerations ?? [],
      topologySpread: value.placement?.topologySpread ?? [],
    },
    autoscaling: value.autoscaling,
    probes: value.probes ?? {},
    observability: {
      status: (value.observability?.status ?? []).map((endpoint: any) => ({
        group: endpoint.group ?? value.group ?? "stateless",
        type: endpoint.type ?? "http",
        conditions: endpoint.conditions ?? ["[STATUS] == 200"],
        ...endpoint,
      })),
      metrics: (value.observability?.metrics ?? []).map((monitor: any) => ({ kind: monitor.kind ?? "ServiceMonitor", ...monitor })),
    },
    hooks: {
      pre: (value.hooks?.pre ?? []).map((hook: any) => typeof hook === "string" ? { name: hook, env: {} } : { env: {}, ...hook, image: hook.image ? parseImage(hook.image) : undefined }),
    },
    rollout: {
      strategy: value.rollout?.strategy,
      pdbMinAvailable: value.rollout?.pdbMinAvailable,
      maxUnavailable: value.rollout?.maxUnavailable,
    },
    rawManifests: value.rawManifests ?? [],
  });
}

function normalizeRoute(workloadName: string, input: any, index: number): RouteModel {
  return routeModelSchema.parse({
    name: input.name ?? `${workloadName}-${index}`,
    serviceName: workloadName,
    host: input.host,
    tier: input.expose.tier,
    authScope: input.auth.scope,
    rules: input.rules.map((rule: any) => ({
      path: rule.path,
      operation: rule.operation ?? "prefix",
      port: rule.port,
      priority: rule.priority,
      middleware: rule.middleware ?? [],
    })),
  });
}

function normalizePort(port: any): PortModel {
  return {
    name: port.name,
    containerPort: port.containerPort,
    servicePort: port.servicePort,
    protocol: port.protocol ?? "TCP",
  };
}

function parseImage(ref: string): ImageModel {
  const digestIndex = ref.indexOf("@sha256:");
  if (digestIndex > -1) {
    return {
      repository: ref.slice(0, digestIndex),
      tag: ref.slice(digestIndex + 1),
      ref,
      pullSecrets: [],
      updateEligible: false,
    };
  }
  const index = ref.lastIndexOf(":");
  return {
    repository: index > -1 ? ref.slice(0, index) : ref,
    tag: index > -1 ? ref.slice(index + 1) : "latest",
    ref,
    pullSecrets: [],
    updateEligible: true,
  };
}

function providerFromClaim(claim: string): CredentialBindingModel["provider"] {
  if (claim.includes("postgres")) return "postgres";
  if (claim.includes("mariadb")) return "mariadb";
  if (claim.includes("rabbitmq")) return "rabbitmq";
  if (claim.includes("vault")) return "vault-kv";
  return "external";
}

function normalizeProviderExport(name: string, input: unknown): ProviderExportModel {
  const value = input as Record<string, any>;
  return providerExportModelSchema.parse({
    name: value.name ?? name,
    type: value.type ?? "external",
    namespace: value.namespace,
    endpoint: value.endpoint,
    grants: value.grants,
  });
}

function normalizeSources(input: any): DeploymentSourcesModel {
  const spec = input.spec ?? input;
  return {
    environments: spec.environments ?? ["production"],
    firstParty: spec.firstParty ?? {},
    collections: spec.collections ?? {},
    hosts: spec.hosts,
    platformBlueprints: spec.platformBlueprints,
    policies: spec.policies ?? {},
  };
}

function normalizeLock(input: any): DeploymentLockModel {
  const value = input.inputs ? input : { metadata: input.metadata ?? { generatedAt: "1970-01-01T00:00:00.000Z" }, inputs: input };
  return {
    metadata: value.metadata,
    inputs: {
      firstParty: value.inputs?.firstParty ?? {},
      collections: value.inputs?.collections ?? {},
      homelabHosts: value.inputs?.homelabHosts,
      platformBlueprints: value.inputs?.platformBlueprints,
      charts: value.inputs?.charts ?? {},
      images: value.inputs?.images ?? {},
    },
  };
}

function clusterFromEnv(envFiles: Record<string, unknown>, reachability: ReachabilityModel): ClusterModel {
  const cluster = ((envFiles.cluster ?? {}) as Record<string, any>);
  const firstPublicHost = reachability.channels["public-frankfurt"]?.hosts?.[0] ?? "example.com";
  return {
    name: cluster.name ?? "homelab",
    publicDomain: cluster.publicDomain ?? firstPublicHost.split(".").slice(-2).join("."),
    gitopsRoot: cluster.gitopsRoot ?? "cluster/flux",
    appsRoot: cluster.appsRoot ?? "apps",
    clusterRoot: cluster.clusterRoot ?? "clusters/production",
    fluxEnvironment: cluster.fluxEnvironment ?? "production",
    interval: cluster.interval ?? "10m",
  };
}

function adapterArtifactsFor(input: {
  cluster: ClusterModel;
  workloads: Record<string, WorkloadModel>;
  routes: RouteModel[];
  nodeContract: NodeContractModel;
  providerGraph: ProviderGraphModel;
}): AdapterArtifactsModel {
  const kubernetesGroups = Object.values(input.workloads).reduce<Record<string, string[]>>((groups, workload) => {
    groups[workload.group] ??= [];
    groups[workload.group].push(workload.name);
    return groups;
  }, {});
  for (const names of Object.values(kubernetesGroups)) names.sort();

  const backends = Object.fromEntries(Object.values(input.workloads).filter((workload) => workload.service).map((workload) => [workload.name, {
    service: workload.service?.name ?? workload.name,
    namespace: workload.namespace,
    port: workload.service?.ports[0]?.servicePort ?? workload.service?.ports[0]?.containerPort ?? 80,
    health: workload.probes.importedHealth ? {
      type: workload.probes.importedHealth.type,
      path: workload.probes.importedHealth.path,
      port: Number(workload.probes.importedHealth.port),
      expected_status: workload.probes.importedHealth.expectedStatus,
      response_time_ms: workload.probes.importedHealth.responseTimeMs,
    } : undefined,
  }]));

  return {
    "deploy-config": {
      cluster: {
        name: input.cluster.name,
        public_domain: input.cluster.publicDomain,
      },
      sites: Object.fromEntries([...new Set(Object.values(input.nodeContract.nodes).map((node) => node.site))].sort().map((site) => [site, { purpose: "deployment" }])),
      service_intent: { kubernetes: kubernetesGroups },
      exposure_intent: {
        public: input.routes.filter((route) => route.tier === "public-frankfurt").map((route) => route.serviceName).sort(),
        public_and_lan: [],
        internal_only: [],
        lan_only: input.routes.filter((route) => route.tier === "lan").map((route) => route.serviceName).sort(),
      },
      access_intent: {
        sso_protected: input.routes.filter((route) => route.authScope !== "anonymous").map((route) => route.serviceName).sort(),
        host_labels: Object.fromEntries(input.routes.map((route) => [route.serviceName, route.host])),
        root_redirect: {},
      },
      ingress_intent: {
        defaults: {
          namespace: "edge",
          public_ingress_class: "traefik-public",
          lan_ingress_class: "traefik-lan",
          entrypoint: "websecure",
          tls: true,
          sso_middleware: "forward-auth",
        },
        route_rules: input.routes.map((route) => ({
          name: route.name,
          service: route.serviceName,
          host_label: route.host,
          access: route.authScope === "anonymous" ? "direct" : "sso_protected",
          path_prefixes: route.rules.filter((rule) => rule.operation === "prefix").map((rule) => rule.path),
          exact_paths: route.rules.filter((rule) => rule.operation === "exact").map((rule) => rule.path),
        })),
        kubernetes_backends: backends,
        wan_origin_overrides: {},
      },
      monitoring_intent: { kubernetes_backends: backends },
      image_metadata: {
        workloads: Object.fromEntries(Object.values(input.workloads).map((workload) => [workload.name, {
          repository: workload.image.repository,
          tag: workload.image.tag,
          pull_policy: workload.image.pullPolicy,
          update: { eligible: workload.image.updateEligible, strategy: "semver" },
        }])),
      },
      adapter_output_intent: {
        adapters: [],
        namespaces: Object.fromEntries(Object.values(input.workloads).map((workload) => [workload.name, workload.namespace])),
      },
      gitops: {
        root: input.cluster.gitopsRoot,
        environment: input.cluster.fluxEnvironment,
      },
    },
    "service-intent": {
      renderer: { cluster_name: input.cluster.name },
      services: Object.fromEntries(Object.values(input.workloads).map((workload) => [workload.name, {
        workload: {
          kind: workload.kind,
          replicas: workload.replicas,
          schedule: workload.schedule,
          restart_policy: workload.restartPolicy,
          strategy: workload.rollout.strategy,
        },
        image: {
          repository: workload.image.repository,
          tag: workload.image.tag,
          pull_policy: workload.image.pullPolicy,
          pull_secrets: workload.image.pullSecrets,
        },
        ports: workload.service?.ports.map((port) => ({
          name: port.name,
          container_port: port.containerPort,
          service_port: port.servicePort,
          protocol: port.protocol,
        })),
        runtime: {
          args: workload.containers[0]?.args,
          env: workload.config.values,
          files: workload.config.files,
          init_containers: [],
          sidecars: [],
        },
        secrets: workload.secrets.map((secret) => ({ name: secret.name, env_keys: secret.envKeys })),
        storage: {
          volumes: workload.storage.volumes.map((volume) => ({
            name: volume.name,
            kind: volume.kind,
            size: volume.size,
            access_modes: volume.accessModes,
            claim_template: volume.statefulTemplate,
            path: volume.hostPath,
            storage_class: volume.storageClassName,
          })),
          mounts: workload.storage.mounts.map((mount) => ({ volume: mount.volume, path: mount.path, read_only: mount.readOnly })),
        },
        networking: {
          service_annotations: workload.service?.annotations,
          routes: input.routes.filter((route) => route.serviceName === workload.name).map((route) => ({ name: route.name, port: route.rules[0]?.port })),
        },
        gatus: {
          endpoints: workload.observability.status.map((endpoint) => ({ name: endpoint.name, type: endpoint.type, port: endpoint.url, path: endpoint.url })),
        },
        observability: { metrics: workload.observability.metrics },
        scheduling: {
          node_affinity: workload.placement.nodeName,
          site_affinity: workload.placement.site,
          required_capabilities: workload.placement.requiredCapabilities,
          topology_spread: workload.placement.topologySpread,
        },
        rollout: {
          autoscaling: workload.autoscaling ? {
            enabled: true,
            min_replicas: workload.autoscaling.minReplicas,
            max_replicas: workload.autoscaling.maxReplicas,
            target_cpu_utilization: workload.autoscaling.targetCpuUtilization,
            target_memory_utilization: workload.autoscaling.targetMemoryUtilization,
          } : undefined,
        },
        kubernetes: {
          namespace_ref: workload.namespace,
          service_ref: workload.service?.name,
          service_account_ref: workload.serviceAccountName,
          raw_manifests: workload.rawManifests as any,
        },
      }])),
    },
    "fleet-inventory": {
      fleet: {
        cluster: { name: input.cluster.name, domain: input.cluster.publicDomain },
        nodes: Object.fromEntries(Object.entries(input.nodeContract.nodes).map(([name, node]) => [name, {
          site: node.site,
          arch: node.arch,
          capabilities: Object.entries(node.labels).filter(([key, value]) => key.startsWith("platform.jorisjonkers.dev/capability-") && value === "true").map(([key]) => key.replace("platform.jorisjonkers.dev/capability-", "")),
        }])),
      },
    },
    "vault-dynamic-secrets": {
      vault: {
        auth: { kubernetes: { mount: input.providerGraph.vault.authMount } },
        kv: { mount: input.providerGraph.vault.kvMount, paths: {} },
        vso: { auth_role: input.providerGraph.vault.authRole },
        service_consumers: {},
      },
    },
    platform: {
      name: input.cluster.name,
      domain: input.cluster.publicDomain,
      gitops: {
        root: input.cluster.gitopsRoot,
        environment: input.cluster.fluxEnvironment,
        interval: input.cluster.interval,
      },
      nodes: Object.fromEntries(Object.entries(input.nodeContract.nodes).map(([name, node]) => [name, { labels: node.labels }])),
      packs: {},
    },
  };
}

function placementSatisfiable(placement: PlacementModel, nodeContract: NodeContractModel): boolean {
  return Object.entries(nodeContract.nodes).some(([name, node]) => {
    if (node.status !== "active" || !node.schedulable) return false;
    if (placement.nodeName && placement.nodeName !== name) return false;
    if (placement.site && placement.site !== node.site) return false;
    for (const [key, value] of Object.entries(placement.nodeSelector)) {
      if (node.labels[key] !== value) return false;
    }
    for (const capability of placement.requiredCapabilities) {
      if (node.labels[`platform.jorisjonkers.dev/capability-${capability}`] !== "true") return false;
    }
    return true;
  });
}

function rejectSecretMaterial(model: ProjectModel, diagnostics: Diagnostic[]): void {
  for (const [workloadName, workload] of Object.entries(model.workloads)) {
    for (const [key, value] of Object.entries(workload.config.values)) {
      if (looksSecret(key) || looksSecret(value)) {
        diagnostic(diagnostics, "E_SECRET_MATERIAL_INLINE", pointer("workloads", workloadName, "config", "values", key), `workload ${workloadName} appears to contain inline secret material`);
      }
    }
    for (const container of workload.containers) {
      for (const [key, value] of Object.entries(container.env)) {
        if (looksSecret(key) || looksSecret(value)) {
          diagnostic(diagnostics, "E_SECRET_MATERIAL_INLINE", pointer("workloads", workloadName, "containers", container.name, "env", key), `workload ${workloadName} appears to contain inline secret material`);
        }
      }
    }
  }
}

function looksSecret(value: string): boolean {
  return /password|passwd|secret|token|api[_-]?key/i.test(value);
}

function diagnostic(diagnostics: Diagnostic[], code: string, path: string, message: string): void {
  diagnostics.push({ code, path, message });
}

function pointer(...segments: Array<string | number>): string {
  return `/${segments.map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);
}
