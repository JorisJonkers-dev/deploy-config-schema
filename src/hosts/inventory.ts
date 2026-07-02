import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import { validateArtifact } from "../artifact-validator.js";
import { loadYamlDocument } from "../deployment/io.js";
import type { Diagnostic } from "../deployment/model.js";

export type HostInventory = {
  fleetPath: string;
  sitePaths: string[];
  nodePaths: string[];
  sites: Record<string, any>;
  nodes: Record<string, any>;
  sourceSha: string;
};

export type NodeContractRenderOptions = {
  labelPrefixes?: string[];
  includeLegacyCompatibilityLabels?: boolean;
};

export type HostInventoryValidation = {
  valid: boolean;
  diagnostics: Diagnostic[];
  inventory?: HostInventory;
};

type SiteEntry = { name: string; path: string; site: any };
type NodeEntry = { name: string; path: string; node: any };

const defaultLabelPrefixes = ["platform.example.com"];

export function readHostInventory(fleetPath: string): HostInventory {
  const resolvedFleetPath = resolve(fleetPath);
  const root = dirname(resolvedFleetPath);
  const fleet = loadYamlDocument(resolvedFleetPath) as any;
  if (fleet?.kind !== "FleetInventory") {
    throw new Error(`${fleetPath} must be kind: FleetInventory`);
  }

  const siteEntries: SiteEntry[] = (fleet.sites ?? []).map((entry: { path: string }) => loadSite(root, entry));
  const nodeEntries: NodeEntry[] = (fleet.nodes ?? []).map((entry: { path: string }) => loadNode(root, entry));
  assertUniqueNames("site", siteEntries);
  assertUniqueNames("node", nodeEntries);

  return {
    fleetPath: resolvedFleetPath,
    sitePaths: siteEntries.map(({ path }) => path),
    nodePaths: nodeEntries.map(({ path }) => path),
    sites: Object.fromEntries(siteEntries.map(({ name, site }) => [name, site])),
    nodes: Object.fromEntries(nodeEntries.map(({ name, node }) => [name, node])),
    sourceSha: inventorySourceSha(resolvedFleetPath, ...siteEntries.map(({ path }) => path), ...nodeEntries.map(({ path }) => path)),
  };
}

export function validateHostInventory(fleetPath: string): HostInventoryValidation {
  const diagnostics: Diagnostic[] = [];
  let inventory: HostInventory;
  try {
    inventory = readHostInventory(fleetPath);
  } catch (error) {
    return {
      valid: false,
      diagnostics: [diagnostic("E_HOST_INVENTORY_LOAD", "/", errorMessage(error))],
    };
  }

  for (const path of [inventory.fleetPath, ...inventory.sitePaths]) {
    const validation = validateArtifact("host-inventory", loadYamlDocument(path));
    diagnostics.push(...validation.diagnostics.map((entry) => ({ ...entry, path: `${path}${entry.path}` })));
  }
  for (const path of inventory.nodePaths) {
    const validation = validateArtifact("node-inventory", loadYamlDocument(path));
    diagnostics.push(...validation.diagnostics.map((entry) => ({ ...entry, path: `${path}${entry.path}` })));
  }

  for (const [siteName, site] of Object.entries(inventory.sites)) {
    if (!site.kind) diagnostics.push(diagnostic("E_SITE_KIND_MISSING", `/sites/${siteName}/kind`, `site ${siteName} must define kind`));
    if (!site.purpose) diagnostics.push(diagnostic("E_SITE_PURPOSE_MISSING", `/sites/${siteName}/purpose`, `site ${siteName} must define purpose`));
  }

  for (const [nodeName, node] of Object.entries(inventory.nodes)) {
    if (!inventory.sites[node.site]) {
      diagnostics.push(diagnostic("E_NODE_SITE_UNKNOWN", `/nodes/${nodeName}/site`, `node ${nodeName} references unknown site ${node.site}`));
    }
    if (node.schedulability?.enabled && !isSchedulable(node)) {
      diagnostics.push(diagnostic("E_NODE_SCHEDULABILITY_INVALID", `/nodes/${nodeName}/schedulability`, `node ${nodeName} is schedulable but is not an active cluster node`));
    }
    const longhornDisks = (node.storage?.disks ?? []).filter((disk: any) => disk.longhorn?.enabled);
    if (node.storage?.longhorn?.eligible && (node.storage.longhorn.node_tags ?? []).length === 0) {
      diagnostics.push(diagnostic("E_NODE_LONGHORN_TAGS_MISSING", `/nodes/${nodeName}/storage/longhorn/node_tags`, `node ${nodeName} is storage-eligible but has no node_tags`));
    }
    if (node.storage?.longhorn?.eligible && longhornDisks.length === 0) {
      diagnostics.push(diagnostic("E_NODE_LONGHORN_DISK_MISSING", `/nodes/${nodeName}/storage/disks`, `node ${nodeName} is storage-eligible but has no enabled storage disk`));
    }
    if (!node.storage?.longhorn?.eligible && longhornDisks.length > 0) {
      diagnostics.push(diagnostic("E_NODE_LONGHORN_INELIGIBLE_DISK", `/nodes/${nodeName}/storage/disks`, `node ${nodeName} is storage-ineligible but has enabled storage disks`));
    }
    for (const [index, disk] of (node.storage?.disks ?? []).entries()) {
      if (disk.reserved_gib >= disk.usable_gib) {
        diagnostics.push(diagnostic("E_NODE_DISK_RESERVED_INVALID", `/nodes/${nodeName}/storage/disks/${index}/reserved_gib`, `node ${nodeName} disk ${disk.name} reserves all usable capacity`));
      }
      if (disk.longhorn?.enabled && !(disk.roles ?? []).includes("longhorn")) {
        diagnostics.push(diagnostic("E_NODE_DISK_ROLE_INVALID", `/nodes/${nodeName}/storage/disks/${index}/roles`, `node ${nodeName} disk ${disk.name} enables storage without longhorn role`));
      }
    }
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics: diagnostics.sort(compareDiagnostics),
    inventory,
  };
}

