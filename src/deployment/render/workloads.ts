import type { ContainerModel, KubernetesObject, ProjectModel, WorkloadModel } from "../model.js";
import { podVolumes, volumeClaimTemplates, volumeMounts } from "./storage.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "kubernetes";

export function renderWorkloads(model: ProjectModel) {
  const files = sortedWorkloads(model).flatMap((workload) => {
    const documents = workloadDocuments(workload, model.cluster.name);
    if (documents.length === 0) return [];
    return [{
      path: `${model.cluster.appsRoot}/${workload.group}/${workload.name}/${workloadFileName(workload)}`,
      content: renderYamlDocuments(documents).trimEnd(),
      adapter: ADAPTER,
    }];
  });
  return { files };
}

export function workloadDocuments(workload: WorkloadModel, clusterName = "platform"): KubernetesObject[] {
  const serviceDoc = serviceManifest(workload);
  if (["external_service", "host_native", "nomad_job"].includes(workload.kind)) {
    return serviceDoc ? [serviceDoc] : [];
  }
  return [workloadManifest(workload, clusterName), serviceDoc].filter((document): document is KubernetesObject => Boolean(document));
}

export function workloadFileName(workload: WorkloadModel): string {
  if (workload.importedParity?.workloadFileName) return workload.importedParity.workloadFileName;
  if (workload.kind === "statefulset") return "statefulset.yaml";
  if (workload.kind === "job") return "job.yaml";
  if (workload.kind === "cronjob") return "cronjob.yaml";
  return "deployment.yaml";
}

function workloadManifest(workload: WorkloadModel, clusterName: string): KubernetesObject {
  if (workload.kind === "cronjob") return cronJobManifest(workload, clusterName);
  if (workload.kind === "job") return jobManifest(workload, clusterName);
  if (workload.kind === "statefulset") return controllerManifest("StatefulSet", workload, clusterName);
  return controllerManifest("Deployment", workload, clusterName);
}

function controllerManifest(kind: "Deployment" | "StatefulSet", workload: WorkloadModel, clusterName: string): KubernetesObject {
  const spec: KubernetesObject = {
    replicas: workload.replicas ?? 1,
    selector: { matchLabels: labels(workload.name) },
    template: podTemplate(workload, workload.restartPolicy ?? "Always", clusterName),
  };
  if (kind === "StatefulSet") {
    spec.serviceName = workload.service?.name ?? workload.name;
    const templates = volumeClaimTemplates(workload);
    if (templates.length > 0) spec.volumeClaimTemplates = templates;
  }
  if (kind === "Deployment") {
    spec.strategy = deploymentStrategy(workload);
    if (workload.image.tag === "latest") spec.progressDeadlineSeconds = 600;
  }
  return {
    apiVersion: "apps/v1",
    kind,
    metadata: metadata(workload.name, workload.namespace, keelAnnotations(workload)),
    spec,
  };
}

function jobManifest(workload: WorkloadModel, clusterName: string): KubernetesObject {
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: metadata(workload.name, workload.namespace, keelAnnotations(workload)),
    spec: {
      template: podTemplate(workload, workload.restartPolicy ?? "OnFailure", clusterName),
    },
  };
}

function cronJobManifest(workload: WorkloadModel, clusterName: string): KubernetesObject {
  return {
    apiVersion: "batch/v1",
    kind: "CronJob",
    metadata: metadata(workload.name, workload.namespace, keelAnnotations(workload)),
    spec: {
      schedule: workload.schedule ?? "0 * * * *",
      jobTemplate: {
        spec: {
          template: podTemplate(workload, workload.restartPolicy ?? "OnFailure", clusterName),
        },
      },
    },
  };
}

export function podTemplate(workload: WorkloadModel, restartPolicy = workload.restartPolicy ?? "Always", clusterName = "platform"): KubernetesObject {
  const spec: KubernetesObject = {
    containers: [
      container(workload, primaryContainer(workload)),
      ...workload.sidecars.map((sidecar) => containerLike(sidecar)),
    ],
    restartPolicy,
  };
  if (workload.initContainers.length > 0) spec.initContainers = workload.initContainers.map((item) => containerLike(item));
  if (workload.image.pullSecrets.length > 0) spec.imagePullSecrets = workload.image.pullSecrets.map((name) => ({ name }));
  const accountName = serviceAccountName(workload);
  if (accountName) spec.serviceAccountName = accountName;
  const volumes = podVolumes(workload);
  if (volumes.length > 0) spec.volumes = volumes;
  Object.assign(spec, schedulingSpec(workload, clusterName));
  return {
    metadata: { labels: labels(workload.name) },
    spec,
  };
}

