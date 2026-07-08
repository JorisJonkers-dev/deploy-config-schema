import { createHash } from "node:crypto";
import YAML from "yaml";

export type AdapterCompatSpec = {
  fragments: Record<string, {
    outputKind: string;
    outputSchema: string;
    centralAdapters: Record<string, { accepts: string }>;
  }>;
};

export type AdapterCompatDoc = {
  apiVersion: string;
  kind: string;
  metadata: {
    schemaVersion: string;
    schemaPackageIntegrity: string;
    generatedFrom: string;
  };
  spec: AdapterCompatSpec;
  digest: string;
};

export function emitAdapterCompat(schemaVersion: string, integrity: string): AdapterCompatDoc {
  const spec: AdapterCompatSpec = {
    fragments: {
      "traefik-route-fragment": {
        outputKind: "TraefikRouteFragment",
        outputSchema: "deployment.jorisjonkers.dev/route-fragment/v1",
        centralAdapters: {
          "traefik-public": { accepts: "route-fragment/v1" },
          "traefik-lan": { accepts: "route-fragment/v1" },
        },
      },
      "gatus-endpoint-fragment": {
        outputKind: "GatusEndpointFragment",
        outputSchema: "deployment.jorisjonkers.dev/gatus-endpoint-fragment/v1",
        centralAdapters: {
          "gatus": { accepts: "gatus-endpoint-fragment/v1" },
        },
      },
      "edge-catalog-fragment": {
        outputKind: "EdgeCatalogFragment",
        outputSchema: "deployment.jorisjonkers.dev/edge-catalog-fragment/v1",
        centralAdapters: {
          "edge-catalog": { accepts: "edge-catalog-fragment/v1" },
          "edge-route-catalog": { accepts: "edge-catalog-fragment/v1" },
        },
      },
      "image-metadata-fragment": {
        outputKind: "ImageMetadataFragment",
        outputSchema: "deployment.jorisjonkers.dev/image-metadata-fragment/v1",
        centralAdapters: {
          "image-metadata": { accepts: "image-metadata-fragment/v1" },
        },
      },
      "kubernetes-workload-fragment": {
        outputKind: "KubernetesWorkloadFragment",
        outputSchema: "deployment.jorisjonkers.dev/kubernetes-workload-fragment/v1",
        centralAdapters: {
          "kubernetes": { accepts: "kubernetes-workload-fragment/v1" },
        },
      },
    },
  };
  const canonicalYamlStr = YAML.stringify(spec, { sortMapEntries: true, lineWidth: 0 });
  const digest = "sha256:" + createHash("sha256").update(canonicalYamlStr).digest("hex");
  return {
    apiVersion: "deployment.jorisjonkers.dev/adapter-compat/v1",
    kind: "AdapterCompat",
    metadata: {
      schemaVersion,
      schemaPackageIntegrity: integrity,
      generatedFrom: "deploy-config-schema",
    },
    spec,
    digest,
  };
}
