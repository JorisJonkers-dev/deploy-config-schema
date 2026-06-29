import type { FluxWait, KubernetesObject, ProjectModel, RenderFile, RendererResult, WorkloadModel } from "../model.js";
import { autoscalingManifests } from "./autoscaling.js";
import { hookDocuments, hookWaits } from "./hooks.js";
import { storageManifests, validateStorage } from "./storage.js";
import { renderYamlDocument, renderYamlDocuments } from "./yaml.js";
import {
  configMapManifest,
  namespaceDocument,
  pdbManifest,
  rawManifests,
  serviceAccountDocument,
  validateWorkload,
  workloadDocuments,
  workloadFileName,
} from "./workloads.js";

const ADAPTER = "kubernetes";

export function renderKubernetes(model: ProjectModel): RendererResult {
  const files: RenderFile[] = [];
  const waits: FluxWait[] = [];
  for (const workload of sortedWorkloads(model)) {
    validateWorkload(workload);
    validateStorage(workload);
    const rendered = renderWorkloadFiles(model, workload);
    files.push(...rendered.files);
    waits.push(...(rendered.waits ?? []));
  }
  return { files: files.sort(compareFiles), waits };
}

function renderWorkloadFiles(model: ProjectModel, workload: WorkloadModel): RendererResult {
  const basePath = `${model.cluster.appsRoot}/${workload.group}/${workload.name}`;
  const resources: string[] = [];
  const files: RenderFile[] = [];
  const waits = hookWaits(workload);

  if (workload.namespace !== "default") {
    files.push(file(basePath, "namespace.yaml", [namespaceDocument(workload.namespace)]));
    resources.push("namespace.yaml");
  }

  const serviceAccount = serviceAccountDocument(workload);
  if (serviceAccount) {
    files.push(file(basePath, "serviceaccount.yaml", [serviceAccount]));
    resources.push("serviceaccount.yaml");
  }

  const hooks = hookDocuments(workload, model.cluster.name);
  if (hooks.length > 0) {
    files.push(file(basePath, "pre-deploy-jobs.yaml", hooks));
    resources.push("pre-deploy-jobs.yaml");
  }

  const workloadDocs = workloadDocuments(workload, model.cluster.name);
  if (workloadDocs.length > 0) {
    files.push(file(basePath, workloadFileName(workload), workloadDocs));
    resources.push(workloadFileName(workload));
  }

  const config = configMapManifest(workload);
  if (config) {
    files.push(file(basePath, "configmap.yaml", [config]));
    resources.push("configmap.yaml");
  }

  const storage = storageManifests(workload);
  if (storage.length > 0) {
    files.push(file(basePath, "pvc.yaml", storage));
    resources.push("pvc.yaml");
  }

  const policy = pdbManifest(workload);
  if (policy) {
    files.push(file(basePath, "pdb.yaml", [policy]));
    resources.push("pdb.yaml");
  }

  const autoscaling = autoscalingManifests(workload, model.renderMode);
  if (autoscaling.length > 0) {
    files.push(file(basePath, "hpa.yaml", autoscaling));
    resources.push("hpa.yaml");
  }

  if (workload.observability.metrics.some((monitor) => monitor.kind === "ServiceMonitor")) {
    resources.push("servicemonitor.yaml");
  }
  if (workload.observability.metrics.some((monitor) => monitor.kind === "PodMonitor")) {
    resources.push("podmonitor.yaml");
  }

  const raw = rawManifests(workload);
  if (raw.length > 0) {
    files.push(file(basePath, "raw.yaml", raw));
    resources.push("raw.yaml");
  }

  files.push({
    path: `${basePath}/kustomization.yaml`,
    content: renderYamlDocument({
      apiVersion: "kustomize.config.k8s.io/v1beta1",
      kind: "Kustomization",
      resources,
    }).trimEnd(),
    adapter: ADAPTER,
  });

  return { files, waits };
}

function file(basePath: string, name: string, documents: KubernetesObject[]): RenderFile {
  return {
    path: `${basePath}/${name}`,
    content: renderYamlDocuments(documents).trimEnd(),
    adapter: ADAPTER,
  };
}

function sortedWorkloads(model: ProjectModel): WorkloadModel[] {
  return Object.values(model.workloads).sort((left, right) => left.name.localeCompare(right.name));
}

function compareFiles(left: RenderFile, right: RenderFile): number {
  return left.path.localeCompare(right.path) || left.adapter.localeCompare(right.adapter);
}
