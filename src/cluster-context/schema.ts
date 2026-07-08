import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import type { Ajv2020 as Ajv2020Class } from "ajv/dist/2020.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default as typeof Ajv2020Class;

export type ClusterContext = {
  apiVersion: string;
  kind: string;
  metadata: { name: string; visibility: "public" | "internal" };
  spec: {
    cluster: string;
    schemaVersion: string;
    labels: { allowed: Record<string, string[]> };
    routeTiers: Record<string, {
      class: "public" | "lan";
      hostnamePolicy: "public" | "lan";
      authModes: Array<"forward-auth" | "internal" | "lan">;
      requiredLabels?: Record<string, string>;
    }>;
    capacity: { nodeLabels: Record<string, string[]> };
    adapterCompat: { manifest: string };
    internal?: {
      nodeIps: Record<string, string>;
      vaultAllowLists: Record<string, unknown>;
      providerExports: Record<string, unknown>;
    };
  };
};

// SC-8 leak patterns for "default" mode
const SC8_PATTERNS_DEFAULT: Array<{ category: string; patterns: RegExp[] }> = [
  { category: "ipv4_literal", patterns: [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/] },
  { category: "ipv6_literal", patterns: [/([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}/] },
  { category: "cgnat", patterns: [/100\.6[4-9]\./, /100\.[7-9]\d\./, /100\.1[01]\d\./, /100\.12[0-7]\./] },
  { category: "rfc1918", patterns: [/192\.168\./, /10\./, /172\.(1[6-9]|2\d|3[01])\./] },
  { category: "k8s_join_tokens", patterns: [/apiServerEndpoint/, /node-token/, /agent-token/, /join-token/, /bootstrapToken/, /controlPlane/] },
  { category: "ssh_keys", patterns: [/ssh-rsa/, /ssh-ed25519/, /-----BEGIN.*PRIVATE KEY-----/] },
  { category: "vault_refs", patterns: [/vaultPath/, /vaultMount/, /vaultClaim/, /vaultPolicy/, /vaultRole/, /vaultNamespace/, /approle/] },
  { category: "hardware_ids", patterns: [/([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}/, /\/dev\/sd[a-z]/, /wwn-/, /by-id\//] },
  { category: "provider_ids", patterns: [/zone-id/, /provider-account/, /tailscale-device/] },
];

// Known node label keys for allowlist
const KNOWN_NODE_LABEL_KEYS = new Set([
  "kubernetes.io/arch",
  "kubernetes.io/os",
  "node.kubernetes.io/instance-type",
  "platform.jorisjonkers.dev/site",
  "platform.jorisjonkers.dev/capability-public-ingress",
  "platform.jorisjonkers.dev/capability-lan-ingress",
  "platform.jorisjonkers.dev/capability-storage",
  "platform.jorisjonkers.dev/role",
]);

const ajv = new Ajv2020({ strict: false });
const schemaPath = fileURLToPath(new URL("../../schemas/cluster-context.schema.json", import.meta.url));
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
const validate = ajv.compile(schema);

export function getPackageVersion(): string {
  const pkgPath = fileURLToPath(new URL("../../../package.json", import.meta.url));
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };
  return pkg.version;
}

export function validateClusterContext(doc: unknown): ClusterContext {
  if (!validate(doc)) {
    const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join(", ") ?? "unknown";
    throw new Error(`E_CLUSTER_CONTEXT_INVALID: JSON schema validation failed: ${errors}`);
  }
  const ctx = doc as ClusterContext;
  // Schema version check
  const installed = getPackageVersion();
  if (ctx.spec.schemaVersion !== installed) {
    throw new Error(`E_SCHEMA_VERSION_MISMATCH: expected ${installed}, got ${ctx.spec.schemaVersion}`);
  }
  enforce_visibility_rules(ctx);
  return ctx;
}

export function enforce_visibility_rules(doc: ClusterContext): void {
  if (doc.metadata.visibility === "public") {
    if ("internal" in doc.spec) {
      throw new Error(`E_PUBLIC_CONTEXT_HAS_INTERNAL_BLOCK: public ClusterContext must not have spec.internal`);
    }
    const hits = scanAllStringFields(doc.spec, SC8_PATTERNS_DEFAULT);
    if (hits.length > 0) {
      const first = hits[0];
      throw new Error(`E_PUBLIC_CONTEXT_LEAK: SC-8 pattern '${first.category}' found at field '${first.path}'`);
    }
    assertNodeLabelsOnAllowlist(doc.spec.labels.allowed);
  }
}

export function assertNodeLabelsOnAllowlist(allowed: Record<string, string[]>): void {
  for (const key of Object.keys(allowed)) {
    if (!KNOWN_NODE_LABEL_KEYS.has(key)) {
      throw new Error(`E_UNKNOWN_NODE_LABEL_KEY: node label key '${key}' is not in the allowlist`);
    }
  }
}

export type ScanHit = { path: string; category: string };

export function scanAllStringFields(obj: unknown, patterns: Array<{ category: string; patterns: RegExp[] }>, prefix = ""): ScanHit[] {
  const hits: ScanHit[] = [];
  if (typeof obj === "string") {
    for (const { category, patterns: regexes } of patterns) {
      for (const regex of regexes) {
        if (regex.test(obj)) {
          hits.push({ path: prefix, category });
          break; // only report each category once per field
        }
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      hits.push(...scanAllStringFields(obj[i], patterns, `${prefix}[${i}]`));
    }
  } else if (obj !== null && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      hits.push(...scanAllStringFields(value, patterns, prefix ? `${prefix}.${key}` : key));
    }
  }
  return hits;
}
