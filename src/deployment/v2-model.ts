import type { ClusterContext } from "../cluster-context/schema.js";

export type RouteV2 = {
  host: string;
  owner?: string;
  authMode?: string;
  expose?: { tier?: string };
  rules?: unknown[];
};

export type WorkloadV2 = {
  name: string;
  image?: { alias?: string };
  kind?: "deployment" | "statefulset" | "job";
  stateful?: boolean;
  migrationPolicy?: { required: boolean; strategy: "none" | "pre-deploy-job" | "external" };
  rollbackTargetRetention?: { minimumDays: number; acknowledged: boolean };
  routes?: RouteV2[];
  routeDefaults?: { owner?: string; authMode?: string };
  /**
   * timeoutClass drives the Flux Kustomization health-check timeout, not container
   * probe timings. path + port additionally seed the container probes: readiness
   * uses path, liveness uses livenessPath and falls back to path, which is what
   * Spring actuator services need since their two endpoints differ.
   */
  health?: {
    path?: string;
    port?: number;
    timeoutClass?: string;
    mandatory?: boolean;
    livenessPath?: string;
    probeTimeoutSeconds?: number;
  };
  /** Desired replica count, declared so the owning repository decides it. */
  replicas?: number;
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
  credentials?: Array<{ kind: string; [key: string]: unknown }>;
  rawManifests?: { enabled: boolean; path: string };
  placement?: { nodeSelector?: Record<string, string[]> };
  configMap?: unknown;
};

export type DeploymentV2 = {
  apiVersion?: string;
  kind: string;
  metadata: { name: string };
  spec: {
    namespace: string;
    workloads: WorkloadV2[];
    routeDefaults?: { owner?: string; authMode?: string };
  };
};

export const DEPLOYMENT_V2_API_VERSION = "deployment.jorisjonkers.dev/v2";

const MIGRATION_STRATEGIES = new Set(["none", "pre-deploy-job", "external"]);

/** Authoritative deployment v2 / platform error codes (chunk A). */
export const ERROR_CODES = Object.freeze([
  "E_ROUTE_OWNER_REQUIRED",
  "E_ROUTE_AUTH_MODE_REQUIRED",
  "E_ROUTE_AUTH_MODE_NOT_IN_TIER",
  "E_STATEFUL_MIGRATION_POLICY_REQUIRED",
  "E_MIGRATION_POLICY_STRATEGY_INVALID",
  "E_ROLLBACK_RETENTION_ACK_REQUIRED",
  "E_ROLLBACK_RETENTION_MIN_DAYS",
  "E_SCHEMA_VERSION_MISMATCH",
  "E_FLOATING_IMAGE",
  "E_FORBIDDEN_KIND",
  "E_FOREIGN_NAMESPACE",
  "E_RAW_MISSING_ANNOTATION",
  "E_PUBLIC_CONTEXT_LEAK",
  "E_PUBLIC_CONTEXT_HAS_INTERNAL_BLOCK",
  "E_UNKNOWN_NODE_LABEL_KEY",
  "E_REDACT_LEAK_RESIDUAL",
  "E_UNKNOWN_HEALTH_TIMEOUT_CLASS",
  "E_REPLICAS_INVALID",
  "E_RESOURCES_INVALID",
  "E_PROBE_TIMEOUT_INVALID",
  "E_RAW_MANIFESTS_VIOLATIONS",
] as const);

export function resolveRouteOwner(deployment: DeploymentV2, workload: WorkloadV2, route: RouteV2): string | undefined {
  return route.owner ?? workload.routeDefaults?.owner ?? deployment.spec.routeDefaults?.owner;
}

export function resolveRouteAuthMode(deployment: DeploymentV2, workload: WorkloadV2, route: RouteV2): string | undefined {
  return route.authMode ?? workload.routeDefaults?.authMode ?? deployment.spec.routeDefaults?.authMode;
}

/**
 * Semantic validation of a deployment v2 document against a cluster context
 * (chunk A rules): stateful/migration policy, rollback retention, route
 * owner + authMode resolution and tier membership.
 */
