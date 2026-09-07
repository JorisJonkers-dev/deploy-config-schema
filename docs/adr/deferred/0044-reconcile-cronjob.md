---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#reconciliation
rests-on: ["0008"]
---

# Reconciliation is an in-cluster CronJob per Aggregator

## Rests on

A CronJob object in the cluster fires within one period of the schedule it
declares, where a GitHub Actions schedule does not. False if: over fourteen days
the reapply CronJob's `lastScheduleTime` lags its hourly slot as badly and as
often as the estate's Actions crons do. Settled by: sample
`kubectl get cronjob -n deploy-system -o jsonpath='{.items[*].status.lastScheduleTime}'`
against `date` for fourteen days, beside the same window's `workflow_run`
timestamps for any scheduled workflow in the estate.

## Why

Push delivery buys tested-equals-deployed and gives up what a pull loop had for
free. The old push-delivery record named the loss without softening it:
*"Continuous reconciliation. Replaced by an in-cluster CronJob per aggregator
re-applying its own lock."* The obvious replacement — a scheduled workflow — was
rejected on the estate's own measurement, quoted there and carried into
`spec/v1/50-lifecycle.md:140`: *"Scheduled workflows fire far less often than
their cron says… four to seven runs per repo per day regardless of the declared
interval… Crons also run late by hours. Never build anything needing prompt
reaction on a schedule alone, and do not raise the frequency to compensate."*
Drift correction *is* a reaction to something having gone wrong, so it is exactly
what that trap forbids putting on an Actions schedule. A cluster cron fires when
it says it does, costs no Actions minutes, and is the pattern
`vault-metrics-token-renewal` already uses. The rendered example runs at
`'23 * * * *'` with `concurrencyPolicy: Forbid`
(`spec/v1/examples/rendered/reapply-cronjob.yaml:19-20`) under the merge apply's
own ServiceAccount, re-applying the lock read from *its own* objects' annotations
— not the globally newest, which would make the scheduler fight the Aggregators
and undo a break-glass rollback ([0045](0045-break-glass-reporting.md)).

The loop renders from the same pinned inputs as the merge deploy, including the
`clusterStateDigest` of [0034](../0034-cluster-state-pinned-input.md). Without it it
can diverge legitimately and be misreported: finding B2 traced the case where a
PV rebinds after a node failure, the hourly render observes the new binding, and
the tree differs from the merge-time tree with every recorded digest identical —
which chapter 20's property 1 diagnoses as *"a defect in the lock, not in the
render"*. Reading the pinned snapshot makes that impossible: a rebound PV becomes
a new lock — a visible decision — not hourly drift nobody can explain.

Two gaps in the rendered guard are closed here. It carries no
`startingDeadlineSeconds` and no `activeDeadlineSeconds` (K3S-017), so after 100
missed start times the controller stops scheduling entirely, setting a condition
nothing watches — four days of node downtime, or one wedged run under
`concurrencyPolicy: Forbid`, and the estate's only drift correction is off
forever. Setting both bounds the miss and turns it into a countable
`MissedSchedule` event. And the reapply and the merge apply deliberately share
the field-manager name `auth-federation` (`reapply-cronjob.yaml:57`,
`aggregator-deploy.yml:103`), so server-side apply cannot report a conflict
between the two writers most likely to collide — the drift property the substrate
was chosen for. Distinct managers and a serialising Lease come from
[0046](0046-distinct-field-managers.md); the loop's own failure is silent by
construction, so [0058](0058-delivery-machinery-observability.md) gives it an
owner and an Alert Class.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| GitHub Actions scheduled workflow | ~zero build: one workflow file per aggregator, reusing the existing deploy job | The estate measured four-to-seven runs per day regardless of declared interval, late by hours. Drift would be corrected on an unbounded delay, which is the one thing drift correction cannot tolerate |
| A watching controller (continuous reconciliation) | build and operate a controller per estate, plus its own RBAC, leader election and upgrade path | It silently reverts a human's edit instead of reporting it; server-side apply conflict reporting is the property push delivery gains, and a watcher spends it |
| Re-apply the globally newest composed lock | none extra — the CronJob already pulls a lock | It makes the scheduler race the Aggregators and silently undoes a break-glass rollback, turning the incident path into a two-hour window |

## Reversibility

Undo cost today: one rendered Deliverable per aggregator (61 lines in
`spec/v1/examples/rendered/reapply-cronjob.yaml`) plus one adapter branch.
Removing it is `kubectl delete cronjob -l deploy.jorisjonkers.dev/aggregator`
plus a render change — under a day, blast radius drift uncorrected until merge.
Becomes irreversible once: the annotated applied-lock is the only record of what
is live for the 364 class-A objects. Returning to a pull loop then means
reconstructing Flux Kustomization inventories for all of them, and every
hand-edit the CronJob has quietly overwritten surfaces at once.

## Consequences

- Drift on a class-A slice is corrected within an hour instead of at the next merge — paid by the Services in that slice, which gain a bounded staleness where they had none.
- Roughly six CronJobs must be rendered, pinned and kept current, each with an image, a ServiceAccount and a lock read path — paid by the `rbac` and cron adapters and whoever maintains them.
- `startingDeadlineSeconds` makes a long outage produce refused jobs and `MissedSchedule` events rather than silence — paid by whoever answers the alert [0058](0058-delivery-machinery-observability.md) requires.
- The reapply and the merge apply now need distinct field managers and a Lease — machinery neither needed while they shared a name — paid by the deploy adapter.
- Re-applying its own annotated lock means a break-glass rollback survives the next tick — paid by the incident responder, who gains it, and by the aggregator owner, who must clear the break-glass state deliberately.
- This loop measures nothing about lag: a slice can sit at a stale lock indefinitely and the CronJob will keep re-applying it happily — paid by the aggregator owner, who carries lag measurement separately.
