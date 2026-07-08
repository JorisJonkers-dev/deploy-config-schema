import { withDeterministicRuntime, type FragmentInput } from "./fragment-model.js";

export type GatusEndpoint = {
  name: string;
  url: string;
  port: number | null;
  interval: string;
  conditions: string[];
  imageDigest: string | null;
};

export type GatusEndpointFragment = {
  kind: "GatusEndpointFragment";
  endpoints: GatusEndpoint[];
};

export function renderGatusEndpointFragment(input: FragmentInput): GatusEndpointFragment {
  return withDeterministicRuntime(() => {
    const { deployment, images } = input;
    const endpoints: GatusEndpoint[] = [];

    for (const workload of deployment.spec.workloads) {
      if (workload.health?.path) {
        endpoints.push({
          name: workload.name,
          url: workload.health.path,
          port: workload.health.port ?? null,
          interval: "60s",
          conditions: ["[STATUS] == 200"],
          imageDigest: images[workload.name] ?? null,
        });
      }
    }

    return { kind: "GatusEndpointFragment", endpoints: [...endpoints].sort((a, b) => a.name.localeCompare(b.name)) };
  });
}
