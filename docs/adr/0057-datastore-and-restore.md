---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/60-setup.md#platform-facts-and-restore
rests-on: ["0002"]
---

# Datastore, server count, and restore are recorded platform facts

## Rests on
A `local-path` PersistentVolume can be restored to a running Workload from the
daily node backup, and the time that takes is measurable. False if: a drill
cannot reconstruct the volume at all — no per-claim file exists in the
off-cluster copy, or the most recent node backup is already younger than the
loss it must undo. Settled by: one performed drill — provision a claim declared
`irreplaceable` outside production, destroy it, restore it from the most recent
node backup, and record two numbers, wall time to a passing readiness probe and
the age of the recovered data. Those numbers become the RTO and the observed RPO
in `../../spec/v1/60-setup.md`; a drill that cannot complete falsifies this
record rather than adjusting it.

## Why
None of the three facts is expressible in any schema here.
`schemas/platform.schema.json` requires only `version`, `name` and `domain`; its
`cluster` object carries `kind` (`k3s | kubernetes | custom`), `api` and
`bootstrap`, and nothing else. `$defs/host.roles` is an unconstrained array of
identifiers, so `k3s-control-plane` is a spelling convention rather than a
validated fact and nothing constrains how many hosts carry it — all three
platform fixtures carry exactly one
(`fixtures/platform/single-node.platform.yaml:30`, `full-tree.platform.yaml:42`,
`multi-site.platform.yaml:37`). Whether that single server keeps cluster state
in SQLite or embedded etcd decides whether `k3s etcd-snapshot` exists at all,
and the review could determine neither the datastore nor the k3s version from
anything in this repository. Server flags are the same gap: there is no k3s
server configuration in-tree, and `spec/v1/60-setup.md:147` says as much about
the one flag already load-bearing — *"no `--secrets-encryption` configuration
exists in-tree today"*. [0028](0028-secrets-at-rest-gate.md) makes the renderer
refuse `delivery: env|file` on a fact whose only source is a flag nobody
records, and [0036](0036-cni-selection.md) must be evaluated against a pinned
k3s version that is written down nowhere.

Restore is worse: it does not exist as a concept in this repository. A grep for
`restore`, `RPO` and `RTO` across `src/`, `schemas/` and `spec/` returns two
hits, both about re-applying Flux manifests (`spec/v1/60-setup.md:96`, `:107`);
no hit concerns data. [workspace
ADR-0011](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0011-backup-coverage-gaps.md)
records that *"PVC-level snapshots are impossible here: no VolumeSnapshot CRDs,
and `local-path` has no CSI snapshot support. The job that pretended otherwise
was deleted."* What remains is one off-cluster copy from the daily node backup.
The three application-level backup jobs gained dated archive copies with
age-based retention when
[workspace#48](https://github.com/JorisJonkers-dev/workspace/issues/48) closed
on 2026-08-27 — 30 days for `postgres` and `rabbitmq-definitions`, 14 for
`vault` — but no such history exists for an arbitrary `local-path` claim, which
is exactly what a Durability Class promises. The pre-flight checklist at
`spec/v1/60-setup.md:141-155` has seven items and rehearses exactly one thing,
*"a break-glass rollback… not just written"*, which re-applies a lock and
restores no data. Against that, `knowledge-vault-clone` is declared `durability:
irreplaceable` on `local-path`, and it is a personal knowledge vault.

So the facts get a home and the restore gets a rehearsal. Platform intent gains
four required cluster facts — datastore kind, server count, k3s version, and the
server flag set — read by the pre-flight and by any decision that turns on them,
instead of discovered by an ssh session per question. RPO is stated rather than
measured: **24 hours**, the daily node backup's period, and a Workload wanting
better declares its own application-level backup, which is what `recoverable`
renders under [0015](0015-durability-class-per-volume.md). RTO is not asserted
at all — the drill produces it or there is no number. And an eighth checklist
item joins the seven: a restore of a `local-path` volume has been rehearsed
before the first production apply of an `irreplaceable` one. Recording the facts
does not choose them; a one-server SQLite cluster stays a one-server SQLite
cluster, but stops being an assumption each reader re-derives.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Leave the facts undeclared and discover them by ssh when a question needs them | Zero today. Every later question that turns on them — does `etcd-snapshot` exist, is a second server addable, is `--secrets-encryption` on — repeats the same investigation, and 0028's gate has no input it can read | The review already paid this cost and could answer none of the three from the repository; the facts are load-bearing for [0028](0028-secrets-at-rest-gate.md), [0036](0036-cni-selection.md) and [0043](deferred/0043-delete-authority-durability-gate.md) |
| Derive the server count by counting hosts whose `roles` contain `k3s-control-plane` | Nothing to build; three fixtures already satisfy it | `roles` is an unvalidated identifier array — a typo yields zero control planes and no error — and the datastore and k3s version stay unknowable either way |
| State an RTO from the backup design and skip the drill | Free; a number lands in the spec this week | An unrehearsed restore is `rollbackTargetRetention` again, the inert attestation [0015](0015-durability-class-per-volume.md) exists to end; the daily node backup can already be younger than the loss it is supposed to undo |
| Buy real durability first — a CSI with snapshots, or Longhorn — then record facts | A second storage layer and its replicas on a one-server cluster, plus the CRD and upgrade surface [0002](0002-kubernetes-as-substrate.md) counts as the expensive part of the substrate | Does not remove the need for the facts, and defers the drill behind a project; the drill is an afternoon |

## Reversibility
Undo cost today: about a day, blast radius confined to platform authoring — four
properties in the `platformJsonSchema` literal at `src/schemas/platform.ts`,
from which `schemas/platform.schema.json` is regenerated by
`scripts/generate-schemas.ts`, three fixture files that must gain values, and
one checklist item in `spec/v1/60-setup.md`. The drill is not undoable and is
not meant to be: it either produced numbers or it did not.
Becomes irreversible once: an `irreplaceable` volume has been applied in
production under this record. From then the recorded facts are the only written
description of how that data comes back, and removing them removes the recovery
path rather than a schema field.

## Consequences
- Platform intent gains four required fields; the three fixtures and the live platform file must be filled in before anything validates again — paid by joris, in one editing pass.
- [0028](0028-secrets-at-rest-gate.md) and [0036](0036-cni-selection.md) get a declared k3s version and flag set to read, so neither settles against an ssh session — paid for out of this record, spent by whoever settles them.
- The first production apply of an `irreplaceable` volume waits on a drill; the knowledge vault waits on a lab afternoon — paid by joris, in schedule.
- RPO 24 h is a stated ceiling, not a guarantee: only the three jobs fixed by [workspace#48](https://github.com/JorisJonkers-dev/workspace/issues/48) keep dated history; every other `local-path` claim is recoverable only from the daily node backup — paid by every owner of an `irreplaceable` volume.
- No recovery-time commitment exists until the drill runs, and this record refuses to invent one — paid by joris, who owns the open claim.
- The single-server, single-datastore shape becomes explicit rather than incidental, so designs resting on [0002](0002-kubernetes-as-substrate.md) stop hedging about HA that is not there — paid by future decision authors, in narrowed options.
