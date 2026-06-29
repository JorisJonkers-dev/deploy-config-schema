import { createHash } from "node:crypto";
import type { DeploymentLockModel, RenderFile } from "./model.js";

export function readDeploymentLock(document: unknown): DeploymentLockModel {
  const value = document as any;
  return {
    metadata: value.metadata,
    inputs: {
      firstParty: value.inputs?.firstParty ?? {},
      collections: value.inputs?.collections ?? {},
      homelabHosts: value.inputs?.homelabHosts,
      platformBlueprints: value.inputs?.platformBlueprints,
      charts: value.inputs?.charts ?? {},
      images: value.inputs?.images ?? {},
    },
  };
}

export function updateDeploymentLock(lock: DeploymentLockModel, options: { renderedFiles?: RenderFile[]; generatedAt?: string } = {}): DeploymentLockModel {
  return {
    ...lock,
    metadata: {
      ...lock.metadata,
      generatedAt: options.generatedAt ?? lock.metadata.generatedAt,
      renderedRootDigest: options.renderedFiles ? renderedRootDigest(options.renderedFiles) : lock.metadata.renderedRootDigest,
    },
  };
}

export function extractLockedImages(lock: DeploymentLockModel): string[] {
  return [...new Set([
    ...Object.values(lock.inputs.firstParty ?? {}).flatMap((entry) => entry.images ?? []),
    ...Object.values(lock.inputs.images ?? {}),
  ])].sort();
}

function renderedRootDigest(files: RenderFile[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}
