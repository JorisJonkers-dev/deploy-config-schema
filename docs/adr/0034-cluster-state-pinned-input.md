---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#cluster-state
rests-on: ["0006"]
---

# ClusterState is a pinned, digested input

## Rests on

The cluster facts layer-2 assignments need are enumerable and change only on
operator-visible events — a node failing, a PV rebinding, a node joining — so a
read-only collector can capture them as a snapshot whose digest is stable
between such events. False if: two captures minutes apart from an otherwise
unchanged cluster yield different digests. Settled by: run the collector twice,
ten minutes apart, against an idle cluster and compare `sha256sum` of the two
snapshots; unequal digests mean it is not pinnable.

## Why

Chapter 20 declares at `spec/v1/20-resolved-deployment.md:8-11`, as "the
load-bearing property of the whole specification", that *"Every assignment is a
pure function of Service Intent, the pinned Cluster Context, and the pinned
locks"* — then breaks it in its own normative `ResolvedService` example. At
`:246-249`, under `assigned:`, sits `observed: {node: enschede-t1000-1, because:
knowledge-vault-clone PV is bound here, moveRequires: state-move-plan}`, while
`inputDigests` at `:217` is `{intent, imagesLock}` with `contextRef` alongside
at `:216`. That PV binding is in none of them; it was read live. The collision
recurs across chapters: `spec/v1/10-service-intent.md:463` assigns `replicas`
"from `minAvailable` and capacity", while
`spec/v1/20-resolved-deployment.md:266` says such an assignment "would violate
purity outright". Two lenses found this (RED-002; DAT-006/7 — B2).

The unpinned reading costs a misdiagnosis, not an aesthetic breach. Property 1
of chapter 20 states a re-render mismatch "means an input was not pinned — which
is a defect in the lock, not in the render", and `spec/v1/50-lifecycle.md:19`
schedules the loop that tests it: "hourly, in-cluster -> re-apply MY applied
lock; idempotent". DAT-006 traced the consequence: once a node failure rebinds a
PV, that hourly render legitimately differs from the merge-time deploy with
every recorded digest identical — weather, reported as a lock defect. So the
snapshot is captured once, digested, pinned in the lock as `clusterStateDigest`
beside `intent` and `imagesLock`; assignments read only it; and the reapply
CronJob renders from that *same* snapshot, never observing afresh. A rebound PV
then surfaces as a new lock — a visible decision — not as drift.

This is not the existing health document promoted. `schemas/cluster-state.schema.json`
models `flux_ready`, `observed_image_digest`, `gatus_status`, `last_reconcile` —
fields chapter 20's table (`:194-200`) marks as live, impure, changing
"continuously" — and carries no PV binding and no node capacity, precisely the
facts the violations needed. The pinned input is a separate enumerated snapshot:
PV bindings with their nodes, node capacity against
`schemas/node-contract.schema.json`, current placements.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Read the live cluster at render time, record no digest | Keeps the status quo the review found: the hourly re-render diverges from the merge render with identical `inputDigests`, and property 1 classifies it as a lock defect. Every such incident costs an investigation of a lock that is correct | It is the defect B2 names; the diagnostic that pays for chapter 20 stops working exactly during a node failure |
| Reuse `cluster-state.schema.json` as the pinned input | Its digest moves whenever `flux_ready`, `gatus_status` or `last_reconcile` moves — every reconcile. Renders would never be byte-identical across two runs, and it still lacks PV bindings and capacity, so the assignments stay unexpressible | An input whose digest churns on health is not pinnable; adding the missing facts to it would make one document answer both "what is true" and "what was true when we decided" |
| Fold observed facts into the Cluster Context OCI artifact | Context is human-maintained and republished deliberately; PV rebinds are not. Every failover would block all deploys until someone republished and re-pinned Context — hours of estate-wide unavailability per node failure | Puts a machine-paced fact behind a human-paced release gate |

## Reversibility

Undo cost today: hours. No collector exists and `clusterStateDigest` is in no
schema, so undoing means dropping the field from the lock and artifact-contract
schemas, reverting the `## Cluster state` and `## Pinned inputs` sections of
`../../spec/v1/20-resolved-deployment.md`, and deleting the collector — four
files, no applied state.
Becomes irreversible once: locks carrying `clusterStateDigest` are applied and
the reapply CronJob renders from them. Past that point, removing the field makes
every historical lock un-re-renderable and every drift report unclassifiable.

## Consequences

- A read-only collector, its schema and its digest become prerequisites of every
  render, and its RBAC a new estate-wide read over PVs, nodes and pods — paid by
  the aggregator pipeline in wall-clock time and by whoever grades that read.
- A PV rebound after a node failure produces a new lock, not a silent
  correction — paid by the on-call operator, who must land it (with a
  `state-move-plan` where [0043](deferred/0043-delete-authority-durability-gate.md)
  requires one) before placement follows the data.
- Between captures the estate renders against facts that may already be stale —
  paid by anyone diagnosing a render that is correct as of its snapshot.
- Placement against a bound PV ([0017](0017-placement-by-capability.md)) and
  capacity-informed replicas become expressible without the spec contradicting
  itself — paid by joris in the chapter 10 and 20 rewrite.
- Reproducibility in chapters 20 and 30 becomes conditional on identical digests
  *including* `clusterStateDigest` — paid by every claim citing byte-identity.
