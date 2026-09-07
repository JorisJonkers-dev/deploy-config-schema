---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#service-identity
rests-on: ["0004"]
---

# One flat Service Id, with deliberate renames as data

A Service is identified by one short string, unique across the estate, and that
string is the only identity another Service may reference. Namespace, workload
name and image reference are derived from the id by rule; a divergence is
expressed as an `alias` carrying the reason for it.

## Rests on

Identity is the estate's most contended surface — dependency edges, Vault
paths, route ownership and the alias catalogue all resolve through it — so per
[0004](0004-contention-decides-authority.md) it takes exactly one authoritative
form, while namespace, workload and image names are uncontended and derivable.
False if: a Service turns up whose live coordinates must diverge from its id
for a reason that cannot be stated as one `alias` with a `reason`, or two
Services genuinely require the same id. Settled by: composing the full
participants list and asserting zero `E_DUPLICATE_SERVICE_ID` occurrences and a
non-empty `reason` on every `aliases.*` entry.

## Why

Six coordinates currently name one thing: the `home-portal` repository holds a
document named `app-ui`, in namespace `app-system`, with a workload `app-ui`
running the image `home-portal`, whose route declares `owner: home-portal`.
`fleet-infra/docs/live-divergence.md` records why — *"the service repository is
home-portal; live called the image app-ui. A rename, not a different image"* —
and `stalwart` / `stalwart-provisioner` is a second case. Renames are permanent
in this estate, not migration artifacts. A model with no field for one forces
the explanation into prose, where it is re-litigated at every render and
re-discovered by every reviewer. An `alias` with a `reason` turns that
documentation row into a validated field; chapter 20's derivation table already
records `app-system` for `home-portal` as exactly such an alias.

Flat uniqueness cannot be had by construction, only by check: the id encodes
neither domain nor repository, so nothing structural stops two repositories
claiming the same string. Uniqueness is therefore a composition-time check —
`E_DUPLICATE_SERVICE_ID`, specified in
[chapter 40](../../spec/v1/40-composition.md) — and the window in which two
repositories both claim an id, open until composition runs, is an accepted
cost.

An alias is bounded by deploy authority. The review found that
`aliases.namespace` is precisely what lets two Services share a namespace
(`home-portal` aliased into `app-system`), the move that would dissolve the
one-namespace-one-deployer control. An alias may therefore not move a Service
into another deployer's namespace; composition rejects that with
`E_NAMESPACE_FOREIGN_DEPLOYER` ([0047](deferred/0047-namespace-per-deployer.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Domain-qualified id (`data/platform-postgres`), mirroring the vault claim format and the collection layout | every inbound reference and Vault path embeds the domain, so a domain move is an estate-wide rename | moving a Service between domains would rename it and break every inbound reference and Vault path |
| Location-derived URN (`svc:<org>/<repo>`), unique by construction and self-resolving | identity welds to repository layout; splitting or merging a repository renames its Services | `homelab-collections` holds three Services in one repository, so the repo coordinate does not identify a Service |

## Reversibility

Undo cost today: hours, not days — the identity rules live in
`spec/v1/10-service-intent.md#service-identity` and chapter 20's derivation
table, and only a handful of Service documents exist; no composed artifact has
been published against the scheme.
Becomes irreversible once: ids are baked into published composed artifacts,
Vault paths and other Services' dependency edges across the estate — from that
point a scheme change is the very estate-wide rename this decision exists to
avoid.

## Consequences

- Every cross-Service reference resolves through one string, and namespace,
  workload and image fall out by rule — paid by authors, who give up encoding
  domain or location in the name.
- Deliberate renames become validated `aliases` entries with reasons, retiring
  the prose rows in `fleet-infra/docs/live-divergence.md` — paid by Service
  authors, who must state the reason as data at authoring time.
- Uniqueness is enforced by `E_DUPLICATE_SERVICE_ID` at composition, not by
  construction; two repositories can claim one id until composition runs —
  paid by the aggregator operator, who discovers the collision only then.
- An alias cannot move a Service into another deployer's namespace
  (`E_NAMESPACE_FOREIGN_DEPLOYER`, [0047](deferred/0047-namespace-per-deployer.md)) —
  paid by authors of co-located Services, who must share a deployer or split
  namespaces.