function primaryContainer(workload: WorkloadModel): ContainerModel {
  const primary = workload.containers[0];
  return {
    name: workload.name,
    image: primary?.image ?? workload.image,
    command: primary?.command,
    args: primary?.args,
    ports: primary?.ports.length ? primary.ports : workload.service?.ports ?? [],
    env: primary?.env ?? {},
    envFromSecrets: primary?.envFromSecrets ?? [],
    resources: primary?.resources,
    volumeMounts: primary?.volumeMounts.length ? primary.volumeMounts : workload.storage.mounts,
    probes: primary?.probes,
  };
}

function container(workload: WorkloadModel, item: ContainerModel): KubernetesObject {
  const image = item.image ?? workload.image;
  const result: KubernetesObject = {
    name: workload.name,
    image: image.ref,
    imagePullPolicy: image.pullPolicy ?? (image.tag === "latest" ? "Always" : "IfNotPresent"),
  };
  const ports = item.ports.map((port) => ({
    containerPort: port.containerPort,
    name: port.name,
    ...(port.protocol ? { protocol: port.protocol } : {}),
  }));
  if (ports.length > 0) result.ports = ports;
  if (item.command && item.command.length > 0) result.command = [...item.command];
  if (item.args && item.args.length > 0) result.args = [...item.args];

  const env = envVars(workload, item.env);
  if (env.length > 0) result.env = env;
  if (item.envFromSecrets.length > 0) {
    result.envFrom = item.envFromSecrets.map((ref) => ({
      secretRef: {
        name: ref.name,
        ...(ref.optional !== undefined ? { optional: ref.optional } : {}),
      },
    }));
  }
  const mounts = item.volumeMounts.length > 0
    ? item.volumeMounts.map((mount) => ({
      name: mount.volume,
      mountPath: mount.path,
      ...(mount.readOnly ? { readOnly: true } : {}),
    }))
    : volumeMounts(workload);
  if (mounts.length > 0) result.volumeMounts = mounts;

  const probes = item.probes ?? workload.probes;
  const importedProbe = probeFor(probes.importedHealth);
  if (probes.startup) result.startupProbe = cloneSorted(probes.startup);
  if (probes.readiness) result.readinessProbe = cloneSorted(probes.readiness);
  else if (importedProbe) result.readinessProbe = importedProbe;
  if (probes.liveness) result.livenessProbe = cloneSorted(probes.liveness);
  else if (importedProbe) result.livenessProbe = structuredClone(importedProbe);
  const resources = resourcesWithGpuLimit(item.resources, workload);
  if (resources) result.resources = resources;
  return result;
}

function containerLike(item: ContainerModel): KubernetesObject {
  const image = item.image;
  if (!image) {
    throw new Error(`container ${item.name} requires image`);
  }
  const result: KubernetesObject = {
    name: item.name,
    image: image.ref,
    imagePullPolicy: image.pullPolicy ?? (image.tag === "latest" ? "Always" : "IfNotPresent"),
  };
  if (item.command && item.command.length > 0) result.command = [...item.command];
  if (item.args && item.args.length > 0) result.args = [...item.args];
  const env = sortedEntries(item.env).map(([name, value]) => ({ name, value }));
  if (env.length > 0) result.env = env;
  return result;
}

function envVars(workload: WorkloadModel, containerEnv: Record<string, string>): KubernetesObject[] {
  const configEntries = sortedEntries({ ...workload.config.values, ...containerEnv }).map(([name]) => ({
    name,
    valueFrom: {
      configMapKeyRef: {
        name: `${workload.name}-config`,
        key: name,
      },
    },
  }));
  const secretEntries = workload.secrets.flatMap((secret) => {
    const env = secret.env ?? {};
    const mapped = Object.entries(env).map(([name, key]) => secretEnvVar(secret.destinationSecretName, name, key));
    const mappedKeys = new Set(Object.values(env));
    const derived = secret.envKeys
      .filter((key) => !mappedKeys.has(key))
      .map((key) => secretEnvVar(secret.destinationSecretName, key.toUpperCase().replaceAll(/[^A-Z0-9_]/g, "_"), key));
    return [...mapped, ...derived];
  });
  return [...configEntries, ...secretEntries].sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function secretEnvVar(secretName: string, name: string, key: string): KubernetesObject {
  return {
    name,
    valueFrom: {
      secretKeyRef: {
        name: secretName,
        key,
      },
    },
  };
}

function serviceManifest(workload: WorkloadModel): KubernetesObject | undefined {
  if (!workload.service) return undefined;
  const ports = workload.service.ports
    .filter((port) => port.servicePort)
    .map((port) => ({
      name: port.name,
      port: port.servicePort,
      targetPort: port.name,
      ...(port.protocol ? { protocol: port.protocol } : {}),
    }));
  if (ports.length === 0) return undefined;
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      ...metadata(workload.service.name, workload.namespace),
      ...(Object.keys(workload.service.annotations).length > 0 ? { annotations: sortObject(workload.service.annotations) } : {}),
    },
    spec: {
      selector: labels(workload.name),
      ports,
    },
  };
}