export function renderNodeContract(fleetPathOrInventory: string | HostInventory, options: NodeContractRenderOptions = {}) {
  const inventory = typeof fleetPathOrInventory === "string" ? readHostInventory(fleetPathOrInventory) : fleetPathOrInventory;
  const nodes: Record<string, any> = {};
  for (const [name, node] of Object.entries(inventory.nodes)) {
    const labels = labelsForNode(name, node, options);
    nodes[name] = {
      status: contractStatus(node.status),
      schedulable: isSchedulable(node),
      site: node.site,
      arch: node.arch,
      capacity: {
        cpuMillicores: node.capacity.cpu_millicores,
        memoryMiB: node.capacity.memory_mib,
      },
      gpus: (node.gpus ?? []).map((gpu: any) => ({
        vendor: gpu.vendor,
        model: gpu.model,
        class: gpu.class,
        memoryMiB: gpu.memory_mib,
        count: gpu.count ?? 1,
        ...(gpu.resource_name ? { resourceName: gpu.resource_name } : {}),
      })),
      roles: node.roles,
      capabilities: node.capabilities,
      labels,
      annotations: annotationsForNode(node),
      storage: {
        longhorn: {
          eligible: node.storage.longhorn.eligible,
          nodeTags: node.storage.longhorn.node_tags ?? [],
          disks: (node.storage.disks ?? [])
            .filter((disk: any) => disk.longhorn.enabled)
            .map((disk: any) => ({
              name: disk.name,
              path: disk.path,
              media: disk.media,
              usableGiB: disk.usable_gib,
              reservedGiB: disk.reserved_gib,
              tags: disk.longhorn.tags ?? [],
            })),
        },
      },
      observed: {
        preflight: {
          storage: "pending",
        },
      },
      ...(node.taints?.length > 0 ? { taints: node.taints } : {}),
    };
  }

  return {
    apiVersion: "deployment.jorisjonkers.dev/node-contract",
    kind: "NodeContract",
    metadata: {
      sourceSha: inventory.sourceSha,
    },
    nodes,
  };
}

export function renderNodeLabelsManifest(contract: any) {
  return {
    apiVersion: "deployment.jorisjonkers.dev/node-labels",
    kind: "NodeLabels",
    nodes: Object.fromEntries(Object.entries(contract.nodes ?? {}).map(([name, node]: [string, any]) => [name, {
      labels: node.labels ?? {},
      annotations: node.annotations ?? {},
    }])),
  };
}

