---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#deploy-ownership
rests-on: ["0001"]
---

# Exercises are many-to-many; deploys are exactly-one

## Rests on

Overlap on `exercises` never yields two writers of one object, because `deploys`
is exactly-one per Service and, once a namespace has exactly one deployer
([0047](0047-namespace-per-deployer.md)), the API server and not only the
composition check refuses the second applier. False if: `kubectl auth can-i
--as=system:serviceaccount:deploy-system:deployer-auth-federation -n app-system
patch deployments` answers `yes` for a Service that Aggregator does not deploy —
the enforcement is then convention, not control. Settled by: that `can-i` against
a k3d vcluster carrying two Aggregators' rendered deployer RBAC, once per
(aggregator, namespace) pair; and `yq -r '.spec.deploys[]' */aggregator.yml |
sort | uniq -d`, printing nothing.

## Why

An Aggregator carries two lists with two cardinalities, and the difference is the
mechanism. `exercises` is **many-to-many**: `auth-api` is exercised by its pairing
with `auth-ui` *and* by the OIDC federation set. Of roughly 25 classes in
`stack-integration-tests`, twelve are `auth-api` relationship tests — `AuthFlow`,
`DownstreamOidcAuthorization`, `ForwardAuthChain`, `ForwardAuthRedirect`,
`GrafanaOidc`, `N8nOidc`, `OAuth2Flow`, `RabbitMqOidc`, `Registration`,
`SessionSecurity`, `Totp`, `TotpReLogin` — and they span both relationships. A
Service's pre-deploy gate runs every Aggregator naming it, so overlap is the
point. `deploys` is **exactly-one** estate-wide: many gates, one applier, which
is what makes overlap safe and why the two lists cannot collapse into one.

Exactly-one is enforced twice: `E_NO_DEPLOYER` and `E_MULTIPLE_DEPLOYERS` at
composition (`../../spec/v1/40-composition.md:192-193`), and independently by the API
server, because `deploys` generates the Aggregator's Role — *"a workflow that
tries to apply a Service it does not own receives a 403 rather than producing a
bad deploy"* (`../../spec/v1/50-lifecycle.md:200-201`). The second does not hold as
written: the generated Role is namespace-scoped with `create/patch/delete` on
every kind and no `resourceNames`, `aliases.namespace` lets two Services share a
namespace, and `deployer-rbac.yaml`'s header declares `deploys: [auth-api,
auth-ui] -> namespaces auth-system, app-system` while rendering a single Role. A
per-Service CI check cannot see a shared namespace, so the API-server half is
real only through [0047](0047-namespace-per-deployer.md).

Every domain needs a default Aggregator, or a Service in nobody's `deploys` list
cannot deploy at all — and the default cannot come from testing: `jellyfin`,
`sonarr`, `radarr`, `prowlarr`, `bazarr`, `qbittorrent` and `immich` have **zero**
test classes between them, so `media-stack` deploys seven services behind smoke
tests only. The symmetric gap has no backstop: a relationship with *no* Aggregator
has no gate, visible only in [0038](../0038-participants-list-staleness.md)'s list.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One list — the suite that gates a Service also applies it | Zero schema; one key instead of two. Costs the twelve auth classes their second home: `auth-api` may belong to the pairing suite or the federation suite, not both | Forbidding overlap removes gates to protect apply authority; the gates are why the Aggregator exists |
| Two lists, but let `deploys` overlap and arbitrate at apply time | No composition invariants to build. Every shared object becomes a server-side-apply conflict, hourly, atop the two appliers [0046](0046-distinct-field-managers.md) already serialises | Prune is a label query on `deploy.jorisjonkers.dev/deployer=<aggregator>`; with two deployers the second prunes the first's objects, so overlap is not a conflict but a deletion |
| Derive the deployer from `exercises` — most classes wins | Nothing to author; one resolver function | Makes deploy authority a function of test coverage: the seven media services, at zero classes, resolve to no deployer and become undeployable |
| Put both lists on the Service (`gatedBy`, `deployedBy`) | Deploy authority reads locally, in one file | A provider never knows its consumers; `auth-api` would be edited whenever any new consumer appeared — the shape [0049](0049-aggregator-owned-tests.md) rejects |

## Reversibility

Undo cost today: two keys in the Aggregator schema, the two invariant rows at
`../../spec/v1/40-composition.md:192-193`, and the `rbac` adapter's Role generation.
Collapsing to one list is a schema change plus one re-render per Aggregator — a
day, bounded to composition; no Workload manifest changes. Becomes irreversible
once prune-by-label-query runs in production: applied objects carry
`deploy.jorisjonkers.dev/deployer` as the prune key, so a second deployer means
one Aggregator's prune deletes the other's, and relabelling a live slice is an
outage, not an edit.

## Consequences

- A Service can be gated by every relationship it participates in at no
  coordination cost — paid by Aggregator authors, maintaining two alike lists.
- A new Service is undeployable until exactly one Aggregator claims it, failing
  as `E_NO_DEPLOYER` at composition — paid by the Service owner, at creation.
- Every domain needs a default Aggregator whether a relationship justifies one or
  not — paid by the platform owner, once per untested domain.
- A relationship with no Aggregator has no gate and nothing errors — paid by
  whoever reviews the participants list, the one place it shows.
- Every `aliases.namespace` value becomes a deploy-authority decision — paid by
  whoever reviews aliases, under [0047](0047-namespace-per-deployer.md).
- Reassigning a Service between Aggregators relabels live objects mid-flight; it
  is safe only because the incoming Aggregator applies before the outgoing one
  prunes ([0042](0042-apply-before-prune-inventory.md)), and unsafe in any
  ordering that prunes first — paid by the platform owner.
