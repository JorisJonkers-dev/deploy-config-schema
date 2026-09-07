---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#pinned-inputs
---

# Every assignment is a function of pinned, digested inputs

## Rests on

The pinned input set — Service Intent, the Cluster Context, the locks, and a
ClusterState snapshot, each carried by digest — is closed: no layer-2 assignment
reads anything outside it at render time. False if: any assignment consults live
cluster state, a mutable pool, a counter, or state remembered between renders.
Settled by: a double-render determinism test — render twice from identical pinned
inputs (clusterStateDigest included), at different times and on different
machines, and byte-diff the output trees; any difference falsifies the premise.

## Why

The previous formulation was absolute and was falsified by its own chapter.
`spec/v1/20-resolved-deployment.md:8-11` declared, as "the load-bearing property
of the whole specification", that *"Every assignment is a pure function of
Service Intent, the pinned Cluster Context, and the pinned locks."* Yet the same
chapter's normative `ResolvedService` example (`:246-249`) carries an observed PV
binding — `node: enschede-t1000-1`, `because: knowledge-vault-clone PV is bound
here` — while `inputDigests` is `{intent, imagesLock}` with `contextRef`
alongside (`:216`): the binding is in none of the pinned inputs and is read from
the live cluster. A third instance sat unresolved across chapters:
`spec/v1/10-service-intent.md:463` assigns `replicas` "from `minAvailable` and
capacity" while `20-resolved-deployment.md:266` says a `replicas` assignment
reading live capacity "would violate purity outright". Two review lenses found
this independently (RED-002; DAT-006, DAT-007 — consolidated finding B2).

The property is worth repairing rather than dropping because of what the false
version costs. The chapter's diagnostic rule — a mismatch "means an input was not
pinned — which is a defect in the lock, not in the render" — misleads exactly
when it matters: DAT-006 showed the hourly in-cluster re-render from a pinned
lock can legitimately produce a different tree than the merge-time deploy after a
PV rebinds following a node failure, with every digest identical. Reproducibility
fails at the moment it is most needed, and the report blames the lock.

The repair enlarges the input set instead of weakening the claim. A ClusterState
snapshot with its own digest ([0034](0034-cluster-state-pinned-input.md)) joins
Intent, Context and the locks. Placement against a bound PV and
capacity-informed replica assignment become expressible — they read the
snapshot, never the live cluster. Reproducibility becomes conditional and true:
identical inputs *including* `clusterStateDigest` produce byte-identical output,
so a differing render with identical digests is once again a defect, never
weather. Anything a future assignment needs must first be added to a pinned
input; nothing is read ad hoc.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Absolute purity: observed state expelled from layer 2 entirely | Placement pinned to a bound PV and replicas-from-capacity become inexpressible in the layer that records every platform decision; the pressure that produced the `20:246-249` and `10:463` violations returns unchanged | The spec already broke this rule twice in its own normative text; expelling the values removes neither the need for them nor the temptation |
| No determinism claim at all | The mismatch-means-lock-defect diagnostic dies; a differing re-render cannot be classified as defect versus drift; `renderHash` and publish-back guarantees lose their meaning | Gives up the one property the whole chapter-20 design exists to provide |
| Remembered assignment state (an allocation registry) in layer 2 | A render is no longer a function of its inputs; reproducing any historical render requires replaying registry history; published-back assignments can drift | Reintroduces exactly the mutable state the layer was defined to exclude |

## Reversibility

Undo cost today: hours of spec edits — restate the rule at
`../../spec/v1/20-resolved-deployment.md` and rewrite the reproducibility wording
there and in chapter 30; [0034](0034-cluster-state-pinned-input.md), which rests
on this premise, would need reworking. No snapshot-capture code exists yet, so
the blast radius is documents plus that one dependent decision.
Becomes irreversible once: the double-render determinism test gates CI and
`resolved.yml` artifacts carrying `clusterStateDigest` are published back into
service repositories — weakening the premise after that silently reclassifies
defects as weather across the estate.

## Consequences

- Snapshot capture and digesting join the render path; every deploy render waits
  on it — paid by the aggregator pipeline in wall-clock time and by its
  maintainer.
- Reproducibility claims in chapters 20 and 30 must be restated as conditional on
  `clusterStateDigest` — paid by joris in the spec rewrite pass.
- The hourly reconcile re-render must render from the recorded snapshot, not a
  fresh one, or drift detection re-reports weather as lock defects — paid by the
  implementer of [0044](deferred/0044-reconcile-cronjob.md).
- Placement and replica assignment become expressible without the spec
  contradicting itself (`10:463` vs `20:266`) — paid by
  [0034](0034-cluster-state-pinned-input.md), whose snapshot schema must carry PV
  bindings and capacity facts.
- The input set is closed, so every new assignment need becomes a schema change
  to a pinned input before it becomes a feature — paid by whoever adds the next
  assignment.
