import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export type ArtifactContractInputDigests = {
  deployment: string;
  imagesLock: string;
  context: string;
};

export type ArtifactContractOutputs = {
  manifests: Record<string, string>;
  metadata: Record<string, string>;
};

export type ArtifactContract = {
  apiVersion: string;
  kind: string;
  metadata: { name: string };
  spec: {
    schemaVersion: string;
    artifactType: string;
    renderHash: string;
    environments: string[];
    imageDigests: Record<string, string>;
    contextRef: string;
    inputDigests: ArtifactContractInputDigests;
    adapterCompat: { digest: string };
    schemaPackageIntegrity: string;
    provenance_verified: boolean;
    outputs: ArtifactContractOutputs;
  };
};

export function getPackageVersion(): string {
  const pkgPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export function computeRenderHash(
  files: Record<string, string>,
  inputDigests: ArtifactContractInputDigests,
  adapterCompatDigest: string,
  schemaPackageIntegrity: string,
): string {
  const sortedPaths = Object.keys(files).sort();
  const canonicalFileTree = sortedPaths
    .map((path) => `${path}\0${files[path].replaceAll("\r\n", "\n").replaceAll("\r", "\n")}`)
    .join("\n");
  const preimage = [
    "deploy-artifact-render/v1",
    `schemaPackage=${schemaPackageIntegrity}`,
    `deployment=${inputDigests.deployment}`,
    `images=${inputDigests.imagesLock}`,
    `context=${inputDigests.context}`,
    `adapterCompat=${adapterCompatDigest}`,
    canonicalFileTree,
  ].join("\n");
  return "sha256:" + createHash("sha256").update(preimage, "utf8").digest("hex");
}

export type EmitArtifactContractOptions = {
  name: string;
  environments: string[];
  imageDigests: Record<string, string>;
  contextRef: string;
  inputDigests: ArtifactContractInputDigests;
  adapterCompatDigest: string;
  schemaPackageIntegrity: string;
  provenanceVerified: boolean;
  outputs: ArtifactContractOutputs;
  files: Record<string, string>;
};

export function emitArtifactContract(options: EmitArtifactContractOptions): ArtifactContract {
  const schemaVersion = getPackageVersion();
  const renderHash = computeRenderHash(
    options.files,
    options.inputDigests,
    options.adapterCompatDigest,
    options.schemaPackageIntegrity,
  );
  return {
    apiVersion: "deployment.jorisjonkers.dev/artifact-contract/v1",
    kind: "DeployArtifactContract",
    metadata: { name: options.name },
    spec: {
      schemaVersion,
      artifactType: "application/vnd.jorisjonkers.deployment.artifact.v1+tar",
      renderHash,
      environments: options.environments,
      imageDigests: options.imageDigests,
      contextRef: options.contextRef,
      inputDigests: options.inputDigests,
      adapterCompat: { digest: options.adapterCompatDigest },
      schemaPackageIntegrity: options.schemaPackageIntegrity,
      provenance_verified: options.provenanceVerified,
      outputs: options.outputs,
    },
  };
}
