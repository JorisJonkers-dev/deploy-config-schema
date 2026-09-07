---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#field-ownership
rests-on: ["0002"]
---

# Every applier has its own field manager, serialised by a lease

## Rests on

Two writers of one object cannot silently overwrite each other when their
field-manager names differ and neither forces conflicts, and a
`coordination.k8s.io` Lease serialises this estate's two appliers. False if: an
apply under `cron:<agg>` changes a field owned by `deploy:<agg>` with no
reported conflict, or the two overlap while both honour the lease. Settled by:
on a k3d vcluster, apply the `auth-federation` slice as
`deploy:auth-federation` at lock N, re-apply from lock N−1 as
`cron:auth-federation` expecting a reported conflict, then fire the CronJob 10s
into a 90-second apply.

## Why

The two writers most likely to collide were given the same name on purpose. The
merge deploy passes `--field-manager auth-federation`
(`spec/v1/examples/workflows/aggregator-deploy.yml:103`); the hourly re-apply
CronJob passes the same string
(`spec/v1/examples/rendered/reapply-cronjob.yaml:57`). Chapter 50 makes the
conflict a justification for the whole model: it *"means a human edited a field
this aggregator owns: it is reported, never resolved with `--force-conflicts`.
That is one thing this model does better than continuous reconciliation, which
would silently revert the edit"* (`spec/v1/50-lifecycle.md:152-154`). One
shared name switches that off between exactly these two.

Neither is serialised against the other. The CronJob's `concurrencyPolicy:
Forbid` on an hourly schedule
(`spec/v1/examples/rendered/reapply-cronjob.yaml:19-20`) serialises it against
itself; the workflow's `concurrency` group (`aggregator-deploy.yml:35-39`)
serialises the deploy against itself. The review's sequence: the deploy applies
200 of 364 objects at lock N and fails; the CronJob fires at :23, reads its
lock from annotations chapter 50 itself calls heterogeneous — lag is *"the
minimum lock annotation across an aggregator's objects"*
(`spec/v1/50-lifecycle.md:165`) — and applies the other lock over the remaining
half, hourly, unrecorded.

So each applier gets its own manager, `deploy:<agg>` and `cron:<agg>`; neither
passes `--force-conflicts`, and a conflict fails the step. A Lease per
aggregator in `deploy-system` is taken before the first apply and released
after verify; whichever process cannot acquire it applies nothing, and for the
CronJob the next hour is the retry. Both appliers already run under the
aggregator ServiceAccount on a runner *"inside the cluster"*
(`spec/v1/50-lifecycle.md:195-198`), so the Lease is reachable from both. Which
lock the CronJob picks is decided in [0044](0044-reconcile-cronjob.md); this is
half of what makes [0002](../0002-kubernetes-as-substrate.md)'s second property
real, and [0047](0047-namespace-per-deployer.md) is the other half.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the shared name, add only the Lease | one Lease and one RBAC rule; no rename, no ownership migration | it closes the concurrent window and leaves the sequential one: a CronJob running an hour after a failed deploy still overwrites the newer half with no conflict, because the API server sees one manager |
| Distinct names, `--force-conflicts` on the CronJob so drift correction never stalls | a flag on one call site | that is the silent revert chapter 50 claims this model avoids, made worse: the conflict is raised, discarded, and the log says "reconciled" |
| Serialise with a fixed-name Job or a ConfigMap flag rather than a Lease | a hand-made lock with no TTL: a crashed applier holds it until someone clears it | `Lease` already has `leaseDurationSeconds` and a holder identity the API server renews and expires; re-implementing that is more code and less correct |

## Reversibility

Undo cost today: two call sites (`aggregator-deploy.yml:103`,
`reapply-cronjob.yaml:57`), the lease acquire/release around the apply command,
and one rule in the rendered deployer RBAC — a two-line diff and a re-render
per aggregator, under an hour, one aggregator at a time. Becomes irreversible
once production objects carry `managedFields` entries under both `deploy:<agg>`
and `cron:<agg>`: collapsing back to one name orphans the other manager's
entries, and ownership must be reclaimed field by field.

## Consequences

- A stale re-apply fails loudly instead of rolling half a slice back — paid by
  the aggregator on call, who gets a red CronJob hourly until the lock is fixed.
- Drift correction is skipped while a deploy holds the lease, so the reconcile
  guarantee weakens to "hourly unless deploying" — paid by whoever reads lag.
- The first apply under the new names meets `auth-federation` owning every
  field, so each aggregator needs one supervised ownership migration, and the
  RBAC adapter grows a `coordination.k8s.io` rule — paid by the platform owner
  and adapter maintainers.
- A conflict is only a signal if someone reads it, and a break-glass rollback
  now waits on the lease like any applier
  ([0045](0045-break-glass-reporting.md)) — paid by the platform owner, via
  [0058](0058-delivery-machinery-observability.md).
