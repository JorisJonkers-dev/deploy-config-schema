---
tier: premise
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/00-overview.md#the-meta-model
---

# Three layers, with the middle layer as a contract

## Rests on

With deployment configuration split into **Service Intent** (hand-authored,
requirements only), **Resolved Deployment** (derived; holds every platform
decision) and **Deliverable Set** (serialization only, no decisions), every
field is assignable to exactly one layer, and the boundary is decidable by two
questions: must a human author it, and does it record a decision or merely
serialize one. False if: a field turns up that legitimately belongs to two
layers at once, or to none. Settled by: the estate already ran the
counter-experiment — two layers with resolution private to the renderer
produced three mutually incompatible documents all claiming
`deployment.jorisjonkers.dev/v2` (the shapes are itemised below); the failure
is on record and the two deciding questions have assigned every v1 field since.

## Why

Two layers were tried, and the record of the failure is specific. The estate
produced three mutually incompatible documents, all claiming
`deployment.jorisjonkers.dev/v2`: the service-repo authoring shape
(`spec.workloads` as a list), the collection shape (`spec.services` as a map),
and the resolved shape (`schemas/deployment.schema.json` — `spec.workloads` as
a map with `credentials[].claim`, `hooks` and `safety`; verified today, the map
sits at line 47 of that schema and those fields at lines 823, 1058 and 1104).
The estate documented the consequence as a trap rather than fixing it:
`validate deployment <file>` resolves to the third shape and rejects the first
on `/apiVersion`. A two-layer vocabulary could not even say which document was
wrong, because "the deployment" named all three.

Naming the middle layer turns two rules from aspirations into things that can
fail: Service Intent contains no mechanisms, and the Deliverable Set contains
no decisions. Every field is then assignable to exactly one layer, and a
reviewer can read a diff of the Resolved Deployment to see what the platform
decided on their behalf. The middle layer is a contract in the concrete sense:
it carries its own schema and its own version
([0029](0029-resolved-deployment-versioned-artifact.md)), it is derived from
the Intent plus the pinned inputs — the cluster-state snapshot among them
([0034](0034-cluster-state-pinned-input.md)) — and it is the sole input the
deliverable layer's adapters accept ([0053](0053-adapter-port-contract.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Two layers, resolution private to the renderer | fewest moving parts and nothing extra to version, but every field-placement question is re-litigated per PR, and rival document shapes accumulate with nothing to arbitrate between them | it is the shape that already produced the three rival `/v2` documents, and it leaves no vocabulary for deciding where a field belongs |
| Three layers, middle layer documented but unversioned | keeps the vocabulary while the renderer's actual output drifts from the documented shape, with no CI artifact to catch the drift | without a versioned artifact the boundary rule cannot fail, and a rule that cannot fail is a preference |

## Reversibility

Undo cost today: collapsing to two layers means deleting the Resolved
Deployment schema (`schemas/deployment.schema.json`, over 1,100 lines) and its
chapter (`../../spec/v1/20-resolved-deployment.md`), and re-founding every
decision that rests on this premise —
[0029](0029-resolved-deployment-versioned-artifact.md) and
[0052](0052-registered-adapters-are-v1.md) through
[0055](0055-bidirectional-ledgers.md); days of spec and schema work with the
whole render pipeline as blast radius.
Becomes irreversible once: parties outside this repository pin the Resolved
Deployment schema version or diff resolved artifacts in their own CI — the
middle layer is then a published contract whose removal breaks consumers this
repository cannot enumerate.

## Consequences

- A third schema to version and keep honest — paid by this repository's maintainers.
- `validate deployment` is ambiguous by construction and must be renamed per layer — paid by tooling authors and every script that spells the old name.
- Every platform decision lands in one reviewable, diffable document — paid by aggregators, whose pipelines must produce and publish it.
- Field-placement debates get a decidable answer — paid by authors of new fields, who must classify each one before it merges.
- Layer purity (no mechanisms in Intent, no decisions in the Deliverable Set) is enforceable in CI rather than aspirational — paid by CI wall time on every change.
