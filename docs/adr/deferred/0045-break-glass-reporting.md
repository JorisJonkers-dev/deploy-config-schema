---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#break-glass
rests-on: ["0008"]
---

# Break-glass exists, sticks, and reports itself

## Rests on

Because the applied lock is read from the objects' own annotations, an untested
rollback survives the next scheduled re-apply — and because nothing else observes that
divergence, it ends only when an alert says it has not. False if: an hour after a
break-glass apply of lock N−1 the objects carry merged pin N again, or the alert
resolves to no receiver. Settled by: on a vcluster, `workflow_dispatch` the deploy
with `lock: <N−1>`, wait one CronJob period, read `deploy.jorisjonkers.dev/lock` back
off the slice, then `amtool config routes test alertclass=urgent`.

## Why

Applying an older lock without tests is necessary for incidents. Under
[0041](0041-push-delivery-boundary.md) the normal rollback reverts the pin commit, so
the suite re-runs against the previous combination and the rollback is itself tested —
but that costs a suite run and a vcluster, which an incident does not have. So a
`workflow_dispatch` applies a named older lock directly. The estate has precedent for
both halves of the discipline (`spec/v1/50-lifecycle.md:191-193`):
`scripts/ops/mint-vault-metrics-token.sh` is documented break-glass,
`scripts/cutover/rollback-source.sh` an emergency rollback undoing itself on a failed
check.

The rollback **sticks**, which follows from where the record of what is live lives.
The reapply CronJob of [0044](0044-reconcile-cronjob.md) re-applies its own applied
lock, read from its objects' annotations (`deploy.jorisjonkers.dev/lock`,
`spec/v1/50-lifecycle.md:119`), never the globally newest one: that "would make this
scheduler fight the Aggregators, and would silently undo a break-glass rollback"
(`spec/v1/examples/rendered/reapply-cronjob.yaml:41`). A git-stored record of what is
live would have fought it.

The reporting is the decision. The old push-delivery ADR closed on the risk and
supplied no mechanism: *"An unreported break-glass state becomes the silent status
quo."* Everything around it stops at one run's visibility — the workflow emits
`::warning::BREAK-GLASS: applying … without tests` and passes `--break-glass` to a lag
report (`spec/v1/examples/workflows/aggregator-deploy.yml:57,128`), and the estate's
only other break-glass token is a CI summary enum (`actor_decision: "break-glass"`,
`schemas/gate-summary.schema.json:26`). Nobody reads a completed run. So a break-glass
apply raises an alert at the `urgent` Alert Class of
[0021](../0021-observability-scrape-and-alert-class.md), addressed to the owner and
expressed as the lag measurement already defined (`spec/v1/50-lifecycle.md:165`). It
fires until the applied lock equals the merged pin: clearing is a condition, not a
decision by whoever caused it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Leave reporting where it is: the `::warning::` line plus `actor_decision: "break-glass"` in the gate summary | zero build; visible for one run's log retention | this *is* the unreported state the old ADR named — the record expires while the divergence persists |
| Auto-expire: the CronJob returns to the merged pin after N hours | one CronJob branch plus a field, roughly half a day | destroys the sticking property that makes break-glass usable; an incident outlasting N hours re-breaks itself unattended — exactly `rollback-source.sh`'s undo-on-failed-check shape |
| Post to a channel from the workflow instead of raising an alert | one webhook, no rule to maintain | routing is estate knowledge per [0021](../0021-observability-scrape-and-alert-class.md); a named channel nobody reads fails identically to no report — Gatus monitoring 41 endpoints and notifying nobody is the estate's own proof |

## Reversibility

Undo cost today: nothing is built. The mechanism is one `PrometheusRule` in the
machinery render of [0058](0058-delivery-machinery-observability.md) plus the
`--break-glass` flag on the lag reporter — one template, one CLI flag, under a day,
blast radius one aggregator's alert routing. Becomes irreversible once: two
aggregators sit on break-glass locks at once. From there the merged pins and the
cluster have diverged in ways no single revert reconstructs, and the alert is the only
record of which divergence was deliberate.

## Consequences

- An incident is one `workflow_dispatch` away, with cluster write authority and no
  suite in front of it — paid by joris as operator, accepting an untested apply path
  for a rollback that lands in minutes.
- The rollback sticks because the applied lock lives in the objects, not in git — paid
  by joris, who gives up "git says what is live" for the class-A slice.
- An urgent alert fires while the cluster is behind the merged pin, including when the
  cause is not break-glass (a failed apply, a paused aggregator) — paid by whoever
  holds the receiver, in alert volume during an incident.
- Clearing is mechanical: ending a break-glass state takes a real merge and deploy,
  and the pre-flight rehearsal (`spec/v1/60-setup.md:156`) gains a second assertion —
  the alert fired — paid by joris.
- The mechanism is group-G scope and inherits the untested premise of
  [0008](0008-tested-equals-deployed-requires-push.md); if push delivery is cut per
  [0059](../0059-v1-scope-stopping-rule.md), Flux's rollback replaces it — paid by joris,
  as work built ahead of the experiment that justifies it.
