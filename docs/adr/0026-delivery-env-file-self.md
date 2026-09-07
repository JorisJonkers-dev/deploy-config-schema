---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#delivery
rests-on: ["0009"]
---

# Secret delivery is env, file, or self

## Rests on

Every secret this estate consumes arrives by one of three mechanisms — an
environment variable from a synced Kubernetes Secret, a file projected at a
declared path, or a Vault client inside the process — and which one applies is a
property of the consumer, not of the secret. False if: a live consumer's
credential arrives by none of the three. Settled by: classify every
`agent-inject`, `secretKeyRef` and `VAULT_` hit under `cluster/` as env, file or
self; the claim falls on the first hit that is none of them.
This claim inherits [0009](0009-vault-read-is-per-path.md) only through
[0023](0023-grant-unit-is-the-path.md): in all three mechanisms the derived
policy is granted per path, which is what makes delivery independent of keys.

## Why

The three deliveries render three object sets. `env` renders a VSO sync and a
Secret, with the Workload's env file placeholders resolving to `envFrom`
secretRef entries, not literal values. `file` renders a projected file at
`mountAt` with `fileMode`. `self` renders a Vault policy, a Kubernetes auth role
and the application's own client wiring — no Secret, no env var, nothing
injected. In all three the policy derives from the granted **path**
([0023](0023-grant-unit-is-the-path.md)): delivery decides how a value reaches a
process, never what its token reads.

`self` is not an edge case. `auth-api` already runs it: its live manifest
carries `SPRING_CONFIG_IMPORT: vault://`, `VAULT_AUTHENTICATION: KUBERNETES`,
`VAULT_KUBERNETES_ROLE: auth-api` and `VAULT_DB_ENABLED: true` —
spring-cloud-vault's dynamic database backend, through
`libs/kotlin-spring-commons:vault`. It is the only delivery achieving
zero-downtime rotation, because a pod's environment is fixed for its lifetime;
that same fact makes `delivery: env` with `rotation.tolerates: reload` a build
error, not a slow path. `file` is no edge case either: an SSH key cannot be an
environment variable, and `secret/data/knowledge-system/vault-deploy-key` is
projected at `0400` today (`examples/knowledge.service.yml:121-126`) alongside
`jorisjonkers-dev-tls`, `garage-node-secrets` and `vault-prometheus-token`.

`env` and `file` are the two that persist a Kubernetes Secret, so both are
refused unless the pinned cluster context advertises secrets-at-rest encryption
([0028](0028-secrets-at-rest-gate.md)): the old credential-provisioning ADR
recorded that *"the agent-inject path being replaced never touches etcd"*, so
shipping them ungated is a regression against what runs today, not an unmet
goal. `self` and `access: custody` persist nothing and are unaffected. Delivery
also feeds the rollout: `rolloutRestartTargets` derives from
`rotation.tolerates`, never hand-declared (`16-dependencies.md:288`).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One delivery (`env` only), everything else a workaround | Rewrite `auth-api`'s runtime credential path onto restart-based rotation, losing zero-downtime rotation on the estate's authentication service; ship the deploy key by an entrypoint shim that writes `$SSH_KEY` to a file at `0400` | Falsified by two live consumers before it is written: an SSH private key is not an env var, and a pod's environment is fixed for its lifetime |
| Keep the Vault Agent Injector as a fourth delivery | A templating sidecar per pod across ~30 Workloads, plus the annotation surface hand-written in twelve files today — the untyped mechanism this vocabulary replaces | It is a projector, not an authoring intent: it renders a file, so it is `file` by another means, and it does not remove the gate for `env`, which still needs a shim to become variables |
| Derive delivery from `access` and `rotation.tolerates` instead of declaring it | The renderer must invent `mountAt` and `fileMode`, which no other field supplies | `tolerates` constrains delivery without determining it: the deploy key tolerates `restart` and must still be a file, while `platform/postgres` tolerates `restart` as `env` |

## Reversibility

Undo cost today: delivery is one enum on the grant, three render branches and a
schema union carrying `mountAt`/`fileMode`. Adding a fourth value is additive —
a branch, an enum member, a spec section, hours. Removing one is not: `self` is
what `auth-api` runs in production, so dropping it means rewriting that
service's credential path and accepting restart-based rotation on the estate's
front door. Becomes irreversible once: spring-cloud-vault wiring and dynamic
database backends are compiled into service repositories — the undo is then
application code, not a render change.

## Consequences

- Until the secrets-at-rest gate ([0028](0028-secrets-at-rest-gate.md)) is
  satisfied only `self` ships, so every author whose grants are `env` waits —
  paid by service authors and the gate's owner.
- `self` requires a Vault client in the process, so a stack without one cannot
  reach zero-downtime rotation and must tolerate `restart` — paid by teams on
  runtimes with no spring-cloud-vault equivalent.
- `rolloutRestartTargets` stops being hand-maintained, so a one-word edit to
  `rotation.tolerates` silently changes restart behaviour — paid by reviewers.
- `file` puts `mountAt` and `fileMode` in the vocabulary, and a wrong mode leaves
  a readable credential on disk — paid by service authors.
- Not every tier × delivery cell is legal: `custody`+`env`, `custody`+`file` and
  `self-renew`+`env` must be refused by the schema, not left as traps — paid by
  the schema, per the review finding on the old tier table.
- `env` makes the env file and the grants list check each other: a dead grant
  and an unauthorised reference are both build errors
  ([0027](0027-secret-reference-join-key.md)) — paid by the composition step.
