import type { KubernetesObject, ProjectModel, StorageVolumeModel, VolumeMountModel, WorkloadModel } from "../model.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "kubernetes";

export function renderStorage(model: ProjectModel) {
  const files = sortedWorkloads(model).flatMap((workload) => {
    validateStorage(workload);
    const documents = storageManifests(workload);
    if (documents.length === 0) return [];
    return [{
      path: `${model.cluster.appsRoot}/${workload.group}/${workload.name}/pvc.yaml`,
      content: renderYamlDocuments(documents).trimEnd(),
      adapter: ADAPTER,
    }];
  });
  return { files };
}

export function storageManifests(workload: WorkloadModel): KubernetesObject[] {
  return workload.storage.volumes
    .filter((volume) => (volume.kind === "persistent" || volume.kind === "host_path") && !volume.statefulTemplate)
    .flatMap((volume) => {
      const claim = pvcManifest(workload, volume, workload.namespace);
      if (volume.kind !== "host_path") return [claim];
      return [pvManifest(workload, volume), claim];
    });
}

export function volumeClaimTemplates(workload: WorkloadModel): KubernetesObject[] {
  return workload.storage.volumes
    .filter((volume) => volume.statefulTemplate)
    .map((volume) => pvcManifest(workload, volume));
}

export function podVolumes(workload: WorkloadModel): KubernetesObject[] {
  return workload.storage.volumes.filter((volume) => !volume.statefulTemplate).map((volume) => {
    if (volume.kind === "config_map") return { name: volume.name, configMap: { name: volume.name } };
    if (volume.kind === "secret") return { name: volume.name, secret: { secretName: volume.name } };
    if (volume.kind === "empty_dir") return { name: volume.name, emptyDir: {} };
    return { name: volume.name, persistentVolumeClaim: { claimName: storageName(workload.name, volume) } };
  });
}

export function volumeMounts(workload: WorkloadModel): KubernetesObject[] {
  return workload.storage.mounts.map((mount) => volumeMount(mount));
}

export function validateStorage(workload: WorkloadModel): void {
  const declaredVolumes = new Set(workload.storage.volumes.map((volume) => volume.name));
  for (const mount of workload.storage.mounts) {
    if (!declaredVolumes.has(mount.volume)) {
      throw new Error(`workload ${workload.name} mount ${mount.path} references undeclared volume ${mount.volume}`);
    }
  }
  for (const volume of workload.storage.volumes) {
    if (volume.kind !== "host_path") continue;
    if (!workload.placement.nodeName && !workload.placement.site && workload.placement.requiredCapabilities.length === 0 && Object.keys(workload.placement.nodeSelector).length === 0) {
      throw new Error(`workload ${workload.name} host_path volume ${volume.name} requires node, site, capability, or node selector placement`);
    }
    if (!volume.hostPath) {
      throw new Error(`workload ${workload.name} host_path volume ${volume.name} requires hostPath`);
    }
  }
}

function pvManifest(workload: WorkloadModel, volume: StorageVolumeModel): KubernetesObject {
  const name = storageName(workload.name, volume);
  const spec: KubernetesObject = {
    capacity: { storage: volume.size ?? "1Gi" },
    accessModes: volume.accessModes ?? ["ReadWriteOnce"],
    persistentVolumeReclaimPolicy: "Retain",
    storageClassName: "",
    hostPath: {
      path: volume.hostPath,
      type: "DirectoryOrCreate",
    },
  };
  if (workload.placement.nodeName) {
    spec.nodeAffinity = {
      required: {
        nodeSelectorTerms: [{
          matchExpressions: [{
            key: "kubernetes.io/hostname",
            operator: "In",
            values: [workload.placement.nodeName],
          }],
        }],
      },
    };
  }
  return {
    apiVersion: "v1",
    kind: "PersistentVolume",
    metadata: { name },
    spec,
  };
}

function pvcManifest(workload: WorkloadModel, volume: StorageVolumeModel, namespace?: string): KubernetesObject {
  const spec: KubernetesObject = {
    accessModes: volume.accessModes ?? ["ReadWriteOnce"],
    resources: { requests: { storage: volume.size ?? "1Gi" } },
  };
  const storageClassName = volume.storageClassName ?? (volume.tier ? workload.storage.tiers[volume.tier]?.storageClassName : undefined);
  if (volume.kind === "host_path") {
    spec.storageClassName = "";
    spec.volumeName = storageName(workload.name, volume);
  } else if (storageClassName) {
    spec.storageClassName = storageClassName;
  }
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: metadata(storageName(workload.name, volume), namespace),
    spec,
  };
}

function volumeMount(mount: VolumeMountModel): KubernetesObject {
  return {
    name: mount.volume,
    mountPath: mount.path,
    ...(mount.readOnly ? { readOnly: true } : {}),
  };
}

function storageName(workloadName: string, volume: StorageVolumeModel): string {
  if (volume.name === workloadName || volume.name.startsWith(`${workloadName}-`)) return volume.name;
  return `${workloadName}-${volume.name}`;
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
