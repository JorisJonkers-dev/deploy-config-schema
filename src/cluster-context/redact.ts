import { type ClusterContext, scanAllStringFields } from "./schema.js";

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

export function redactToPublic(internal: ClusterContext): ClusterContext {
  if (internal.metadata.visibility !== "internal") {
    throw new Error("E_REDACT_NOT_INTERNAL: redactToPublic requires an internal context");
  }
  const pub = JSON.parse(JSON.stringify(internal)) as ClusterContext;
  delete (pub.spec as Record<string, unknown>)["internal"];
  pub.metadata.visibility = "public";
  pub.metadata.name = "production-public";
  // Paranoia scan: reject if any string value in result matches SC-8
  const hits = scanAllStringFields(pub.spec, SC8_PATTERNS_DEFAULT);
  if (hits.length > 0) {
    const first = hits[0];
    throw new Error(`E_REDACT_LEAK_RESIDUAL: SC-8 pattern '${first.category}' survived redaction at field '${first.path}'`);
  }
  return pub;
}
