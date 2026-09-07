---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#delivery-classes
decided-in: JorisJonkers-dev/workspace#45
---

# Tested-equals-deployed cannot be had from pull alone

## Rests on

Under Flux pull delivery, the combination of artefacts that passed the system
tests cannot be made the combination that deploys: composition takes effect
without a merge, so there is no merge for a passing suite to gate what Flux
reconciles. False if: the wired suite can gate the same lock Flux deploys —
the lock is tested in CI, and the merge that passes gates the Flux source
update, giving tested-equals-deployed with no push machinery. Settled by:
[workspace#45](https://github.com/JorisJonkers-dev/workspace/issues/45) —
write the missing workflow caller, run the existing suite against the existing
pipeline, and observe whether tested≠deployed persists.

## Why

The estate has 147 system tests that have never gated a deployment. Flux
reconciles whatever the rendered tree contains, and the suite ran separately —
which in practice meant not at all. The old push-delivery ADR made this its
headline reason: *"A tested combination could not be the deployed
combination."* Making the thing that passed the tests also the thing that
deploys, it argued, requires the deployer to be the thing that ran them —
hence push. The pull model's obstacle is structural: composition is designed
so that no repository needs a merge before a change takes effect, and a gate
needs a merge to sit on. Gating under pull means introducing a merge in front
of the Flux source — at which point pull's distinguishing property is spent.

The counter-evidence is on record and must be stated as plainly as the
premise.
[workspace ADR-0010](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0010-system-tests-disposition.md)
examined the suite and found it is not rotten: *"CI compiles and lints all 32
classes on every PR; only execution is missing, because `tasks.test` calls
`excludeTags("system")`. Two dedicated tasks and two reusable workflows
already exist… Both have zero runs, ever - the only missing piece is a
caller."* That caller is filed as workspace#45 — open, priority P2 — and
writing it is an afternoon. The review's finding B1 weighed exactly this and
concluded that roughly a third of the review's total finding count sits under
this one premise: if the caller closes the gap, they are fixes for a design that should
not be built.

This premise is therefore decided-in-direction but untested, and proceeding on
it before #45 runs is exactly the pattern the review flagged. It stays `open`,
its falsification path is cheap and already filed, and
[0059](../0059-v1-scope-stopping-rule.md) makes group G conditional on the
result. A second, independent reason for aggregators — relationships have no
owner; 12 of the 32 system-tagged classes exercise `auth-api` *with its consumers*
— survives whichever way #45 lands and lives in
[0049](0049-aggregator-owned-tests.md), not here.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Rival premise: the gap is wiring, not architecture — test the lock in CI, let the passing merge gate the Flux source update | An afternoon for the caller (workspace#45) plus a required merge in front of the Flux source, spending composition's no-merge property on every change | Not rejected — this is the live falsification path; the premise stays `open` until the experiment runs, and group-G scope hangs on its outcome |
| Rival premise: the 147 tests are rotten, so tested-equals-deployed is moot either way | Nothing to build; the suite is abandoned | Falsified by [workspace ADR-0010](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0010-system-tests-disposition.md): all 32 classes compile and lint on every PR, two tasks and two reusable workflows exist, only the caller is missing |
| Rival premise: tested-equals-deployed is not worth having — deploy on trust and monitor | Cross-service regressions in the auth relationship set surface in production instead of CI | 12 of ~25 test classes exist precisely to catch provider-with-consumer breakage; discarding the estate's only cross-service evidence contradicts its own investment |

## Reversibility

Undo cost today: one frontmatter edit here plus scope notes on the decisions
resting on this premise — [0041](0041-push-delivery-boundary.md) through
[0045](0045-break-glass-reporting.md), plus [0048](0048-class-b-pinning.md),
[0051](0051-vcluster-substrate.md) and
[0058](0058-delivery-machinery-observability.md) — are superseded in scope per
[0059](../0059-v1-scope-stopping-rule.md). No delivery machinery exists yet; the
blast radius is documents, roughly a day. Becomes irreversible once:
aggregators are the only apply path for derived objects and Flux's class-A
reconciliation is dismantled — after that, the "existing pipeline" the
experiment needs is gone and the premise can no longer be tested cheaply.

## Consequences

- Every decision resting on this premise ([0041](0041-push-delivery-boundary.md)
  through [0045](0045-break-glass-reporting.md), [0048](0048-class-b-pinning.md),
  [0051](0051-vcluster-substrate.md),
  [0058](0058-delivery-machinery-observability.md)) inherits an untested
  foundation until workspace#45 runs — paid by joris, as rework risk across group G.
- The falsification experiment must actually run: one workflow caller, one
  suite execution against the existing pipeline — paid by joris, an afternoon
  plus one full test run.
- If #45 falsifies the premise, group G is cut per
  [0059](../0059-v1-scope-stopping-rule.md) and a third of the review's findings
  close unbuilt — paid by joris; the afternoon was the price of finding out.
- If the premise holds, the deployer must be the thing that ran the tests, and
  push machinery — per-aggregator RBAC, inventory, reapply, break-glass —
  enters scope with its operational weight — paid by joris as builder and
  operator.
- Aggregator repositories stay justified either way by the ownerless-
  relationship reason in [0049](0049-aggregator-owned-tests.md) — paid by
  joris, who scaffolds them regardless of #45's outcome.