export function configMapManifest(workload: WorkloadModel): KubernetesObject | undefined {
  const data = sortObject({
    ...workload.config.values,
    ...workload.config.files,
  });
  if (Object.keys(data).length === 0) return undefined;
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: metadata(`${workload.name}-config`, workload.namespace),
    data,
  };
}

export function namespaceDocument(namespace: string): KubernetesObject {
  return {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: namespace },
  };
}

export function serviceAccountDocument(workload: WorkloadModel): KubernetesObject | undefined {
  const name = serviceAccountName(workload);
  if (!name) return undefined;
  return {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name, namespace: workload.namespace },
  };
}

export function serviceAccountName(workload: WorkloadModel): string | undefined {
  if (workload.serviceAccountName) return workload.serviceAccountName;
  if (workload.secrets.length > 0) return workload.name;
  return undefined;
}

export function pdbManifest(workload: WorkloadModel): KubernetesObject | undefined {
  const spec: KubernetesObject = { selector: { matchLabels: labels(workload.name) } };
  if (workload.rollout.pdbMinAvailable !== undefined) spec.minAvailable = workload.rollout.pdbMinAvailable;
  if (workload.rollout.maxUnavailable !== undefined) spec.maxUnavailable = workload.rollout.maxUnavailable;
  if (spec.minAvailable === undefined && spec.maxUnavailable === undefined) return undefined;
  return {
    apiVersion: "policy/v1",
    kind: "PodDisruptionBudget",
    metadata: metadata(workload.name, workload.namespace),
    spec,
  };
}

export function rawManifests(workload: WorkloadModel): KubernetesObject[] {
  return workload.rawManifests.map((manifest) => withDefaultNamespace(cloneSorted(manifest), workload.namespace));
}

export function validateWorkload(workload: WorkloadModel): void {
  const declaredPorts = new Set(workload.service?.ports.map((port) => port.name) ?? []);
  for (const endpoint of workload.observability.status) {
    const port = endpoint.type === "tcp" ? endpoint.url : undefined;
    if (port && !declaredPorts.has(port)) {
      throw new Error(`workload ${workload.name} probe ${endpoint.name} references undeclared port ${port}`);
    }
  }
  for (const monitor of workload.observability.metrics) {
    if (!declaredPorts.has(monitor.port)) {
      throw new Error(`workload ${workload.name} ${monitor.kind} references undeclared port ${monitor.port}`);
    }
  }
  for (const secret of workload.secrets) rejectSecretMaterial(secret, `workload ${workload.name} secret ${secret.name}`);
  for (const manifest of workload.rawManifests) rejectRawSecret(manifest, `workload ${workload.name} raw manifest ${String(manifest.kind ?? "unknown")}`);
}

function schedulingSpec(workload: WorkloadModel, clusterName: string): KubernetesObject {
  const nodeSelector: Record<string, string> = { ...sortObject(workload.placement.nodeSelector) };
  if (workload.placement.nodeName) nodeSelector["kubernetes.io/hostname"] = workload.placement.nodeName;
  const result: KubernetesObject = {};
  if (Object.keys(nodeSelector).length > 0) result.nodeSelector = nodeSelector;

  const matchExpressions = [];
  if (workload.placement.gpu && workload.placement.eligibleNodeNames?.length) {
    matchExpressions.push({
      key: "platform.jorisjonkers.dev/node-id",
      operator: "In",
      values: [...workload.placement.eligibleNodeNames].sort(),
    });
  } else {
    if (workload.placement.site) {
      matchExpressions.push({
        key: `${clusterName}/site`,
        operator: "In",
        values: [workload.placement.site],
      });
    }
    for (const capability of workload.placement.requiredCapabilities) {
      matchExpressions.push({
        key: `${clusterName}/capability-${capability}`,
        operator: "In",
        values: ["true"],
      });
    }
  }
  if (matchExpressions.length > 0) {
    result.affinity = {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: [{ matchExpressions }],
        },
      },
    };
  }
  if (workload.placement.tolerations.length > 0) result.tolerations = workload.placement.tolerations;
  if (workload.placement.topologySpread.length > 0) {
    result.topologySpreadConstraints = workload.placement.topologySpread.map((topologyKey) => ({
      maxSkew: 1,
      topologyKey: topologyKey === "hostname" ? "kubernetes.io/hostname" : topologyKey,
      whenUnsatisfiable: "ScheduleAnyway",
      labelSelector: { matchLabels: labels(workload.name) },
    }));
  }
  return result;
}

