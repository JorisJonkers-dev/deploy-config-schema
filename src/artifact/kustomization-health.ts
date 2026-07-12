import { resolveHealthTimeout, type WorkloadWithHealth } from "../schemas/health-timeout-map.js";

export type HealthCheck = {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
};

export type KustomizationHealth = {
  apiVersion: string;
  kind: string;
  spec: {
    wait: boolean;
    retryInterval: string;
    timeout: string;
    healthChecks: HealthCheck[];
    pruneDecisions?: unknown[];
    metadata?: {
      images?: Record<string, string>;
    };
  };
};

export type EmitKustomizationHealthOptions = {
  workloads: WorkloadWithHealth[];
  healthChecks: HealthCheck[];
  imageDigests?: Record<string, string>;
  pruneDecisions?: unknown[];
  /** Override the default wait:true. Set to false for job-class workloads. */
  waitOverride?: boolean;
};

export function emitKustomizationHealth(options: EmitKustomizationHealthOptions): KustomizationHealth {
  const timeout = resolveHealthTimeout(options.workloads);
  const wait = options.waitOverride !== undefined ? options.waitOverride : true;
  return {
    apiVersion: "deployment.jorisjonkers.dev/kustomization-health/v1",
    kind: "KustomizationHealth",
    spec: {
      wait,
      retryInterval: "30s",
      timeout,
      healthChecks: options.healthChecks,
      ...(options.pruneDecisions !== undefined ? { pruneDecisions: options.pruneDecisions } : {}),
      ...(options.imageDigests && Object.keys(options.imageDigests).length > 0
        ? { metadata: { images: options.imageDigests } }
        : {}),
    },
  };
}
