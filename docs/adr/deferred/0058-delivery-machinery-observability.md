---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#machinery-observability
rests-on: ["0008"]
---

# The delivery machinery watches itself

## Rests on

Nothing today notices when the delivery machinery stops working: no page, mail or
dashboard change follows a reapply CronJob that has stopped scheduling, a
composition that produced no lock, or a slice weeks behind. False if: a wedged
machinery component notifies a human without anyone opening an Actions run.
Settled by:
`kubectl patch cronjob deployer-auth-federation-reapply -n deploy-system -p '{"spec":{"suspend":true}}'`,
then wait three hours and record every notification received, from any channel.

## Why

Routing was derived from fields only a Service carries. The old observability
record ends its decision at *"notifier routing from the Alert Class and owner"*,
and both are Service intent ([0021](../0021-observability-scrape-and-alert-class.md)).
The reapply CronJob, the composition workflow, the relationship gate and the deploy
job are not Services: no Alert Class, no owner, no derived route. Their only
failure signal is a red GitHub Actions run, in an estate whose own record says a
routinely-red PR is what people learn to ignore — and `failedJobsHistoryLimit: 3`
(`spec/v1/examples/rendered/reapply-cronjob.yaml:22`) means the fourth consecutive
failure erases the evidence of the first.

Its failure mode is silence, not noise. The rendered guard runs at
`schedule: '23 * * * *'` with `concurrencyPolicy: Forbid`
(`reapply-cronjob.yaml:19-20`) and no `startingDeadlineSeconds`: the controller
stops scheduling permanently once it has missed more than 100 start times with no
deadline set, by setting a condition nothing here watches. Four days of node
downtime, or one hung run under `Forbid`, and the estate's only continuous drift
correction ([0044](0044-reconcile-cronjob.md)) stops forever — the cluster
diverges from its lock silently, the exact condition that CronJob exists to make
impossible. Composition fails the same way from the other side: estate-wide
fail-closed, so one version-skewed fragment yields no `ComposedIntent`, nothing
renders, and no object anywhere reports it.

The lag measure gets its home here. The old push-delivery record traded away a
single answer to what is live and offered one compensation — *"Lag is measured
instead"* — but `apply lag` runs as a step of the deploy job
(`spec/v1/examples/workflows/aggregator-deploy.yml:127`), so it is computed
exactly when a deploy has just succeeded and never when an aggregator's gate has
been red for a week, its runner is offline, or its Renovate PR was closed: the
failure mode it exists to detect is the only one during which it does not run. So
machinery components carry the same scrape-surface-plus-Alert-Class vocabulary as
Services, and four conditions — missed or failed CronJob run, composition failure,
participant staleness past [0038](../0038-participants-list-staleness.md)'s `maxAge`,
lag beyond bound — each carry an urgent class and an owner, lag evaluated
cluster-side over the minimum lock annotation, not on the deploy path.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Leave machinery signalling to red GitHub Actions runs | zero build; it is the status quo | A red run is a pull signal in a repository nobody opens on a quiet day, `failedJobsHistoryLimit: 3` destroys the first failure by the fourth, and it cannot report a job that never started |
| Model each machinery component as a Service so it inherits the Service vocabulary | one Service entry per CronJob, workflow and gate — six aggregators, four components each | Most Service fields are meaningless for a workflow (exposure, probes, grants), and composition would depend on the machinery being a participant in the estate it composes |
| An external dead-man's switch as the whole answer | one third-party account, a heartbeat token per aggregator, roughly a day | Detects the missed run and nothing else — blind to composition failure, staleness and lag. Kept as one of the four signals; rejected as the mechanism |

## Reversibility

Undo cost today: nothing is built. Machinery components carry no Alert Class at
all, so undo is one field removed from the aggregator schema, the machinery rules
dropped from the render, and the lag query returned to the deploy job — under a
day across two adapters, blast radius the estate returning to its current silence.
Becomes irreversible once: these alerts are the on-call path for drift correction
and aggregator owners have stopped watching Actions runs for it. Removing them
then leaves the thing that deploys everything unwatched, with no habit left.

## Consequences

- Four machinery conditions gain an urgent class and a named owner, and someone is
  woken for a CronJob that did not fire — paid by joris, owner of all four.
- Machinery rules need CronJob and Job state scraped and a receiver for a class no
  Service routes to — paid by the metrics stack and its Alertmanager config.
- Lag moves off the deploy path into a cluster-side query: one more object per
  aggregator — paid by the cron and rbac adapters.
- The gate and composition run outside the cluster, so their signal is a heartbeat,
  not a scrape — paid by the workflow templates ([0037](../0037-composition-oci-fragments.md)).
- Deliberate maintenance — a suspended CronJob, a dormant participant — pages unless
  silenced first, a ledger entry ([0055](../0055-bidirectional-ledgers.md)) — paid by the maintainer.
- A conflict "reported" by `--on-conflict report` (`reapply-cronjob.yaml:58`) becomes
  a routed alert, not a log line — paid by whoever hand-edited the field ([0046](0046-distinct-field-managers.md)).
