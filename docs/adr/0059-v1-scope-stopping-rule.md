---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-07
normative: spec/v1/00-overview.md#programme-scope
rests-on: ["0001"]
---

# v1 has a scope and a stopping rule

## Rests on
The model alone — with no new delivery machinery — is independently useful: it
can render today's estate and be delivered by today's Flux pipeline unchanged.
False if: rendering the live estate from intent requires any decision in
[deferred/](deferred/README.md). Settled by: render the live estate from
layer-1 intent, deliver it through the existing Flux tree, and diff the result
against the hand-written manifests it replaces.

## Why
Nineteen prior ADRs and eight chapters contained no build estimate, no budget
and no stopping rule, and the architecture review's read of the most likely
failure was *"not collapse but partial completion with both delivery models
live."* The first draft of this rebuild repeated the mistake at a smaller
scale: it defined a "core" and a "group G" that did not partition the decision
set, leaving six ADRs on neither side.

On 2026-09-07 the owner drew the line that removes the ambiguity: **how the
estate deploys, and how dependency-on-other-units-for-testing gates a deploy,
are defined separately from the model.** The partition is now structural, not
enumerated: every ADR in `docs/adr/` is v1 model scope — the eight premises
(0001–0007, 0009) and the decisions 0010–0040, 0052–0057, 0059 and
[0060](0060-release-unit.md) — and every ADR in
[deferred/](deferred/README.md) (0008, 0041–0051, 0058) is out of v1,
parked as direction work for the separate delivery-and-testing definition. A
future decision moves a file across that boundary or it does not move at all.

The model makes exactly three demands on whatever delivery is eventually
defined, and they are model decisions, not delivery ones: all-or-nothing
Release Unit cutover ([0060](0060-release-unit.md)), destructive operations
gated by Durability Class ([0015](0015-durability-class-per-volume.md)), and
rendering only from pinned, digested inputs ([0006](0006-pinned-inputs.md)).
Anything else the delivery definition chooses — push or pull, who applies,
what prunes, what reconciles — is its own business, informed by the parked
direction work and by the experiment in
[workspace#45](https://github.com/JorisJonkers-dev/workspace/issues/45),
which no longer gates v1.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Ship model and delivery together, as the first draft did | v1 completes only when the hardest, least-tested half completes; partial completion leaves two delivery models live — the named failure mode | the model is useful under today's Flux without any of it |
| No stopping rule, scope by enumeration | the enumeration drifted within one draft (six ADRs unplaced); every addition reopens the boundary | a structural boundary (directory membership) cannot drift |
| Cut the deferred work permanently | loses evidenced direction work (the class-B pinning evidence, the prune-order analysis) that the future definition needs | deferring is cheaper than re-deriving; the files cost nothing parked |

## Reversibility
Undo cost today: move files between `docs/adr/` and `deferred/` and update two
READMEs — minutes. Becomes irreversible: it does not; the boundary is the one
deliberately cheap-to-move line in the set. What does harden is the model's
three demands: once service repositories author Release Units and Durability
Classes, a delivery definition that ignores them breaks declared intent.

## Consequences
- v1 ships when the model renders the live estate under unchanged Flux
  delivery; no deferred decision can block it — paid for by accepting today's
  delivery properties, including its known gaps, until the separate definition
  lands.
- The deferred set is taken up only after
  [workspace#45](https://github.com/JorisJonkers-dev/workspace/issues/45) runs
  and [deferred/0051](deferred/0051-vcluster-substrate.md)'s measurement
  exists; review date 2026-11-30 — deferred work still unstarted then is cut
  from planning, not extended — paid by joris, who owns the date.
- Live-defect fixes ride independently of both scopes: the foundation pinning
  evidence in [deferred/0048](deferred/0048-class-b-pinning.md) and this
  repository's own unpinned CI are operational fixes that proceed regardless —
  paid by joris, now.
- The three demands above are the complete interface between the scopes; a
  delivery definition needing a fourth must amend the model first — paid by
  the future delivery author, in one extra ADR.
