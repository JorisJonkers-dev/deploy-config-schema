import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import YAML from "yaml";
import {
  buildProjectModel,
  type DeploymentEnvironment,
  type FluxLayerModel,
  type KubernetesObject,
  type NodeContractModel,
  type ProjectModel,
  type ReachabilityModel,
  type RenderFile,
} from "../model.js";

type RecordAny = Record<string, any>;

export type ImportFleetV1Options = {
  fleetPath: string;
  fluxTreePath: string;
  outDir?: string;
  deploymentName?: string;
  generatedAt?: string;
  sourceSha?: string;
  environments?: DeploymentEnvironment[];
};

export type ImportFleetV1Result = {
  model: ProjectModel;
  files: RenderFile[];
  documents: {
    deployment: RecordAny;
    sources: RecordAny;
    lock: RecordAny;
    nodeContract: NodeContractModel;
    reachability: ReachabilityModel;
    envFiles: Record<string, RecordAny>;
  };
  imported: {
    networkPolicies: KubernetesObject[];
    extraObjects: KubernetesObject[];
  };
};

type FluxIndex = {
  objects: KubernetesObject[];
  byKind: Map<string, KubernetesObject[]>;
  layers: FluxLayerModel[];
};

const ENVIRONMENTS: DeploymentEnvironment[] = ["runtime", "development", "staging", "production"];
const DEFAULT_SHA = "0000000000000000000000000000000000000000";
const DEFAULT_IMAGE = "ghcr.io/jorisjonkers-dev/import-placeholder:latest";

export function importFleetV1(options: ImportFleetV1Options): ImportFleetV1Result {
  const fleet = readYaml(options.fleetPath) as RecordAny;
  const flux = indexFluxTree(options.fluxTreePath);
  const environments = options.environments ?? ENVIRONMENTS;
  const serviceNames = importedServiceNames(fleet, flux);
  const deployment = {
    apiVersion: "deployment.jorisjonkers.dev/v2",
    kind: "Deployment",
    metadata: {
      name: options.deploymentName ?? "imported-fleet",
      labels: { "deployment.jorisjonkers.dev/imported-from": "fleet-v1" },
    },
    spec: {
      workloads: Object.fromEntries(serviceNames.map((serviceName) => [serviceName, workloadFor(serviceName, fleet, flux)])),
    },
  };
  const sources = {
    apiVersion: "deployment.jorisjonkers.dev/sources/v1",
    kind: "DeploymentSources",
    spec: { environments, firstParty: {}, collections: {}, policies: { importedFrom: "fleet-v1" } },
  };
  const lock = {
    apiVersion: "deployment.jorisjonkers.dev/lock/v1",
    kind: "DeploymentLock",
    metadata: { generatedAt: options.generatedAt ?? "1970-01-01T00:00:00.000Z" },
    inputs: {
      firstParty: {},
      collections: {},
      charts: {},
      images: Object.fromEntries(Object.entries(deployment.spec.workloads).map(([name, workload]) => [name, (workload as RecordAny).image]).sort()),
    },
  };
  const nodeContract = nodeContractFor(fleet, options.sourceSha ?? DEFAULT_SHA);
  const reachability = reachabilityFor(fleet);
  const envFiles = Object.fromEntries(environments.map((environment) => [environment, envFile(environment)]));
  const files = filesFor({ deployment, sources, lock, nodeContract, reachability, envFiles });

  if (options.outDir) writeFiles(options.outDir, files);

  const model = buildProjectModel({
    environment: "production",
    sources: sources.spec,
    lock,
    nodeContract,
    reachability,
    deployments: [deployment],
    collections: [],
    envFiles: { cluster: clusterEnv(fleet) },
  });
  const networkPolicies = kind(flux, "NetworkPolicy").sort(compareObjects);
  const extraObjects = [...kind(flux, "ServiceMonitor"), ...kind(flux, "PodMonitor"), ...kind(flux, "HorizontalPodAutoscaler"), ...kind(flux, "ScaledObject")].sort(compareObjects);
  model.flux.layers = flux.layers;
  model.parityImports = {
    networkPolicies,
    extraObjects,
    existingFiles: existingFiles(options.fluxTreePath),
  };
  for (const workload of Object.values(model.workloads)) {
    const policies = networkPolicies.filter((policy) => meta(policy).namespace === workload.namespace);
    if (policies.length > 0) workload.importedParity = { networkPolicies: policies, workloadFileName: `${workload.kind}.yaml` };
  }

  return { model, files, documents: { deployment, sources, lock, nodeContract, reachability, envFiles }, imported: { networkPolicies, extraObjects } };
}

