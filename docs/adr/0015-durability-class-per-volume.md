---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#storage-and-durability
rests-on: ["0005"]
---

# Every volume declares a Durability Class

## Rests on

What a volume's data is worth cannot be inferred from anything the platform can
observe about it. False if: a rule over cluster-observable facts alone — size,
storage class, access mode, mount path, `stateful` — reproduces the owners'
classification of every PVC in the estate. Settled by: classify all fourteen
PVCs from `kubectl get pvc -A -o json` and the rendered Workloads only, then
diff against the owners' declarations; one mismatch on a volume an owner calls
`irreplaceable` settles it.

## Why

There is no platform-level durability here to fall back on. Storage is
`local-path`, not Longhorn: all fourteen PVCs are `ReadWriteOnce`, and
[workspace ADR-0011](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0011-backup-coverage-gaps.md)
records that *"PVC-level snapshots are impossible here: no VolumeSnapshot CRDs,
and `local-path` has no CSI snapshot support. The job that pretended otherwise
was deleted."* Two consequences follow: a volume pins its workload to one node
permanently, which is why a state-move-plan exists at all, and retention can
only be an application-level backup job. The only durability a volume gets is
what someone asks for by name.

`rollbackTargetRetention` was the previous answer and it did nothing. It is
validated for `minimumDays >= 90` and `acknowledged: true`
(`src/deployment/v2-model.ts:182-187`), appears in the readiness scorecard as
`rollback_retention_acknowledged` (`schemas/readiness-scorecard.schema.json:13`),
is documented in three `PLATFORM.md` files as failing *"never"*, and is read by
no renderer or adapter. Every service declares the identical `{minimumDays: 90,
acknowledged: true}`, and nothing states whether it retains images or data — a
ninety-day rollback guarantee a snapshot-less cluster with fixed-filename backups
cannot provide. A Durability Class per volume — `reconstructible`, `recoverable`,
`irreplaceable` — replaces it, naming the one fact only the owning Service knows
([0005](0005-derivation-is-total.md)) and leaving schedule, sweep and destination
derived. [Workspace ADR-0011](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0011-backup-coverage-gaps.md) already used the vocabulary in prose — *"Valkey is
deliberately unbacked as reconstructible cache"* — and the option it
recommended, a backup job with a retention sweep, is what `recoverable` renders.

The honest position: as of this record `durability` renders nothing.
`grep -rniE 'durability|reconstructible|irreplaceable|backup' src/ schemas/`
returns **0 hits**, so the field today meets this decision's own definition of
the inert attestation it replaced. It is load-bearing only through the two
decisions that read it: [0043](deferred/0043-delete-authority-durability-gate.md) gates
the delete path — a claim backing non-`reconstructible` data leaving the render
is `E_ORPHANED_CLAIM` plus a state-move-plan, never a delete — and
[0057](0057-datastore-and-restore.md) makes `irreplaceable` mean a restore
rehearsed before the first production apply. The worked example:
`knowledge-vault-clone`, `irreplaceable`, on `local-path`, a personal vault.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `rollbackTargetRetention` | zero migration; every Service keeps one identical block and the scorecard keeps passing | it asserts a ninety-day rollback this cluster cannot perform, and out-degree zero means no object ever reflects it |
| Derive the class from observable facts | one classifier plus a growing exception list; a wrong guess is silent | `valkey` and `knowledge-vault-clone` are indistinguishable to the platform — both RWO `local-path` PVCs on the one node — and one is cache, one is irreplaceable |
| Two classes, backed / unbacked | one fewer judgement per volume; a simpler renderer | collapses "a nightly job suffices" into "needs an off-cluster copy and approval on relocation", leaving [0057](0057-datastore-and-restore.md)'s rehearsal gate no input to fire on |
| A per-volume RPO in hours | owners state numbers the substrate cannot honour — the daily node backup fixes RPO at 24 h | a number nothing enforces is the inert attestation again, with a decimal point |

## Reversibility

Undo cost today: the field is authored and read by nothing, so removal is a
schema change plus the declarations in the example Services — under an hour,
zero diff in any rendered object. Becomes irreversible once the
[0043](deferred/0043-delete-authority-durability-gate.md) refusal runs against production:
the class is then the only signal separating a cache PVC from the knowledge vault
at delete time, and withdrawing it re-arms the delete path it disarmed.

## Consequences

- Every volume carries one more authored line, and the `recoverable` /
  `irreplaceable` boundary is a judgement with no safe default — paid by service
  owners.
- Until a backup renderer and retention sweep exist, the field is documentation
  with a delete gate attached — paid by adapter maintainers.
- An `irreplaceable` volume cannot reach its first production apply until the
  restore is rehearsed — paid by the platform owner, in schedule.
- The error is asymmetric: over-declaring costs an off-cluster copy and a stalled
  delete, under-declaring loses the data silently — paid by whoever declares.
- Every Service drops its `rollbackTargetRetention` block, and the scorecard
  entry retires with it — paid by service authors, once.