function resourcesWithGpuLimit(resources: ContainerModel["resources"], workload: WorkloadModel): ContainerModel["resources"] | undefined {
  if (!workload.placement.gpu || !workload.placement.gpuResourceName) return resources;
  return {
    ...(resources ?? {}),
    limits: {
      ...(resources?.limits ?? {}),
      [workload.placement.gpuResourceName]: workload.placement.gpu.count,
    },
  };
}

function probeFor(probe: WorkloadModel["probes"]["importedHealth"]): KubernetesObject | undefined {
  if (!probe) return undefined;
  if (probe.type === "tcp") {
    return { tcpSocket: { port: probe.port }, timeoutSeconds: 5 };
  }
  return {
    httpGet: {
      path: probe.path ?? "/",
      port: probe.port,
    },
    timeoutSeconds: 5,
  };
}

function withDefaultNamespace(manifest: KubernetesObject, namespace: string): KubernetesObject {
  const metadataValue = manifest.metadata;
  if (!metadataValue || typeof metadataValue !== "object" || Array.isArray(metadataValue) || "namespace" in metadataValue || manifest.kind === "Namespace") {
    return manifest;
  }
  return {
    ...manifest,
    metadata: {
      ...metadataValue,
      namespace,
    },
  };
}

function rejectSecretMaterial(value: unknown, path: string): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["value", "values", "data", "stringData", "literal", "secret_value"].includes(key)) {
      throw new Error(`${path} contains secret material in ${key}; use a secret reference instead`);
    }
    rejectSecretMaterial(child, `${path}.${key}`);
  }
}

function rejectRawSecret(manifest: KubernetesObject, path: string): void {
  if (manifest.kind === "Secret" && (manifest.data || manifest.stringData)) {
    throw new Error(`${path} contains Secret data; use a secret reference instead`);
  }
  const metadataValue = manifest.metadata;
  if (metadataValue && typeof metadataValue === "object" && !Array.isArray(metadataValue)) {
    rejectSecretMaterial((metadataValue as KubernetesObject).annotations, `${path}.metadata.annotations`);
  }
}

function deploymentStrategy(workload: WorkloadModel): KubernetesObject {
  if (workload.rollout.strategy === "recreate") return { type: "Recreate" };
  return {
    type: "RollingUpdate",
    rollingUpdate: {
      maxSurge: 1,
      maxUnavailable: workload.rollout.maxUnavailable ?? 0,
    },
  };
}

function metadata(name: string, namespace?: string, annotations: Record<string, string> = {}): KubernetesObject {
  return {
    name,
    ...(namespace ? { namespace } : {}),
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
  };
}

function labels(workloadName: string): Record<string, string> {
  return { "app.kubernetes.io/name": workloadName };
}

function keelAnnotations(workload: WorkloadModel): Record<string, string> {
  if (workload.image.tag !== "latest") return {};
  return {
    "keel.sh/policy": "force",
    "keel.sh/match-tag": "true",
    "keel.sh/trigger": "poll",
    "keel.sh/pollSchedule": "@every 2m",
  };
}

function cloneSorted(value: KubernetesObject): KubernetesObject;
function cloneSorted<T>(value: T): T;
function cloneSorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneSorted);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, cloneSorted(child)]));
}

function sortedEntries(object: Record<string, string>): Array<[string, string]> {
  return Object.entries(object).sort(([left], [right]) => left.localeCompare(right));
}

function sortObject(object: Record<string, string>): Record<string, string> {
  return Object.fromEntries(sortedEntries(object));
}

function sortedWorkloads(model: ProjectModel): WorkloadModel[] {
  return Object.values(model.workloads).sort((left, right) => left.name.localeCompare(right.name));
}
