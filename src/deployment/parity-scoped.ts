import { readFileSync } from "node:fs";
import YAML from "yaml";
import { listYamlFilesRecursive } from "../adapters/fragment-model.js";

export type ScopedManifest = {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  [key: string]: unknown;
};

export type ScopedParityResult = {
  service: string;
  status: "pass" | "drift";
  driftItems: string[];
};

export type ScopedParityOptions = {
  currentManifestRoot: string;
  renderedManifestRoot: string;
  profile: string;
  mode: string;
  service: string;
  selector: string;
};

export function loadManifests(root: string): ScopedManifest[] {
  const manifests: ScopedManifest[] = [];
  for (const file of listYamlFilesRecursive(root)) {
    for (const doc of YAML.parseAllDocuments(readFileSync(file, "utf8"))) {
      const obj = doc.toJS() as ScopedManifest | null;
      if (obj && typeof obj === "object" && obj.kind) {
        manifests.push(obj);
      }
    }
  }
  return manifests;
}

function parseSelector(selector: string): [string, string] {
  const idx = selector.indexOf("=");
  if (idx <= 0) {
    throw new Error(`E_INVALID_SELECTOR: selector '${selector}' must be of the form key=value`);
  }
  return [selector.slice(0, idx), selector.slice(idx + 1)];
}

export function filterBySelector(manifests: ScopedManifest[], selector: string): ScopedManifest[] {
  const [key, value] = parseSelector(selector);
  return manifests.filter((manifest) => manifest.metadata?.labels?.[key] === value);
}

function identity(manifest: ScopedManifest): string {
  return `${manifest.apiVersion ?? ""}/${manifest.kind ?? ""}/${manifest.metadata?.namespace ?? ""}/${manifest.metadata?.name ?? ""}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}

export function behavioralDiff(current: ScopedManifest[], rendered: ScopedManifest[]): string[] {
  const driftItems: string[] = [];
  const currentById = new Map(current.map((manifest) => [identity(manifest), manifest]));
  const renderedById = new Map(rendered.map((manifest) => [identity(manifest), manifest]));
  for (const [id, manifest] of currentById) {
    const other = renderedById.get(id);
    if (!other) {
      driftItems.push(`removed: ${id}`);
    } else if (!deepEqual(manifest, other)) {
      driftItems.push(`changed: ${id}`);
    }
  }
  for (const id of renderedById.keys()) {
    if (!currentById.has(id)) {
      driftItems.push(`added: ${id}`);
    }
  }
  return driftItems.sort();
}

/**
 * Fails when a resource owned by the service (label app.kubernetes.io/name=<service>)
 * that is NOT covered by the parity selector differs between the current and
 * rendered trees — scoped parity must never mutate out-of-scope resources.
 */
export function assertNoUnselectedMutations(
  current: ScopedManifest[],
  rendered: ScopedManifest[],
  service: string,
  selector: string,
): void {
  const [selectorKey, selectorValue] = parseSelector(selector);
  const serviceOwned = current.filter((manifest) => manifest.metadata?.labels?.["app.kubernetes.io/name"] === service);
  const outOfScope = serviceOwned.filter((manifest) => manifest.metadata?.labels?.[selectorKey] !== selectorValue);
  for (const resource of outOfScope) {
    const renderedVersion = rendered.find((candidate) => identity(candidate) === identity(resource));
    if (renderedVersion && !deepEqual(resource, renderedVersion)) {
      throw new Error(
        `E_PARITY_UNSELECTED_MUTATION: service-owned resource '${identity(resource)}' mutated outside parity selector scope '${selector}' (service '${service}')`,
      );
    }
  }
}

export function checkScopedParity(opts: ScopedParityOptions): ScopedParityResult {
  const current = loadManifests(opts.currentManifestRoot);
  const rendered = loadManifests(opts.renderedManifestRoot);
  const currentScoped = filterBySelector(current, opts.selector);
  const renderedScoped = filterBySelector(rendered, opts.selector);
  const driftItems = behavioralDiff(currentScoped, renderedScoped);
  assertNoUnselectedMutations(current, rendered, opts.service, opts.selector);
  return {
    service: opts.service,
    status: driftItems.length === 0 ? "pass" : "drift",
    driftItems,
  };
}