function workloadFor(serviceName: string, fleet: RecordAny, flux: FluxIndex): RecordAny {
  const controller = controllerFor(serviceName, flux);
  const service = named(kind(flux, "Service"), serviceName);
  const pod = podSpec(controller);
  const container = (pod.containers ?? [])[0] ?? {};
  const namespace = meta(controller).namespace ?? meta(service).namespace ?? fleet.ingress_intent?.kubernetes_backends?.[serviceName]?.namespace ?? groupFor(serviceName, fleet);
  const ports = portsFor(service, container);
  const config = configFor(serviceName, namespace, flux);
  const storage = storageFor(serviceName, namespace, pod, flux);
  return omitEmpty({
    group: groupFor(serviceName, fleet),
    namespace,
    kind: controllerKind(controller),
    replicas: controller?.kind === "Deployment" || controller?.kind === "StatefulSet" ? get(controller, "spec", "replicas") ?? 1 : undefined,
    serviceAccountName: pod.serviceAccountName,
    image: container.image ?? DEFAULT_IMAGE,
    pullPolicy: container.imagePullPolicy,
    containers: [{
      name: serviceName,
      image: container.image ?? DEFAULT_IMAGE,
      ports: (container.ports ?? []).map((port: RecordAny) => omitEmpty({ name: port.name, containerPort: port.containerPort, protocol: port.protocol })),
      env: {},
      envFromSecrets: [],
      volumeMounts: (container.volumeMounts ?? []).map((mount: RecordAny) => omitEmpty({ volume: mount.name, path: mount.mountPath, readOnly: mount.readOnly })),
    }],
    initContainers: [],
    sidecars: [],
    ports,
    config,
    secrets: secretsFor(serviceName, namespace, pod, flux),
    credentials: [],
    storage,
    autoscaling: autoscalingFor(serviceName, namespace, flux),
    observability: observabilityFor(serviceName, namespace, fleet, flux),
    routes: routesFor(serviceName, fleet, ports),
    rawManifests: [],
  });
}

function importedServiceNames(fleet: RecordAny, flux: FluxIndex): string[] {
  const names = new Set<string>();
  for (const group of Object.values(fleet.service_intent?.kubernetes ?? {}) as unknown[]) {
    if (Array.isArray(group)) for (const name of group) names.add(String(name));
  }
  if (names.size === 0) {
    for (const object of [...kind(flux, "Deployment"), ...kind(flux, "StatefulSet"), ...kind(flux, "Job"), ...kind(flux, "CronJob"), ...kind(flux, "Service")]) {
      if (meta(object).name) names.add(meta(object).name);
    }
  }
  return [...names].sort();
}

