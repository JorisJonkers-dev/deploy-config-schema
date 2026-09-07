---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/16-dependencies.md#workload-identity
rests-on: ["0009"]
---

# Workloads hold their own identity

The ServiceAccount and the Vault Kubernetes auth role are derived **per
Workload**, named `<service>-<workload>`; a single-Workload Service collapses to
`<service>`. The policy bound to a Workload's role is exactly its effective
grant set ([0022](0022-grants-live-on-the-service.md)) — never a sibling's — and
no author writes an identity name ([0030](0030-runtime-mechanics-derived.md)).

## Rests on

Vault's Kubernetes auth method binds a role to ServiceAccount names and
namespaces and to nothing finer, so two Pods presenting the same ServiceAccount
token are one principal holding the union of the policies bound to it. False if:
a role can bind below the ServiceAccount — to a Pod name, label or controller —
and give two Pods of one ServiceAccount different policies. Settled by: `vault
read auth/kubernetes/role/<role>` and the parameters its create path accepts on
the pinned Vault version — the claim falls if any binding parameter selects finer
than `bound_service_account_names` × `bound_service_account_namespaces`; then the
review's tiebreaker, rendering the two-Workload `knowledge` example and counting
ServiceAccounts and Vault roles, which must be two of each.

## Why

The two-level grant declaration was a documentation boundary, not an access
boundary. The old credential-provisioning record let a grant sit on the Service
(*"every Workload receives them"*) or on a Workload (*"only it does"*),
while `spec/v1/16-dependencies.md:104` and `:122` derive the ServiceAccount from
`id`, a Service field, drawing `d_id --> k_sa`. The implementation agrees:
`src/adapters/kubernetes.ts:665-669`, `serviceAccountName`, returns
`serviceName`, one ServiceAccount per Service. Two Workloads of one Service
therefore authenticated as the same Vault principal and received the union of
both policies regardless of which level the grant was declared at. Verifying the
implementation upgraded the review's DAT-004 from *Likely* to *Certain*.

The cost is concrete in the worked example. `knowledge` has two Workloads:
`knowledge-api`, which serves anonymous paths (`/mcp`, `/install.sh`) from the
public internet, and `knowledge-ingest-worker`, which holds
`secret/data/knowledge-system/vault-deploy-key` at `fileMode: "0400"` as a
Workload-level grant annotated *"only the worker pushes to the knowledge
vault"*. Under one identity per Service the internet-facing Workload
authenticated as the principal holding `read` on that SSH private key, and
[0009](0009-vault-read-is-per-path.md) leaves the store no way to narrow a read
below the path — so the identity is the only place that boundary can exist.

Splitting the identity makes [0022](0022-grants-live-on-the-service.md)'s levels
mean something: Service-level *is* shared, Workload-level *is not*, both enforced
by the token the Pod presents. The collapse keeps identities already live —
`auth-api` runs `VAULT_KUBERNETES_ROLE: auth-api` today — and the dead-grant and
unauthorised-reference checks ([0027](0027-secret-reference-join-key.md)) gain a
subject: the Workload.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One ServiceAccount per Service (today's implementation) | `knowledge-api` holds `read` on the worker's `0400` deploy key, and every Workload added later silently inherits the union | The declaration promises a boundary the store never enforces — the defect this closes |
| Drop the Workload level; all grants Service-wide | Honest, but blast radius only widens, and splitting `knowledge` then costs a second Service: duplicated namespace, exposure and observability declarations for one secret | Real Services do hold Workloads with disjoint secrets |
| One identity, a per-Workload token broker | A new component holding every Service's full grant set, whose slicing Vault's ACL never audits — a fresh single point of compromise | Moves the boundary into unaudited code to avoid emitting a second ServiceAccount |

## Reversibility

Undo cost today: one adapter function (`serviceAccountName`,
`src/adapters/kubernetes.ts:665-669`), the Vault role and policy derivation
beside it, and `## Workload identity` in `../../spec/v1/16-dependencies.md` —
hours, blast radius is object count, not authoring. Becomes irreversible once:
production Vault policies and auth roles carry `<service>-<workload>` names and
tokens are issued against them; collapsing back re-binds every role to the union
of its Workloads' grants, widening live access silently rather than loudly.

## Consequences

- A Service with *n* Workloads renders *n* ServiceAccounts, policies and auth
  roles instead of one of each, all derived; a single-Workload Service still
  renders one, so live identities such as `auth-api` survive — paid by the
  platform in object count, not by authors.
- A Workload-level grant becomes a boundary a sibling cannot cross — paid by
  nobody; it is the benefit the declaration always claimed.
- Renaming a Workload renames its identity: role, policy and bindings churn, and
  the new identity must be granted before it starts — paid by service owners.
- Services running one ServiceAccount must be migrated before their grants mean
  what they say; until then the old union stands — paid by the migration owner.
