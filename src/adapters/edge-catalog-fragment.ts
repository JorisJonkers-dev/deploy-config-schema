import { resolveRouteAuthMode, resolveRouteOwner } from "../deployment/v2-model.js";
import { withDeterministicRuntime, type FragmentInput } from "./fragment-model.js";

export type CatalogEntry = {
  service: string;
  host: string;
  owner: string | null;
  authMode: string | null;
  imageDigest: string | null;
};

export type EdgeCatalogFragment = {
  kind: "EdgeCatalogFragment";
  entries: CatalogEntry[];
};

export function renderEdgeCatalogFragment(input: FragmentInput): EdgeCatalogFragment {
  return withDeterministicRuntime(() => {
    const { deployment, images } = input;
    const entries: CatalogEntry[] = [];

    for (const workload of deployment.spec.workloads) {
      for (const route of workload.routes ?? []) {
        entries.push({
          service: workload.name,
          host: route.host,
          owner: resolveRouteOwner(deployment, workload, route) ?? null,
          authMode: resolveRouteAuthMode(deployment, workload, route) ?? null,
          imageDigest: images[workload.name] ?? null,
        });
      }
    }

    return { kind: "EdgeCatalogFragment", entries: [...entries].sort((a, b) => a.host.localeCompare(b.host)) };
  });
}