function indexFluxTree(root: string): FluxIndex {
  const objects = listFiles(root).filter((path) => /\.(json|ya?ml)$/i.test(path)).flatMap((path) => readYamlDocuments(path) as KubernetesObject[]);
  const byKind = new Map<string, KubernetesObject[]>();
  for (const object of objects) {
    byKind.set(String(object.kind), [...(byKind.get(String(object.kind)) ?? []), object]);
  }
  const layers = kind({ objects, byKind, layers: [] }, "Kustomization")
    .filter((object) => object.apiVersion === "kustomize.toolkit.fluxcd.io/v1" && meta(object).namespace === "flux-system")
    .map((object) => ({
      name: meta(object).name,
      path: get(object, "spec", "path") ?? "",
      dependsOn: ((get(object, "spec", "dependsOn") ?? []) as RecordAny[]).map((entry) => entry.name).sort(),
      wait: get(object, "spec", "wait"),
      timeout: get(object, "spec", "timeout"),
      healthChecks: get(object, "spec", "healthChecks") ?? [],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { objects, byKind, layers };
}

function controllerFor(serviceName: string, flux: FluxIndex): KubernetesObject | undefined {
  return named([...kind(flux, "Deployment"), ...kind(flux, "StatefulSet"), ...kind(flux, "Job"), ...kind(flux, "CronJob")], serviceName);
}

function podSpec(controller?: KubernetesObject): RecordAny {
  if (controller?.kind === "CronJob") return get(controller, "spec", "jobTemplate", "spec", "template", "spec") ?? {};
  if (controller?.kind === "Job") return get(controller, "spec", "template", "spec") ?? {};
  return get(controller, "spec", "template", "spec") ?? {};
}

function controllerKind(controller?: KubernetesObject): string {
  if (controller?.kind === "StatefulSet") return "statefulset";
  if (controller?.kind === "Job") return "job";
  if (controller?.kind === "CronJob") return "cronjob";
  return "deployment";
}

function portsFor(service: KubernetesObject | undefined, container: RecordAny): RecordAny[] {
  const containerPorts = new Map((container.ports ?? []).map((port: RecordAny) => [port.name, port.containerPort]));
  return ((get(service, "spec", "ports") ?? []) as RecordAny[]).map((port) => {
    const target = port.targetPort ?? port.port;
    return omitEmpty({
      name: port.name ?? `port-${port.port}`,
      containerPort: typeof target === "number" ? target : containerPorts.get(target) ?? port.port,
      servicePort: port.port,
      protocol: port.protocol,
    });
  });
}

function configFor(serviceName: string, namespace: string, flux: FluxIndex): RecordAny | undefined {
  const configMap = named(kind(flux, "ConfigMap"), `${serviceName}-config`, namespace);
  if (!configMap?.data) return undefined;
  const values: Record<string, string> = {};
  const files: Record<string, string> = {};
  for (const [key, value] of Object.entries(configMap.data as Record<string, string>)) {
    if (/^[A-Z0-9_]+$/.test(key)) values[key] = value;
    else files[key] = value;
  }
  return { values, files };
}

function secretsFor(serviceName: string, namespace: string, pod: RecordAny, flux: FluxIndex): RecordAny[] {
  const keyRefs = new Map<string, Set<string>>();
  for (const container of pod.containers ?? []) {
    for (const env of container.env ?? []) {
      const ref = env.valueFrom?.secretKeyRef;
      if (ref?.name && ref?.key) keyRefs.set(ref.name, (keyRefs.get(ref.name) ?? new Set()).add(ref.key));
    }
  }
  for (const secret of kind(flux, "VaultStaticSecret").filter((item) => meta(item).namespace === namespace)) {
    const target = get(secret, "spec", "destination", "name");
    if (target && !keyRefs.has(target)) keyRefs.set(target, new Set());
  }
  return [...keyRefs.entries()].sort().map(([secretName, keys]) => ({
    name: secretName,
    destinationSecretName: secretName,
    envKeys: [...keys].sort(),
  }));
}

function storageFor(serviceName: string, namespace: string, pod: RecordAny, flux: FluxIndex): RecordAny | undefined {
  const pvc = named(kind(flux, "PersistentVolumeClaim"), `${serviceName}-data`, namespace);
  const mount = (pod.containers?.[0]?.volumeMounts ?? [])[0];
  if (!pvc || !mount) return undefined;
  return {
    volumes: [{
      name: mount.name,
      kind: "persistent",
      size: get(pvc, "spec", "resources", "requests", "storage"),
      accessModes: get(pvc, "spec", "accessModes"),
      storageClassName: get(pvc, "spec", "storageClassName"),
    }],
    mounts: [{ volume: mount.name, path: mount.mountPath }],
  };
}

function autoscalingFor(serviceName: string, namespace: string, flux: FluxIndex): RecordAny | undefined {
  const hpa = kind(flux, "HorizontalPodAutoscaler").find((item) => meta(item).namespace === namespace && get(item, "spec", "scaleTargetRef", "name") === serviceName);
  const cpu = ((get(hpa, "spec", "metrics") ?? []) as RecordAny[]).find((metric) => metric.resource?.name === "cpu");
  return hpa ? omitEmpty({
    minReplicas: get(hpa, "spec", "minReplicas"),
    maxReplicas: get(hpa, "spec", "maxReplicas"),
    targetCpuUtilization: cpu?.resource?.target?.averageUtilization,
  }) : undefined;
}

function observabilityFor(serviceName: string, namespace: string, fleet: RecordAny, flux: FluxIndex): RecordAny {
  const backend = fleet.monitoring_intent?.kubernetes_backends?.[serviceName] ?? fleet.ingress_intent?.kubernetes_backends?.[serviceName];
  const health = backend?.health ?? {};
  const monitor = kind(flux, "ServiceMonitor").find((item) => meta(item).namespace === namespace && meta(item).name === serviceName);
  const endpoint = ((get(monitor, "spec", "endpoints") ?? []) as RecordAny[])[0] ?? {};
  return {
    status: backend ? [{
      name: "health",
      group: groupFor(serviceName, fleet),
      url: `http://${backend.service}.${backend.namespace}.svc.cluster.local:${backend.port}${health.path ?? "/"}`,
      type: health.type ?? "http",
      conditions: [`[STATUS] == ${health.expected_status ?? 200}`, `[RESPONSE_TIME] < ${health.response_time_ms ?? 1500}`],
    }] : [],
    metrics: monitor ? [omitEmpty({ kind: "ServiceMonitor", port: endpoint.port, path: endpoint.path, interval: endpoint.interval })] : [],
  };
}

function routesFor(serviceName: string, fleet: RecordAny, ports: RecordAny[]): RecordAny[] {
  const exposure = exposureFor(serviceName, fleet);
  const hostLabel = fleet.access_intent?.host_labels?.[serviceName];
  if (!hostLabel || !exposure || exposure === "internal_only") return [];
  const routeRules = (fleet.ingress_intent?.route_rules ?? []).filter((rule: RecordAny) => rule.service === serviceName);
  const selectedRules = routeRules.length > 0 ? routeRules : [{ name: serviceName, path_prefixes: ["/"] }];
  return selectedRules.map((rule: RecordAny) => ({
    name: rule.name ?? serviceName,
    host: fqdn(hostLabel, fleet.cluster?.public_domain ?? "example.com"),
    expose: { tier: exposure === "lan_only" ? "lan" : "public-frankfurt" },
    auth: { scope: (fleet.access_intent?.sso_protected ?? []).includes(serviceName) ? "application" : "anonymous" },
    rules: [...(rule.path_prefixes ?? ["/"]).map((path: string) => ({ path, operation: "prefix", port: portName(ports, fleet.ingress_intent?.kubernetes_backends?.[serviceName]?.port), middleware: [] }))],
  }));
}

function nodeContractFor(fleet: RecordAny, sourceSha: string): NodeContractModel {
  const nodes = Object.fromEntries(Object.entries(fleet.nodes ?? {}).map(([name, value]) => {
    const node = value as RecordAny;
    const arch = node.arch === "arm64" ? "arm64" : "amd64";
    return [name, {
      status: node.status === "ignored" || node.status === "planned" || node.status === "retired" ? node.status : "active",
      schedulable: node.schedulable ?? node.status !== "ignored",
      site: node.site,
      arch,
      labels: {
        "platform.jorisjonkers.dev/site": node.site,
        "platform.jorisjonkers.dev/node-id": name,
        "kubernetes.io/arch": arch,
        ...Object.fromEntries((node.capabilities ?? []).map((capability: string) => [`platform.jorisjonkers.dev/capability-${capability}`, "true"])),
      },
      taints: node.taints ?? [],
      storage: { longhorn: node.storage?.longhorn ?? { eligible: false, nodeTags: [], disks: [] } },
    }];
  }));
  return { apiVersion: "deployment.jorisjonkers.dev/node-contract/v1", kind: "NodeContract", metadata: { sourceSha }, nodes } as unknown as NodeContractModel;
}

function reachabilityFor(fleet: RecordAny): ReachabilityModel {
  const hosts = Object.entries(fleet.access_intent?.host_labels ?? {}).map(([, label]) => fqdn(String(label), fleet.cluster?.public_domain ?? "example.com")).sort();
  return {
    apiVersion: "deployment.jorisjonkers.dev/reachability/v1",
    kind: "Reachability",
    channels: { "public-frankfurt": { hosts, auth: { defaultScope: "application" } }, lan: { hosts: [] } },
  } as unknown as ReachabilityModel;
}

function filesFor(input: ImportFleetV1Result["documents"]): RenderFile[] {
  return [
    file("catalog/reachability.yml", input.reachability),
    file("deployment-sources.yml", input.sources),
    file("deployment.lock.yml", input.lock),
    file("deployment.yml", input.deployment),
    file("inventory/node-contract.lock.yml", input.nodeContract),
    ...Object.entries(input.envFiles).map(([name, value]) => file(`${name}.env.yml`, value)),
  ].sort((left, right) => left.path.localeCompare(right.path));
}

function file(path: string, document: unknown): RenderFile {
  return { path, content: YAML.stringify(document, { indent: 2, lineWidth: 0, sortMapEntries: false }), adapter: "import-fleet-v1" };
}

function envFile(environment: DeploymentEnvironment): RecordAny {
  return { apiVersion: "deployment.jorisjonkers.dev/env/v1", kind: "DeploymentEnvironment", metadata: { name: environment }, spec: { values: {}, overrides: {} } };
}

function writeFiles(outDir: string, files: RenderFile[]): void {
  for (const item of files) {
    const path = join(outDir, item.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, item.content);
  }
}

function existingFiles(root: string): RenderFile[] {
  return listFiles(root).filter((path) => /\.(json|ya?ml)$/i.test(path)).map((path) => ({
    path: relative(root, path).replaceAll("\\", "/"),
    content: readFileSync(path, "utf8"),
    adapter: "import-fleet-v1",
  })).sort((left, right) => left.path.localeCompare(right.path));
}

function clusterEnv(fleet: RecordAny): RecordAny {
  return {
    name: fleet.cluster?.name ?? "homelab",
    publicDomain: fleet.cluster?.public_domain ?? "example.com",
    gitopsRoot: "cluster/flux",
    appsRoot: "apps",
    clusterRoot: "clusters/production",
    fluxEnvironment: "production",
    interval: "10m",
  };
}

function kind(flux: FluxIndex, name: string): KubernetesObject[] {
  return flux.byKind.get(name) ?? [];
}

function named(objects: KubernetesObject[], name: string, namespace?: string): KubernetesObject | undefined {
  return objects.find((object) => meta(object).name === name && (!namespace || meta(object).namespace === namespace));
}

function meta(object?: KubernetesObject): { name: string; namespace?: string } {
  const metadata = (object?.metadata ?? {}) as RecordAny;
  return { name: String(metadata.name ?? ""), namespace: metadata.namespace };
}

function get(object: unknown, ...path: string[]): any {
  let value: any = object;
  for (const segment of path) value = value?.[segment];
  return value;
}

function groupFor(serviceName: string, fleet: RecordAny): string {
  for (const [group, names] of Object.entries(fleet.service_intent?.kubernetes ?? {})) {
    if (Array.isArray(names) && names.includes(serviceName)) return group.replaceAll("_", "-");
  }
  return "stateless";
}

function exposureFor(serviceName: string, fleet: RecordAny): string | undefined {
  return Object.entries(fleet.exposure_intent ?? {}).find(([, names]) => Array.isArray(names) && names.includes(serviceName))?.[0];
}

function portName(ports: RecordAny[], servicePort: unknown): string {
  return ports.find((port) => String(port.servicePort) === String(servicePort))?.name ?? ports[0]?.name ?? "http";
}

function fqdn(label: string, domain: string): string {
  return label === "root" ? domain : `${label}.${domain}`;
}

function omitEmpty<T extends RecordAny>(object: T): T {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as T;
}

function readYaml(path: string): unknown {
  return YAML.parse(readFileSync(path, "utf8"));
}

function readYamlDocuments(path: string): unknown[] {
  return YAML.parseAllDocuments(readFileSync(path, "utf8")).map((document) => document.toJSON()).filter(Boolean);
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  if (!statSync(root).isDirectory()) return [root];
  return readdirSync(root).flatMap((entry) => listFiles(join(root, entry))).sort();
}

function compareObjects(left: KubernetesObject, right: KubernetesObject): number {
  return String(left.kind).localeCompare(String(right.kind)) || meta(left).name.localeCompare(meta(right).name);
}