export function validateDeploymentSemantics(deployment: DeploymentV2, context: ClusterContext): void {
  if (deployment.apiVersion && deployment.apiVersion !== DEPLOYMENT_V2_API_VERSION) {
    process.emitWarning(
      `deployment.yml apiVersion '${deployment.apiVersion}' is not '${DEPLOYMENT_V2_API_VERSION}'; migrate to apiVersion: ${DEPLOYMENT_V2_API_VERSION}`,
    );
  }

  for (const workload of deployment.spec.workloads) {
    if (workload.kind === "job" && workload.stateful === true) {
      throw new Error(`E_JOB_STATEFUL_CONFLICT: workload '${workload.name}' declares both kind:job and stateful:true; these are mutually exclusive`);
    }
    if (workload.stateful === true) {
      if (!workload.migrationPolicy) {
        throw new Error(`E_STATEFUL_MIGRATION_POLICY_REQUIRED: workload '${workload.name}' is stateful and must declare migrationPolicy`);
      }
      if (!MIGRATION_STRATEGIES.has(workload.migrationPolicy.strategy)) {
        throw new Error(`E_MIGRATION_POLICY_STRATEGY_INVALID: workload '${workload.name}' strategy '${workload.migrationPolicy.strategy}' not in [none, pre-deploy-job, external]`);
      }
    }

    if (workload.replicas !== undefined) {
      if (!Number.isInteger(workload.replicas) || workload.replicas < 0) {
        throw new Error(`E_REPLICAS_INVALID: workload '${workload.name}' replicas ${workload.replicas} must be a non-negative integer`);
      }
    }

    if (workload.resources) {
      for (const bucket of ["requests", "limits"] as const) {
        const values = workload.resources[bucket];
        if (values === undefined) continue;
        if (typeof values !== "object" || values === null || Array.isArray(values)) {
          throw new Error(`E_RESOURCES_INVALID: workload '${workload.name}' resources.${bucket} must be a mapping of resource name to quantity`);
        }
        for (const [key, value] of Object.entries(values)) {
          if (typeof value !== "string" || value.trim() === "") {
            throw new Error(`E_RESOURCES_INVALID: workload '${workload.name}' resources.${bucket}.${key} must be a non-empty quantity string`);
          }
        }
      }
    }

    if (workload.health?.probeTimeoutSeconds !== undefined) {
      const seconds = workload.health.probeTimeoutSeconds;
      if (!Number.isInteger(seconds) || seconds <= 0) {
        throw new Error(`E_PROBE_TIMEOUT_INVALID: workload '${workload.name}' health.probeTimeoutSeconds ${seconds} must be a positive integer`);
      }
    }

    if (workload.rollbackTargetRetention) {
      if (workload.rollbackTargetRetention.acknowledged !== true) {
        throw new Error(`E_ROLLBACK_RETENTION_ACK_REQUIRED: workload '${workload.name}' rollbackTargetRetention.acknowledged must be true`);
      }
      if (workload.rollbackTargetRetention.minimumDays < 90) {
        throw new Error(`E_ROLLBACK_RETENTION_MIN_DAYS: workload '${workload.name}' minimumDays ${workload.rollbackTargetRetention.minimumDays} < 90`);
      }
    }

    for (const route of workload.routes ?? []) {
      const owner = resolveRouteOwner(deployment, workload, route);
      if (!owner) {
        throw new Error(`E_ROUTE_OWNER_REQUIRED: workload '${workload.name}' route '${route.host}' has no owner and no routeDefaults.owner`);
      }
      const authMode = resolveRouteAuthMode(deployment, workload, route);
      if (!authMode) {
        throw new Error(`E_ROUTE_AUTH_MODE_REQUIRED: workload '${workload.name}' route '${route.host}' has no authMode and no routeDefaults.authMode`);
      }
      const tierId = route.expose?.tier;
      const tier = tierId ? context.spec.routeTiers[tierId] : undefined;
      if (tier && !(tier.authModes as string[]).includes(authMode)) {
        throw new Error(`E_ROUTE_AUTH_MODE_NOT_IN_TIER: authMode '${authMode}' not allowed by tier '${tierId}' (allowed: ${tier.authModes.join(", ")})`);
      }
    }
  }
}

export type ImageLockArrayEntry = { alias: string; ref: string };

/**
 * Normalizes an images lock document to the canonical object form.
 * Accepts the canonical object form ({alias: ref}) or the transitional
 * array form ([{alias, ref}]).
 */
export function normalizeImageLock(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    return Object.fromEntries((raw as ImageLockArrayEntry[]).map((entry) => [entry.alias, entry.ref]));
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as Record<string, string>;
  }
  throw new Error("E_IMAGE_LOCK_INVALID_SHAPE: expected object or array");
}
