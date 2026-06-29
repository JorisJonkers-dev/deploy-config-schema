import type { KubernetesObject, ProjectModel, RendererResult, ServiceMonitorModel, WorkloadModel } from "../model.js";
import { renderYamlDocuments } from "./yaml.js";

const ADAPTER = "deployment-servicemonitor";

export function renderServiceMonitors(model: ProjectModel): RendererResult {
  const files = Object.values(model.workloads)
    .flatMap((workload) => {
      const serviceMonitors = workload.observability.metrics.filter((monitor) => monitor.kind === "ServiceMonitor");
      const podMonitors = workload.observability.metrics.filter((monitor) => monitor.kind === "PodMonitor");
      const basePath = `${model.cluster.appsRoot}/${workload.group}/${workload.name}`;
      const result = [];
      if (serviceMonitors.length > 0) {
        result.push({
          path: `${basePath}/servicemonitor.yaml`,
          content: renderYamlDocuments(serviceMonitors.map((monitor) => monitorManifest(workload, monitor))),
          adapter: ADAPTER,
        });
      }
      if (podMonitors.length > 0) {
        result.push({
          path: `${basePath}/podmonitor.yaml`,
          content: renderYamlDocuments(podMonitors.map((monitor) => monitorManifest(workload, monitor))),
          adapter: ADAPTER,
        });
      }
      return result;
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return { files };
}

function monitorManifest(workload: WorkloadModel, monitor: ServiceMonitorModel): KubernetesObject {
  return {
    apiVersion: "monitoring.coreos.com/v1",
    kind: monitor.kind,
    metadata: {
      name: workload.name,
      namespace: workload.namespace,
      labels: { release: "metrics-stack" },
    },
    spec: {
      jobLabel: "app.kubernetes.io/name",
      selector: { matchLabels: labels(workload.name) },
      [monitor.kind === "ServiceMonitor" ? "endpoints" : "podMetricsEndpoints"]: [{
        port: monitor.port,
        path: monitor.path ?? "/metrics",
        interval: monitor.interval ?? "30s",
        scheme: "http",
      }],
    },
  };
}

function labels(serviceName: string): Record<string, string> {
  return { "app.kubernetes.io/name": serviceName };
}