export function labelsForNode(name: string, node: any, options: NodeContractRenderOptions = {}): Record<string, string> {
  const labels: Record<string, string> = {
    "kubernetes.io/arch": node.arch,
    "topology.kubernetes.io/region": node.site,
  };
  for (const prefix of normalizedLabelPrefixes(options)) {
    labels[`${prefix}/site`] = node.site;
    labels[`${prefix}/node-id`] = name;
    for (const role of node.roles ?? []) labels[`${prefix}/role-${role}`] = "true";
    for (const capability of node.capabilities ?? []) labels[`${prefix}/capability-${capability}`] = "true";
    if ((node.gpus ?? []).length > 0) labels[`${prefix}/gpu`] = "true";
    for (const gpu of node.gpus ?? []) {
      labels[`${prefix}/gpu-vendor-${gpu.vendor}`] = "true";
      labels[`${prefix}/gpu-model-${gpu.model}`] = "true";
      labels[`${prefix}/gpu-class-${gpu.class}`] = "true";
      labels[`${prefix}/gpu-memory-mib-${gpu.memory_mib}`] = "true";
    }
    const maxGpuMemoryMiB = Math.max(0, ...(node.gpus ?? []).map((gpu: any) => gpu.memory_mib));
    if (maxGpuMemoryMiB > 0) labels[`${prefix}/gpu-memory-mib`] = String(maxGpuMemoryMiB);
  }
  Object.assign(labels, node.labels ?? {});
  return Object.fromEntries(Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)));
}

export function annotationsForNode(node: any): Record<string, string> {
  const annotations: Record<string, string> = {};
  if (node.storage?.longhorn?.eligible) {
    annotations["node.longhorn.io/default-node-tags"] = JSON.stringify(node.storage.longhorn.node_tags ?? []);
  }
  return annotations;
}

export function contractStatus(status: string): "active" | "ignored" | "planned" | "retired" {
  if (status === "active") return "active";
  if (status === "retired") return "retired";
  if (status === "ignored") return "ignored";
  return "planned";
}

export function isSchedulable(node: any): boolean {
  return node.status === "active" && Boolean(node.schedulability?.enabled) && (node.roles ?? []).some((role: string) => role.startsWith("k3s-"));
}

export function inventorySourceSha(...paths: string[]): string {
  const hash = createHash("sha1");
  for (const path of paths) {
    hash.update(readFileSync(path));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function stringifyHostYaml(value: unknown): string {
  return YAML.stringify(value, { lineWidth: 100, singleQuote: true });
}

function loadSite(root: string, entry: { path: string }) {
  const path = resolveInventoryPath(root, entry.path);
  const site = loadYamlDocument(path) as any;
  if (site?.kind !== "SiteInventory") throw new Error(`${entry.path} must be kind: SiteInventory`);
  if (site.metadata?.name !== pathStem(path)) throw new Error(`${entry.path} metadata.name must match filename stem`);
  return { name: site.metadata.name, path, site: site.site };
}

function loadNode(root: string, entry: { path: string }) {
  const path = resolveInventoryPath(root, entry.path);
  const node = loadYamlDocument(path) as any;
  if (node?.kind !== "NodeInventory") throw new Error(`${entry.path} must be kind: NodeInventory`);
  if (node.metadata?.name !== pathStem(path)) throw new Error(`${entry.path} metadata.name must match filename stem`);
  return { name: node.metadata.name, path, node };
}

function resolveInventoryPath(root: string, path: string): string {
  if (typeof path !== "string" || path.length === 0 || isAbsolute(path) || path.includes("..")) {
    throw new Error(`inventory reference must be a non-empty relative path inside the inventory root: ${path}`);
  }
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  if (rel === ".." || rel.startsWith(`..${sep}`) || rel.startsWith("..\\")) {
    throw new Error(`inventory reference escapes inventory root: ${path}`);
  }
  if (!existsSync(resolved)) throw new Error(`inventory reference does not exist: ${path}`);
  return resolved;
}

function pathStem(path: string): string {
  return basename(path, extname(path));
}

function assertUniqueNames(kind: string, entries: Array<{ name: string }>): void {
  const seen = new Set<string>();
  for (const { name } of entries) {
    if (seen.has(name)) throw new Error(`duplicate ${kind} inventory name: ${name}`);
    seen.add(name);
  }
}

function normalizedLabelPrefixes(options: NodeContractRenderOptions): string[] {
  const prefixes = options.labelPrefixes?.length ? options.labelPrefixes : defaultLabelPrefixes;
  return [...new Set(prefixes.map((prefix) => prefix.replace(/\/+$/, "")).filter(Boolean))].sort();
}

function diagnostic(code: string, path: string, message: string): Diagnostic {
  return { code, path, message };
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
