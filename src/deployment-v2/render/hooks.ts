import type { FluxWait, HookJobModel, KubernetesObject, ProjectModel, WorkloadModel } from "../model.js";
import { podVolumes, volumeMounts } from "./storage.js";
import { serviceAccountName } from "./workloads.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "kubernetes";

export function renderHooks(model: ProjectModel) {
  const files = [];
  const waits: FluxWait[] = [];
  for (const workload of sortedWorkloads(model)) {
    const documents = hookDocuments(workload, model.cluster.name);
    if (documents.length === 0) continue;
    files.push({
      path: `${model.cluster.appsRoot}/${workload.group}/${workload.name}/pre-deploy-jobs.yaml`,
      content: renderYamlDocuments(documents).trimEnd(),
      adapter: ADAPTER,
    });
    waits.push(...hookWaits(workload));
  }
  return { files, waits };
}

export function hookDocuments(workload: WorkloadModel, clusterName = "platform"): KubernetesObject[] {
  return workload.hooks.pre.map((hook) => hookJob(workload, hook, clusterName));
}

export function hookWaits(workload: WorkloadModel): FluxWait[] {
  return workload.hooks.pre.map((hook) => ({
    apiVersion: "batch/v1",
    kind: "Job",
    name: hookName(workload, hook),
    namespace: workload.namespace,
  }));
}

function hookJob(workload: WorkloadModel, hook: HookJobModel, clusterName: string): KubernetesObject {
  const spec: KubernetesObject = {
    containers: [hookContainer(workload, hook)],
    restartPolicy: "Never",
  };
  if (workload.image.pullSecrets.length > 0) spec.imagePullSecrets = workload.image.pullSecrets.map((name) => ({ name }));
  const accountName = serviceAccountName(workload);
  if (accountName) spec.serviceAccountName = accountName;
  const volumes = podVolumes(workload);
  if (volumes.length > 0) spec.volumes = volumes;
  Object.assign(spec, schedulingSpec(workload, clusterName));
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: metadata(hookName(workload, hook), workload.namespace, keelAnnotations(workload)),
    spec: {
      backoffLimit: 0,
      template: {
        metadata: { labels: labels(workload.name) },
        spec,
      },
    },
  };
}

function hookContainer(workload: WorkloadModel, hook: HookJobModel): KubernetesObject {
  const image = hook.image ?? workload.image;
  const item: KubernetesObject = {
    name: hook.name,
    image: image.ref,
    imagePullPolicy: image.pullPolicy ?? (image.tag === "latest" ? "Always" : "IfNotPresent"),
  };
  if (hook.command && hook.command.length > 0) item.command = [...hook.command];
  if (hook.args && hook.args.length > 0) item.args = [...hook.args];
  const env = [
    ...configEnvVars(workload),
    ...secretEnvVars(workload),
    ...sortedEntries(hook.env).map(([name, value]) => ({ name, value })),
  ].sort((left, right) => String(left.name).localeCompare(String(right.name)));
  if (env.length > 0) item.env = env;
  const mounts = volumeMounts(workload);
  if (mounts.length > 0) item.volumeMounts = mounts;
  return item;
}

function configEnvVars(workload: WorkloadModel): KubernetesObject[] {
  return sortedEntries(workload.config.values).map(([name]) => ({
    name,
    valueFrom: {
      configMapKeyRef: {
        name: `${workload.name}-config`,
        key: name,
      },
    },
  }));
}

function secretEnvVars(workload: WorkloadModel): KubernetesObject[] {
  return workload.secrets.flatMap((secret) => secret.envKeys.map((key) => ({
    name: key.toUpperCase().replaceAll(/[^A-Z0-9_]/g, "_"),
    valueFrom: {
      secretKeyRef: {
        name: secret.destinationSecretName,
        key,
      },
    },
  })));
}

function schedulingSpec(workload: WorkloadModel, clusterName: string): KubernetesObject {
  const nodeSelector: Record<string, string> = { ...sortObject(workload.placement.nodeSelector) };
  if (workload.placement.nodeName) nodeSelector["kubernetes.io/hostname"] = workload.placement.nodeName;
  const result: KubernetesObject = {};
  if (Object.keys(nodeSelector).length > 0) result.nodeSelector = nodeSelector;

  const matchExpressions = [];
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

function hookName(workload: WorkloadModel, hook: HookJobModel): string {
  return `${workload.name}-${hook.name}`;
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

function sortedEntries(object: Record<string, string>): Array<[string, string]> {
  return Object.entries(object).sort(([left], [right]) => left.localeCompare(right));
}

function sortObject(object: Record<string, string>): Record<string, string> {
  return Object.fromEntries(sortedEntries(object));
}

function sortedWorkloads(model: ProjectModel): WorkloadModel[] {
  return Object.values(model.workloads).sort((left, right) => left.name.localeCompare(right.name));
}
