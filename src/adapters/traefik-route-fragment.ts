import { resolveRouteAuthMode, resolveRouteOwner } from "../deployment/v2-model.js";
import { withDeterministicRuntime, type FragmentInput } from "./fragment-model.js";

export type TraefikRoute = {
  host: string;
  owner: string;
  authMode: string;
  tier?: string;
  rules: unknown[];
  service: string;
  namespace: string;
};

export type TraefikRouteFragment = {
  kind: "TraefikRouteFragment";
  routes: TraefikRoute[];
};

export function renderTraefikRouteFragment(input: FragmentInput): TraefikRouteFragment {
  return withDeterministicRuntime(() => {
    const { deployment, context } = input;
    const routes: TraefikRoute[] = [];

    for (const workload of deployment.spec.workloads) {
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
        if (tierId) {
          const tier = context.spec.routeTiers[tierId];
          if (!tier) {
            throw new Error(`E_UNKNOWN_ROUTE_TIER: tier '${tierId}' not declared in cluster context`);
          }
          if (!(tier.authModes as string[]).includes(authMode)) {
            throw new Error(`E_ROUTE_AUTH_MODE_NOT_IN_TIER: authMode '${authMode}' not allowed by tier '${tierId}' (allowed: ${tier.authModes.join(", ")})`);
          }
        }
        routes.push({
          host: route.host,
          owner,
          authMode,
          ...(tierId ? { tier: tierId } : {}),
          rules: route.rules ?? [],
          service: workload.name,
          namespace: deployment.spec.namespace,
        });
      }
    }

    return { kind: "TraefikRouteFragment", routes: [...routes].sort((a, b) => a.host.localeCompare(b.host)) };
  });
}
