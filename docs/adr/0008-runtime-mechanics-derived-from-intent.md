---
status: proposed
---

# Runtime mechanics are derived from declared intent

A Service declares what only it can know — its cold-start budget, whether it
requires zero-downtime rolls, which paths answer readiness and liveness, what a
volume's data is worth, and what it can survive when an input changes. Probe
timings, rollout strategy, surge and unavailability, progress deadlines, health
timeout classes, backup jobs, retention sweeps and node pinning are all derived
from those declarations. None of the derived values may be authored.

## Why

The rollout configuration is the most carefully-tuned thing in the estate and
the model could not see any of it. All four first-party deployments carry an
identical pattern — `progressDeadlineSeconds: 1800`, `RollingUpdate` with
`maxSurge: 1` and `maxUnavailable: 0`, `startupProbe` at `periodSeconds: 5` and
`failureThreshold: 120`, readiness and liveness at `timeoutSeconds: 5` — and the
comments record what it cost to arrive there: *"under `Recreate` every image roll
opened a zero-pod window, so a slow cold start or a flaky ghcr image pull took
the MCP fully down (503)"*, *"the old maxSurge=0 note"*, *"JVM cold start
(~250–300 s); the 600 s startupProbe budget covers it"*.

The v2 authoring vocabulary for all of this was `path`, `port`, `timeoutClass`,
`mandatory`, `livenessPath`, `probeTimeoutSeconds`. Everything else existed only
in hand-written manifests, which means each new service either rediscovered it or
copied it without the reasoning. Deriving it turns hard-won behaviour into a rule
that new workloads inherit.

Much of it is genuinely a function of things already declared. Estate-wide the
strategy split is 21 `Recreate` to 9 `RollingUpdate`, and `Recreate` is forced
wherever a `ReadWriteOnce` volume cannot attach to two pods at once — so strategy
follows from volumes. `timeoutClass` already maps mechanically (`stateless: 5m`,
`stateful: 10m`, `control-plane: 15m`, `job: 10m`) with `resolveHealthTimeout`
taking the maximum across a Service's workloads.

## Durability, and what replaced an inert attestation

Storage is `local-path`, not Longhorn: all fourteen PVCs are `ReadWriteOnce`, and
ADR-0011 in the workspace records that *"PVC-level snapshots are impossible here:
no VolumeSnapshot CRDs, and `local-path` has no CSI snapshot support. The job
that pretended otherwise was deleted."* Two consequences follow that the model
must carry: a volume pins its workload to one node permanently, which is why a
state-move-plan exists at all; and retention can only be an application-level
backup job.

`rollbackTargetRetention` was the previous answer and it did nothing. It is
validated for `minimumDays >= 90` and `acknowledged: true`, appears in the
readiness scorecard as `rollback_retention_acknowledged`, is documented in three
`PLATFORM.md` files as failing *"never"*, and is read by no renderer or adapter.
Every service declares the identical `{minimumDays: 90, acknowledged: true}`, and
nothing anywhere states whether it retains images or data. Given no snapshots and
fixed-filename backups with no history, a ninety-day data-rollback guarantee is
not something this cluster can provide, so the attestation asserted something
unverifiable.

It is replaced by a Durability Class per volume — `reconstructible`,
`recoverable`, `irreplaceable` — which is the one fact only the owning Service
knows, and which renders: no backup for reconstructible data, a backup job with a
retention sweep for recoverable data (closing ADR-0011's recommended option), and
an additional off-cluster copy plus owner approval on relocation for
irreplaceable data. ADR-0011 already used this vocabulary in prose: *"Valkey is
deliberately unbacked as reconstructible cache."*

## Consequences

- An unusual workload cannot hand-tune its probes or strategy without an escape
  hatch, and that hatch must name what it overrides so an override is never
  mistaken for a stale value.
- A wrong `reload` declaration — for Change Response or Rotation Tolerance —
  fails silently, reproducing today's bug for that one input. The default is
  `restart` so that omission is safe.
- Three Durability Classes will not fit every case, and the boundary between
  `recoverable` and `irreplaceable` is a judgement the owner must make.
- The ban on `volumeClaimTemplate` is retained. A template ties a volume to the
  workload's own name, so renaming the workload orphans the claim and starts
  empty.
