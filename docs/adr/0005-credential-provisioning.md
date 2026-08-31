---
status: proposed
---

# Secret access is a separate document; binding is a placeholder

A Service's secrets are declared in their own document, `SecretAccess`, keyed by
Workload. Each entry names a Secret Store path, the keys within it, an **access
tier**, a **delivery**, and a **rotation tolerance**. The document owns access and
file placement; it does not own environment variable names. An env-delivered
secret appears in the Service's env file as a `${secret:path#key}` placeholder,
the same named-placeholder mechanism ADR-0007 uses for Dependency Coordinates.

```yaml
# platform/secrets.yml
apiVersion: intent.jorisjonkers.dev/v1
kind: SecretAccess
service: knowledge
workloads:
  knowledge-api:
    - path: secret/data/platform/postgres
      keys: [kb.user, kb.password]
      access: read
      delivery: env
      rotation: {tolerates: restart}
```

## Access tiers

Four intents, from which the platform derives the Vault policy:

| tier | privilege derived | value changes | downstream |
|---|---|---|---|
| `read` | `read` on the path | no | none |
| `self-renew` | **none** | no | none |
| `self-roll` | `patch` on the named keys | **yes** | consumers must re-read |
| `custody` | `create`, `update`, `delete` under a prefix | n/a | none |

The tiers exist because `cluster/flux/apps/data/vault/metrics-token-renewal.yaml`
distinguishes them in production and explains why:

> *"Renewal is the normal path and needs no privilege: `vault token renew` with no
> argument renews the token it authenticated with, which every token may do. It
> also leaves the value unchanged, so nothing downstream re-reads or restarts.
> Minting is the fallback for a token already expired or revoked, and is the only
> reason this has a Vault identity at all."*

A single read/write axis would grant privilege to a self-renewer that needs none,
and would lose the distinction between extending a lease and replacing a value —
which is exactly what decides whether anything downstream must re-read.

`self-roll` derives `patch` rather than `update` for a reason the same file
records: *"`-method=patch` forces the HTTP PATCH path, which the `patch`
capability allows without read access to the other keys in this document. A
read/modify/write fallback would need `read` on the Discord webhook and Grafana
client secret too."* Deriving the capability rather than declaring it means that
least-privilege choice is made once, in the renderer, instead of being a trap
every author meets.

`custody` exists because `agents-api` creates and deletes secrets at runtime
under `secret/data/agents/projects/<id>/repos/<id>`. Those paths cannot be
enumerated ahead of time, so the grant is a prefix.

## Delivery

| delivery | renders |
|---|---|
| `env` | a VSO sync and a Secret; the env file's placeholders resolve to `envFrom` entries |
| `file` | a projected file at `mountAt` with `fileMode` |
| `self` | a policy, a Kubernetes auth role and `spring.cloud.vault` wiring. No Secret, no env var, nothing injected |

`self` is not an edge case. `auth-api` already runs it: its live manifest carries
`SPRING_CONFIG_IMPORT: vault://`, `VAULT_AUTHENTICATION: KUBERNETES`,
`VAULT_KUBERNETES_ROLE: auth-api` and `VAULT_DB_ENABLED: true` —
spring-cloud-vault's dynamic database backend, through
`libs/kotlin-spring-commons:vault`. It is the only delivery that achieves
zero-downtime rotation, because a pod's environment is fixed for its lifetime.

`file` is not an edge case either. An SSH private key cannot be an environment
variable: `secret/data/knowledge-system/vault-deploy-key` is projected at `0400`
today, alongside `jorisjonkers-dev-tls`, `garage-node-secrets` and
`vault-prometheus-token`.

## Why the document is separate

Four rival vocabularies and a fifth live mechanism existed at once: the `round3`
`vault-dynamic-secrets` schema, fully designed and entirely unused; the resolved
schema's `credentials[].claim`, implemented and validated against a registry
(`homelab-inventory/vault/claims.yml`) that was `claims: {}`, so every claim
failed; the v2 authoring type `Array<{ kind: string; [k: string]: unknown }>`, an
untyped passthrough; and hand-written Vault Agent Injector annotations in twelve
files, which is what actually ran.

Separating access from the Service document keeps three concerns apart that were
previously one field: *what a Workload may do to a secret* (this document), *what
environment variable carries it* (the env file), and *what the platform must
rebuild when it changes* (derived from `rotation`).

## Validation

Because binding and access live in different files, each checks the other:

| condition | error |
|---|---|
| `delivery: env` with no matching `${secret:…}` placeholder | dead grant |
| a `${secret:…}` placeholder with no matching grant | unauthorised reference |
| `delivery: env` with `rotation.tolerates: reload` | impossible — a pod's environment is fixed for its lifetime |
| `access: self-roll` on a path other Services read, unacknowledged | roll affects other readers |
| a literal secret value in an env file or an Asset | raw secret |

The fourth is only computable over the composed union (ADR-0015), and it is the
check nothing in the estate has today: `secret/platform/observability` holds the
Prometheus token, the Discord webhook and the Grafana client secret, and one job
rolls one of those keys.

## Consequences

- **`delivery: env` and `delivery: file` require Kubernetes secrets-at-rest
  encryption before they ship.** No `--secrets-encryption` configuration exists in
  `nix-config` or the bootstrap tree, so a Kubernetes Secret is currently
  plaintext base64 in etcd, while the agent-inject path being replaced never
  touches etcd. `self` and `custody` are unaffected — nothing is persisted. This
  is its own decision and its own work item.
- The renderer must partition an env file: a key resolving to a secret becomes an
  `envFrom` secretRef entry rather than a literal value.
- A leak scan must still cover env files. They contain references rather than
  values, but nothing structurally prevents someone pasting a value.
- Two files must agree on Workload names. That join key can drift, and the dead
  grant and unauthorised reference checks are what catch it.
- `rolloutRestartTargets` is derived from `rotation.tolerates` rather than
  declared.
