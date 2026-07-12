import YAML from "yaml";
import { validateRawManifests } from "../artifact/raw-manifests.js";
import type { DeploymentV2, WorkloadV2 } from "../deployment/v2-model.js";
import { listYamlFilesRecursive, withDeterministicRuntime, type FragmentInput } from "./fragment-model.js";
import { readFileSync } from "node:fs";

export type K8sManifest = {
  apiVersion: string;
  kind: string;
  metadata: { name: string; namespace?: string; labels?: Record<string, string>; annotations?: Record<string, string> };
  [key: string]: unknown;
};

export type KubernetesWorkloadFragment = {
  kind: "KubernetesWorkloadFragment";
  manifests: K8sManifest[];
};

const CLUSTER_SCOPED_KINDS = new Set([
  "ClusterRole",
  "ClusterRoleBinding",
  "CustomResourceDefinition",
  "Namespace",
  "ClusterIssuer",
  "PriorityClass",
  "StorageClass",
]);

export function renderKubernetesWorkloadFragment(input: FragmentInput): KubernetesWorkloadFragment {
  return withDeterministicRuntime(() => {
    const { deployment, images } = input;
    const ns = deployment.spec.namespace;
    const result: K8sManifest[] = [];

    for (const workload of deployment.spec.workloads) {
      result.push(buildWorkloadManifest(workload, ns, images));
      result.push(buildServiceAccount(workload, ns));
      if (workload.configMap) {
        result.push(buildConfigMap(workload, ns));
      }
      for (const cred of workload.credentials ?? []) {
        if (cred.kind === "VaultStaticSecret") {
          result.push(buildVaultStaticSecret(cred, workload, ns));
        } else {
          throw new Error(`E_FORBIDDEN_KIND: credential kind '${cred.kind}' forbidden; only VaultStaticSecret credentials allowed`);
        }
      }
      if (workload.rawManifests?.enabled) {
        result.push(...loadAndGuardRawManifests(deployment, workload.rawManifests.path));
      }
    }

    for (const workload of deployment.spec.workloads) {
      if (isJobWorkload(workload) && (workload as any).storage?.volumes?.some((v: any) => v.kind === "persistent")) {
        throw new Error(`E_JOB_WORKLOAD_PVC_FORBIDDEN: workload '${workload.name}' is a job and must not declare persistent storage; PVCs on job workloads are not supported`);
      }
    }

    for (const manifest of result) {
      if (manifest.kind === "Secret") {
        throw new Error("E_FORBIDDEN_KIND: raw Secret output forbidden in kubernetes-workload-fragment");
      }
      if (manifest.kind === "PersistentVolumeClaim") {
        throw new Error("E_FORBIDDEN_KIND: PersistentVolumeClaim output forbidden in kubernetes-workload-fragment");
      }
      if (CLUSTER_SCOPED_KINDS.has(manifest.kind)) {
        throw new Error(`E_FORBIDDEN_KIND: cluster-scoped kind '${manifest.kind}' forbidden in fragment output`);
      }
    }

    const manifests = [...result].sort((a, b) =>
      `${a.metadata.name}/${a.kind}`.localeCompare(`${b.metadata.name}/${b.kind}`),
    );
    return { kind: "KubernetesWorkloadFragment", manifests };
  });
}

function labels(workload: WorkloadV2): Record<string, string> {
  return { "app.kubernetes.io/name": workload.name };
}

function imageFor(workload: WorkloadV2, images: Record<string, string>): string {
  const alias = workload.image?.alias ?? workload.name;
  const ref = images[alias];
  if (!ref) {
    throw new Error(`E_IMAGE_ALIAS_NOT_IN_LOCK: alias '${alias}' (workload '${workload.name}') not present in images lock`);
  }
  return ref;
}

function isJobWorkload(workload: WorkloadV2): boolean {
  return workload.kind === "job";
}

function jobLabels(workload: WorkloadV2): Record<string, string> {
  return {
    ...labels(workload),
    "app.kubernetes.io/component": "migration",
  };
}

function buildWorkloadManifest(workload: WorkloadV2, ns: string, images: Record<string, string>): K8sManifest {
  if (isJobWorkload(workload)) {
    return buildJobManifest(workload, ns, images);
  }
  const podSpec: Record<string, unknown> = {
    serviceAccountName: workload.name,
    containers: [{ name: workload.name, image: imageFor(workload, images) }],
  };
  const nodeSelector = workload.placement?.nodeSelector;
  if (nodeSelector && Object.keys(nodeSelector).length > 0) {
    podSpec["nodeSelector"] = Object.fromEntries(
      Object.entries(nodeSelector).map(([key, values]) => [key, values[0]]),
    );
  }
  return {
    apiVersion: "apps/v1",
    kind: workload.stateful ? "StatefulSet" : "Deployment",
    metadata: { name: workload.name, namespace: ns, labels: labels(workload) },
    spec: {
      selector: { matchLabels: labels(workload) },
      template: { metadata: { labels: labels(workload) }, spec: podSpec },
    },
  };
}

function buildJobManifest(workload: WorkloadV2, ns: string, images: Record<string, string>): K8sManifest {
  const podSpec: Record<string, unknown> = {
    serviceAccountName: workload.name,
    restartPolicy: "Never",
    containers: [{ name: workload.name, image: imageFor(workload, images) }],
  };
  const nodeSelector = workload.placement?.nodeSelector;
  if (nodeSelector && Object.keys(nodeSelector).length > 0) {
    podSpec["nodeSelector"] = Object.fromEntries(
      Object.entries(nodeSelector).map(([key, values]) => [key, values[0]]),
    );
  }
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: { name: workload.name, namespace: ns, labels: jobLabels(workload) },
    spec: {
      template: { metadata: { labels: jobLabels(workload) }, spec: podSpec },
    },
  };
}

function buildServiceAccount(workload: WorkloadV2, ns: string): K8sManifest {
  return {
    apiVersion: "v1",
    kind: "ServiceAccount",
    metadata: { name: workload.name, namespace: ns, labels: labels(workload) },
  };
}

function buildConfigMap(workload: WorkloadV2, ns: string): K8sManifest {
  const data = typeof workload.configMap === "object" && workload.configMap !== null
    ? (workload.configMap as Record<string, unknown>)
    : {};
  return {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: { name: `${workload.name}-config`, namespace: ns, labels: labels(workload) },
    data,
  };
}

function buildVaultStaticSecret(cred: { kind: string; [key: string]: unknown }, workload: WorkloadV2, ns: string): K8sManifest {
  const { kind: _kind, name, ...rest } = cred;
  void _kind;
  return {
    apiVersion: "secrets.hashicorp.com/v1beta1",
    kind: "VaultStaticSecret",
    metadata: {
      name: typeof name === "string" ? name : `${workload.name}-secrets`,
      namespace: ns,
      labels: labels(workload),
    },
    spec: rest,
  };
}

function loadAndGuardRawManifests(deployment: DeploymentV2, root: string): K8sManifest[] {
  validateRawManifests({ deployment, root });
  const docs: K8sManifest[] = [];
  for (const file of listYamlFilesRecursive(root)) {
    for (const doc of YAML.parseAllDocuments(readFileSync(file, "utf8"))) {
      const obj = doc.toJS() as K8sManifest | null;
      if (obj && typeof obj === "object" && obj.kind) {
        docs.push(obj);
      }
    }
  }
  return docs;
}
