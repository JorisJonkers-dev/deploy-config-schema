import type { KubernetesObject, ProjectModel, WorkloadModel } from "../model.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "kubernetes";

export function renderAutoscaling(model: ProjectModel) {
  const files = sortedWorkloads(model).flatMap((workload) => {
    const documents = autoscalingManifests(workload, model.renderMode);
    if (documents.length === 0) return [];
    return [{
      path: `${model.cluster.appsRoot}/${workload.group}/${workload.name}/hpa.yaml`,
      content: renderYamlDocuments(documents).trimEnd(),
      adapter: ADAPTER,
    }];
  });
  return { files };
}

export function autoscalingManifests(workload: WorkloadModel, renderMode = "parity"): KubernetesObject[] {
  if (workload.importedParity?.kedaObjects?.length) return workload.importedParity.kedaObjects;
  if (!workload.autoscaling) return [];
  if (workload.kind === "job" || workload.kind === "cronjob") {
    throw new Error(`workload ${workload.name} cannot use autoscaling with kind ${workload.kind}`);
  }
  if (workload.kind !== "deployment" && workload.kind !== "statefulset") return [];
  if (workload.autoscaling.keda?.triggers.length) {
    if (renderMode === "parity") return [];
    return [scaledObjectManifest(workload)];
  }
  return [hpaManifest(workload)];
}

function hpaManifest(workload: WorkloadModel): KubernetesObject {
  const metrics = [
    ...(workload.autoscaling?.targetCpuUtilization !== undefined ? [resourceMetric("cpu", workload.autoscaling.targetCpuUtilization)] : []),
    ...(workload.autoscaling?.targetMemoryUtilization !== undefined ? [resourceMetric("memory", workload.autoscaling.targetMemoryUtilization)] : []),
  ];
  return {
    apiVersion: "autoscaling/v2",
    kind: "HorizontalPodAutoscaler",
    metadata: metadata(workload.name, workload.namespace),
    spec: {
      scaleTargetRef: {
        apiVersion: "apps/v1",
        kind: workload.kind === "statefulset" ? "StatefulSet" : "Deployment",
        name: workload.name,
      },
      minReplicas: workload.autoscaling?.minReplicas ?? 1,
      maxReplicas: workload.autoscaling?.maxReplicas,
      ...(metrics.length > 0 ? { metrics } : {}),
    },
  };
}

function scaledObjectManifest(workload: WorkloadModel): KubernetesObject {
  return {
    apiVersion: "keda.sh/v1alpha1",
    kind: "ScaledObject",
    metadata: metadata(workload.name, workload.namespace),
    spec: {
      scaleTargetRef: { name: workload.name },
      minReplicaCount: workload.autoscaling?.minReplicas ?? 1,
      maxReplicaCount: workload.autoscaling?.maxReplicas,
      triggers: workload.autoscaling?.keda?.triggers ?? [],
    },
  };
}

function resourceMetric(name: string, averageUtilization: number): KubernetesObject {
  return {
    type: "Resource",
    resource: {
      name,
      target: {
        type: "Utilization",
        averageUtilization,
      },
    },
  };
}

function metadata(name: string, namespace?: string): KubernetesObject {
  return {
    name,
    ...(namespace ? { namespace } : {}),
  };
}

function sortedWorkloads(model: ProjectModel): WorkloadModel[] {
  return Object.values(model.workloads).sort((left, right) => left.name.localeCompare(right.name));
}
