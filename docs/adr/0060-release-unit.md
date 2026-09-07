---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-07
normative: spec/v1/10-service-intent.md#release-units
rests-on: ["0003", "0005"]
---

# Several Services switch as one Release Unit

## Rests on
An all-or-nothing multi-Service cutover can be expressed as layer-1 intent plus
derived health gating, without naming a delivery mechanism. False if: expressing
the gate requires delivery-specific vocabulary — a Flux kind, a workflow step,
an applier identity — in any layer-1 or layer-2 field. Settled by: render a
two-member unit and hand the same derived gate to two different delivery
mechanisms — today's Flux (health checks on one Kustomization) and any future
push applier — and observe both honour it unchanged.

## Why
Some Services are one product in two processes. An API and its frontend ship
together: a new frontend against an old API, or the reverse, is a broken
product even though each pod individually reports healthy. The requirement,
stated by the owner on 2026-09-07, is that the model support deploying several
things as a single task — only once the API and the frontend are both healthy
does traffic switch to the new versions. The estate already contains the pairs:
the old delivery examples deployed `auth-api` and `auth-ui` as one set, and the
`stalwart` / `stalwart-provisioner` pair moves in lockstep for the same reason.

Until now that coupling lived only in delivery machinery — the deferred
aggregator design carried a `deploys` list that happened to hold both members.
Delivery is now defined separately from the model
([deferred/README.md](deferred/README.md)), so the model must carry the
coupling itself or lose it. A **Release Unit** carries it: each member Service
declares its unit by name in layer 1; composition materialises the set; the
derived gate is that **no member's new version receives traffic until every
member's new version is healthy**, health meaning the member's own declared
readiness ([0014](0014-probes-are-siblings.md)). If any member fails its
startup budget, no member switches and the old versions keep serving.

A Release Unit is not a Reconcile Unit
([0032](0032-reconcile-unit-derived.md)). The Reconcile Unit orders — postgres
before knowledge. The Release Unit is atomic — auth-api and auth-ui move
together or not at all. Ordering is derived from the dependency graph;
atomicity is declared, because releasing in lockstep is a product choice the
graph cannot see: the frontend depends on the API, but a dependency edge does
not mean the two must cut over together, and deriving atomicity from every
edge would turn the whole estate into one unit.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep the coupling in delivery config (the aggregator `deploys` list) | the guarantee lives outside the model; changing the delivery mechanism silently loses it | delivery is defined separately as of 2026-09-07; the model must be sufficient on its own |
| Derive units from `dependsOn` edges | every dependency becomes an atomicity claim; the transitive closure makes the estate one unit and every deploy estate-wide | over-derivation — lockstep release is a choice, not a graph property |
| No units: independent rollouts plus mandatory expand/contract per change | every API change must tolerate the old frontend and vice versa, per change, forever | right discipline for contract changes, but taxing every UI/API pair for it makes the common case harder than the rare one |

## Reversibility
Undo cost today: delete the field; every member rolls independently again — an
hour, no data movement. Becomes irreversible: never structurally, but once
service repositories declare units, removing the concept reintroduces the
manual release coordination it replaced, one incident at a time.

## Consequences
- A unit switches at the speed of its slowest member's health gate — paid by
  every member's owner, in rollout latency.
- One failing member blocks the whole unit's cutover while old versions keep
  serving; that is the point, and it makes the blast radius of a bad member a
  held release rather than a broken product — paid by whoever ships the
  failing member, who now blocks their neighbours visibly.
- Whatever delivery mechanism is eventually defined must implement
  all-or-nothing switchover for units; this is one of the model's three hard
  demands on the deferred delivery work
  ([deferred/README.md](deferred/README.md)) — paid by the future delivery
  definition.
- Rollback is unit-scoped: reverting one member means reverting the unit —
  paid by incident responders, in larger but consistent rollback scope.
- A Service belongs to at most one unit, and a unit spanning deployer
  boundaries is invalid by construction once delivery is defined — paid by
  authors, in one more composition invariant.
