---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#secrets
rests-on: ["0009"]
---

# Secret grants live on the Service document, at two levels

Secrets are declared in the Service document as a `secrets` list, at two
possible levels: on the Service, where **every** Workload receives them, or on a
Workload, where **only it** does. A Workload's effective grant set is the
Service-level list plus its own. There is no override or removal syntax — a
Workload that must *not* hold a shared secret is evidence the secret was not
shared, and it moves down a level. What an entry names is decided elsewhere
([0023](0023-grant-unit-is-the-path.md), [0025](0025-access-tiers-derive-policy.md),
[0026](0026-delivery-env-file-self.md)); this fixes only where grants live and
what nesting means.

## Rests on

A Workload's grant set is the union of the two levels in one file, and the
identity presenting it to the store is per Workload
([0024](0024-identity-per-workload.md)), so the level a grant is written at is
the level the store enforces. False if: two Workloads of one Service
authenticate as the same principal. Settled by: render a two-Workload Service
into the lab cluster, confirm `.spec.serviceAccountName` differs between the two
pods, then exchange each ServiceAccount token for a store token and
`vault kv get` the *sibling's* path — the decision falls if that read succeeds.
This claim inherits [0009](0009-vault-read-is-per-path.md) only through
[0024](0024-identity-per-workload.md): grants are unioned as whole paths, and it
is the per-Workload principal that makes the two levels enforceable at all.

## Why

Sharing is the common case and duplication is what drifts. `knowledge` holds six
grants across two Workloads, and two of them — `platform/postgres` and
`platform/rabbitmq` — are identical for both. Declaring those once is the
difference between one edit and two when a key is added. The absence of a
removal operator is deliberate: a subtract syntax would make the effective set
readable only by executing the document.

The declaration is not a separate document because the estate has already paid
for that shape. Four rival vocabularies and a fifth live mechanism existed at
once: the `round3` `vault-dynamic-secrets` schema, fully designed and unused;
the resolved schema's `credentials[].claim`, validated against a registry
(`homelab-inventory/vault/claims.yml`) that was `claims: {}`, so every claim
failed; the v2 authoring type `Array<{ kind: string; [k: string]: unknown }>`,
an untyped passthrough; and hand-written Vault Agent Injector annotations in
twelve files, which is what actually ran. A separate `SecretAccess` document was
rejected: it puts grants in a third file keyed by Workload name — a join key
that can drift — for no compensating benefit, since the access-versus-binding
split is already achieved by the env-file placeholder
([0027](0027-secret-reference-join-key.md)). Grants on the Service also sit
beside the `dependsOn` edges that motivate them, where a reviewer looks.

The two levels are an access boundary **only** because identity is per Workload.
At review time they were not one: `serviceAccountName()` in
`src/adapters/kubernetes.ts:665-669` returns `serviceName` for any Service
holding a non-Kubernetes secret, and the previous `16-dependencies.md` derived
the account from `id` to match. Two Workloads of one Service therefore
authenticated as the same principal and received the union of both policies
whatever level a grant was written at — verified against the implementation, not
suspected (finding B7). The nesting was documentation. This decision ships
paired with [0024](0024-identity-per-workload.md) or not at all.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A separate `SecretAccess` document keyed by Workload name | a third file per Service, a Workload-name join key to validate and keep in step with every rename, and a reviewer reading three files to answer "what may this pod read" | the access/binding split it buys already exists in the env-file placeholder; the join key drifts and buys nothing |
| One level only — every grant written on the Workload | `knowledge` alone restates two grants twice; a key added to a shared path becomes one edit per Workload, and the copies diverge silently | duplication is the failure mode already observed in the estate |
| Two levels plus an override/removal syntax | the effective set stops being readable and must be evaluated; exceptions accumulate as subtractions instead of being fixed | a Workload that must not hold a shared secret is evidence it was never shared |

## Reversibility

Undo cost today: the Workload level is one optional schema property and one
union in the renderer, so collapsing to a single level is a schema edit, a
renderer edit and a mechanical rewrite of the Service documents using it —
hours, with the rendered policy set unchanged because it is already the union.
Becomes irreversible once: store policies are cut per Workload and live
credentials exist under paths only one Workload holds — flattening then either
widens a live grant or forces re-issue of every credential under those paths.

## Consequences

- A Service-level grant is held by every Workload, including ones added later, so adding a Workload silently widens the blast radius of shared secrets unless the author moves them down — paid by the Service author, and by every other reader of that path.
- The boundary binds only while identity is per Workload; if [0024](0024-identity-per-workload.md) is reversed, the Workload level must be deleted from the schema rather than kept as advice — paid by the platform owner.
- An exception is expressed by moving a grant down a level, editing two places in one file, with no subtract escape hatch — paid by the Service author.
- Grants sit beside the `dependsOn` edges that motivate them, so one file answers "what may this pod read" — paid by the schema, which carries a nested list it could have flattened.
- A reviewer reading only a Workload block under-counts its grants; the renderer must print the effective union for review to be honest — paid by the renderer.
