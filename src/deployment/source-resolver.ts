import type { DeploymentLockModel, DeploymentSourcesModel, Diagnostic } from "./model.js";

export type SourceResolution = {
  valid: boolean;
  firstParty: string[];
  collections: string[];
  diagnostics: Diagnostic[];
};

export function resolveSources(sources: DeploymentSourcesModel, lock: DeploymentLockModel): SourceResolution {
  const diagnostics: Diagnostic[] = [];
  const firstParty = Object.keys(sources.firstParty).sort();
  const collections = Object.keys(sources.collections).sort();

  for (const name of firstParty) {
    const source = sources.firstParty[name];
    const locked = lock.inputs.firstParty[name];
    if (!locked) {
      diagnostics.push({ code: "E_SOURCE_UNLOCKED", path: `/firstParty/${name}`, message: `firstParty source ${name} is not present in deployment.lock.yml` });
      continue;
    }
    if (source.bundle !== locked.bundle) {
      diagnostics.push({ code: "E_SOURCE_LOCK_MISMATCH", path: `/firstParty/${name}/bundle`, message: `firstParty source ${name} bundle does not match lock` });
    }
  }

  for (const name of collections) {
    const source = sources.collections[name];
    const locked = lock.inputs.collections[name];
    if (!locked) {
      diagnostics.push({ code: "E_SOURCE_UNLOCKED", path: `/collections/${name}`, message: `collection source ${name} is not present in deployment.lock.yml` });
      continue;
    }
    for (const key of ["repo", "ref", "sha"] as const) {
      if (source[key] !== locked[key]) {
        diagnostics.push({ code: "E_SOURCE_LOCK_MISMATCH", path: `/collections/${name}/${key}`, message: `collection source ${name} ${key} does not match lock` });
      }
    }
    if (source.paths.join("\n") !== locked.paths.join("\n")) {
      diagnostics.push({ code: "E_SOURCE_LOCK_MISMATCH", path: `/collections/${name}/paths`, message: `collection source ${name} paths do not match lock` });
    }
  }

  compareGitRef("hosts", sources.hosts, lock.inputs.homelabHosts, diagnostics);
  compareGitRef("platformBlueprints", sources.platformBlueprints, lock.inputs.platformBlueprints, diagnostics);

  diagnostics.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  return {
    valid: diagnostics.length === 0,
    firstParty,
    collections,
    diagnostics,
  };
}

function compareGitRef(name: string, source: any, locked: any, diagnostics: Diagnostic[]): void {
  if (!source) return;
  if (!locked) {
    diagnostics.push({ code: "E_SOURCE_UNLOCKED", path: `/${name}`, message: `${name} source is not present in deployment.lock.yml` });
    return;
  }
  for (const key of ["repo", "ref", "sha"] as const) {
    if (source[key] !== locked[key]) {
      diagnostics.push({ code: "E_SOURCE_LOCK_MISMATCH", path: `/${name}/${key}`, message: `${name} ${key} does not match lock` });
    }
  }
}
