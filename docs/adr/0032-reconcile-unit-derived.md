---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#the-reconcile-unit
rests-on: ["0005"]
---

# The Reconcile Unit is derived from the dependency graph

## Rests on
Every ordering edge in the live reconcile graph is implied either by a declared
`dependsOn` edge or by a credential Claim. False if: the live graph carries an
edge between two units that no dependency and no Claim between their member
Services implies, and removing that edge breaks a deploy. Settled by: derive the
unit and order for every first-party Service and diff the derived graph against
the fourteen nodes in
`fleet-infra/cluster/flux/clusters/production/kustomizations.yaml` — an edge
present on one side only is a counterexample.

## Why
`platform.layer` was a free-form string — `schemas/cluster-state.schema.json:20`
types it `"type": "string"` with no enumeration — and every Service declared
`apps-core`. Not one of them reconciled there: `auth-api`, `agents-api` and
`app-ui` land in `apps-stateless`, `knowledge` in `apps-knowledge`,
`agent-runtime` in `apps-agents`. The field was wrong in every case and nobody
noticed, because it feeds service-registry registration and never placement. A
field that is wrong estate-wide at no cost is a comment, not a declaration.

`agents-login`'s objects appear in two Reconcile Units at once, so a
service-level field cannot describe the cluster even in principle: one string
cannot name two units. The removal is therefore from the layer-1 authoring
vocabulary — `platform.layer` is deleted from Service Intent — and it extends to
the observed side, where the review found the field surviving:
`schemas/cluster-state.schema.json:16` still lists `layer` in the `required` set
of each observed service, and it leaves that list. What remains is optional and
observed — the unit the live health document found Flux reconciling an object
in, useful only for diffing observation against derivation, never authored, and
not part of the pinned snapshot of [0034](0034-cluster-state-pinned-input.md).

The derivation is available and exact, because the fourteen-node Flux
`dependsOn` graph is the service dependency graph of
[0020](0020-dependency-edges-carry-surface.md) projected onto Domains:
`apps-knowledge` depends on `apps-data` because `knowledge` depends on
`platform-postgres` and `platform-rabbitmq`; `apps-agents` depends on
`apps-knowledge` because the agent services consume `knowledge`, and on
`apps-vso-secrets` because they claim credentials
([0022](0022-grants-live-on-the-service.md)); everything depends on `apps-core`.
The derived unit now has two consumers. For class B — the pack-delivered
foundation — it stays a Flux `Kustomization` with a `dependsOn` graph. For class
A it is the apply order: an aggregator applies its slice layer by layer in
`lock.spec.dependencyGraph.order`, which
`deploy-harness/scripts/apply-candidate.mjs` already does against a vcluster
under [0041](deferred/0041-push-delivery-boundary.md). The derivation is unchanged; only
the number of consumers is.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep `platform.layer` as the declaration | ~30 repositories re-author the field, and a validator must check each value against the live graph on every change | It was wrong in 100% of observed cases, and it is not merely wrong but inexpressible for `agents-login`, which spans two units |
| Declare the units centrally in one hand-maintained file (the v2 state) | Every new Service and every new dependency needs a second edit in `fleet-infra`, in a file no Service owner owns; the fourteen nodes stay hand-kept | Two records of one fact drift; the ordering is already implied by `dependsOn` and Claims, so the central copy is a transcription with no independent authority |
| Derive from `dependsOn` only, ignoring Claims | Loses the `apps-agents` → `apps-vso-secrets` edge: agent workloads apply before the Secrets their Claims provision exist, and crash-loop until the next reconcile | A Claim is an ordering edge — a Workload cannot start before the credential it claims is materialised |

## Reversibility
Undo cost today: reintroduce `platform.layer` into the Service Intent schema and
into ~30 authoring repositories, restore `layer` to the `required` list in
`schemas/cluster-state.schema.json`, and hand-maintain the fourteen-node graph
again — a day of schema and validator work plus one pull request per service
repository. The blast radius is authoring, not runtime. Becomes irreversible
once: the hand-maintained `kustomizations.yaml` is deleted and the units are
rendered instead, because the only recorded ordering is then the derivation's
own output — the uniform `apps-core` string is not a fallback to restore.

## Consequences
- A service owner cannot pin their reconcile position; a wrong order is fixed by
  correcting the dependency declaration that produced it — paid by the Service
  owner, in one more indirection between symptom and fix.
- A dependency cycle becomes a build failure instead of a reconcile deadlock —
  paid by whoever introduces the cycle, at build time rather than in the cluster.
- The fourteen-node graph stops being hand-maintained and is rendered — paid by
  the platform owner once, in the renderer.
- `layer` leaving the cluster-state `required` list is a breaking change for the
  one reader that indexes on it, the service registry — paid by that reader's
  owner.
- Two consumers must move together: a change to the derivation moves the class B
  Kustomization DAG and the class A apply order at the same time — paid by
  whoever changes the derivation, in testing both.
- A Service's objects may split across units with no declaration saying so, as
  `agents-login`'s do — paid by whoever debugs a partially-applied Service.
