---
status: proposed
---

# Secrets are claimed by Vault path, and the Claim Mode is declared

A Workload declares **Claims** against the Secret Store using the full KV-v2
data path plus the keys within it — the same `(path, key)` addressing that
`VaultSecretProvider.getSecret` already uses. Each Claim names one of four
**Claim Modes**: `env` (Vault Secrets Operator projects a Secret, bound to
explicitly named environment variables), `fetch` (the application retrieves the
secret itself at runtime through the existing DSL), `file` (written to a path on
disk), `write` (a path prefix the application creates entries under). The
Service also declares its **Rotation Tolerance**, and CI rejects an impossible
pairing.

## Why

Four rival vocabularies and a fifth live mechanism existed at once. The
`round3` `vault-dynamic-secrets` schema was fully designed — auth roles, kv
paths with `owner` and `fields`, transit keys, database and RabbitMQ dynamic
engines, static and dynamic syncs with `rollout_restart_targets`, and its own
`validation_fixtures` — and entirely unused. The resolved schema's
`credentials[].claim` was implemented and validated, but its registry
(`homelab-inventory/vault/claims.yml`) was `claims: {}`, so every claim failed.
The v2 authoring type was `Array<{ kind: string; [k: string]: unknown }>` — an
untyped passthrough. What actually ran was hand-written Vault Agent Injector
annotations in twelve files, which is why `knowledge-api`'s manifest overrides
its own entrypoint with
`command: [/bin/sh, -ec, "set -a; . /vault/secrets/knowledge-api.env; …"]`,
placing the service's JVM flags inside a deployment manifest.

Rather than invent a claim identifier, v1 adopts the addressing the estate
already has. `libs/kotlin-spring-commons:vault` ships `VaultSecretProvider`
(`getSecret(path, key)`) and `VaultKeyValueWriter`, whose contract states that
callers pass the full KV-v2 data path. Real paths in use are
`secret/data/platform/postgres`, `secret/data/platform/rabbitmq`,
`secret/data/knowledge-system/mcp-bearer` and
`secret/data/agents/projects/<id>/repos/<id>`. A Claim is therefore a path and a
key list, and needs no translation layer.

The four modes exist because each is forced by a real case:

- `env` — third-party images (`postgres`, `rabbitmq`, `immich`, `n8n`) cannot
  fetch anything; a projected Secret is the only option. Keys are named
  explicitly on both sides, so the repository alone answers which variable
  carries which secret.
- `fetch` — the only mode that achieves zero-downtime rotation, because a pod's
  environment is fixed for its lifetime. `agents-api` and `agent-runtime`
  already depend on `kotlin-commons-vault` for exactly this.
- `file` — an SSH private key cannot be an environment variable.
  `agents-knowledge-vault-deploy-key`, `jorisjonkers-dev-tls`,
  `garage-node-secrets` and `vault-prometheus-token` are the live cases.
- `write` — `agents-api` creates and deletes secrets at runtime under
  `secret/data/agents/projects/<id>/repos/<id>`. Those paths cannot be
  enumerated ahead of time, so the Secret Subtree grants a prefix, not a field
  list.

## Consequences

- **`mode: env` and `mode: file` require Kubernetes secrets-at-rest encryption
  before they ship.** No `--secrets-encryption` configuration exists anywhere in
  `nix-config` or the bootstrap tree, so a Kubernetes Secret is currently
  plaintext base64 in etcd, while the agent-inject path being replaced never
  touches etcd. `mode: fetch` and `mode: write` are unaffected — nothing is
  persisted — so the prerequisite scopes to the projected modes only. This is
  its own decision and its own work item.
- `tolerates: reload` under `mode: env` is a build error. That pairing cannot
  work and previously would have failed silently at rotation time.
- The open-key-set projection is given up. `knowledge-api-mcp-tokens` currently
  relies on `envFrom` with `prefix: KNOWLEDGE_MCP_TOKENS_`, so a new device is
  added in the Secret Store alone; under explicit keys, adding a device becomes
  a pull request against the service repository. Accepted for auditability.
  Note that `McpBearerProperties`' KDoc already describes a *different*
  mechanism than the manifest uses — a comma-separated `KNOWLEDGE_MCP_TOKENS`
  variable — so one of the two has been wrong for some time, which is the case
  for naming keys explicitly.
- `rollout_restart_targets` becomes derived from Rotation Tolerance rather than
  declared.
- Because a Secret Subtree declares its readers, the Domain owning a path can
  answer "who breaks if I rotate this" — the property that consumer-only
  claiming appeared to give up.
- Every Workload using `mode: fetch` needs `spring.cloud.vault.enabled=true` and
  the `kotlin-commons-vault` dependency; the renderer emits the former, and the
  latter becomes a precondition the Service declares by choosing the mode.
