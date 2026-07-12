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
  health?: { path?: string; port?: number; timeoutClass?: string; mandatory?: boolean };
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
    if (workload.stateful === true) {
      if (!workload.migrationPolicy) {
        throw new Error(`E_STATEFUL_MIGRATION_POLICY_REQUIRED: workload '${workload.name}' is stateful and must declare migrationPolicy`);
      }
      if (!MIGRATION_STRATEGIES.has(workload.migrationPolicy.strategy)) {
        throw new Error(`E_MIGRATION_POLICY_STRATEGY_INVALID: workload '${workload.name}' strategy '${workload.migrationPolicy.strategy}' not in [none, pre-deploy-job, external]`);
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
