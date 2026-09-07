---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#derived-mechanics
rests-on: ["0005"]
---

# Runtime mechanics are derived from declared intent

## Rests on
Rollout strategy is a function of declared volumes, not of a preference: no
workload holding a `ReadWriteOnce` volume can roll, so every such workload must
render `Recreate`. False if: a workload holding an RWO volume rolls with
`maxSurge: 1` and does so without wedging. Settled
by: `kubectl get deploy,sts -A -o json | jq -r '.items[]|[.metadata.name,
(.spec.strategy.type//"RollingUpdate")]|@tsv'` joined against
`kubectl get pvc -A -o custom-columns=NAME:.metadata.name,MODE:.spec.accessModes`
— every RWO holder must appear on the `Recreate` side of the recorded 21-to-9
split.

## Why
A Service declares what only it can know: its cold-start budget, whether it
requires zero-downtime rolls, which paths answer readiness and liveness, what a
volume's data is worth, and what it can survive when an input changes. Probe
timings, rollout strategy, surge and unavailability, progress deadlines, health
timeout classes, backup jobs, retention sweeps and node pinning are all derived
from those declarations. None of the derived values may be authored. The v2
authoring vocabulary for all of this was `path`, `port`, `timeoutClass`,
`mandatory`, `livenessPath`, `probeTimeoutSeconds`; everything else existed only
in hand-written manifests, so each new service either rediscovered the mechanics
or copied them without the reasoning.

The rollout configuration is the most carefully-tuned thing in the estate and
the model could not see any of it. All four first-party deployments carry the
same pattern — `RollingUpdate` with `maxSurge: 1` and `maxUnavailable: 0`,
`startupProbe` at `periodSeconds: 5` and `failureThreshold: 120`, readiness and
liveness at `timeoutSeconds: 5`, and `progressDeadlineSeconds: 1800` on the
three JVM services ([0031](0031-derived-overrides-with-reason.md) covers
`app-ui`'s 600) — and the comments record what it cost to arrive there: *"under
`Recreate` every image roll opened a zero-pod window, so a slow cold start or a
flaky ghcr image pull took the MCP fully down (503)"*, *"the old maxSurge=0
note"*, *"JVM cold start (~250–300 s); the 600 s startupProbe budget covers
it"*. Four identical blocks is the same derivation performed four times by hand.

Much of the set is already mechanical. Estate-wide the strategy split is 21
`Recreate` to 9 `RollingUpdate`, forced wherever an RWO volume cannot attach to
two pods at once. `src/schemas/health-timeout-map.ts:1-6` maps the health
timeout class by table — `stateless: 5m`, `stateful: 10m`, `control-plane: 15m`,
`job: 10m` — and `resolveHealthTimeout` (line 18) takes the strongest class
across a Service's workloads. Storage is `local-path` and all fourteen PVCs are
`ReadWriteOnce`, so a volume pins its workload to one node permanently and
retention can only be an application-level backup job, both falling out of the
durability class of [0015](0015-durability-class-per-volume.md) as probe
timings fall out of [0014](0014-probes-are-siblings.md). The renderer does not
do this yet: `src/adapters/kubernetes.ts:608` reads an authored enum
(`src/schemas/service-intent.ts:165`), inspecting no volume.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep the authored `strategy` enum (today's renderer) | A stateful workload whose author omits `strategy: recreate` gets `maxSurge: 1, maxUnavailable: 0` against an RWO volume; on one node the pods co-schedule and it appears to work, and the moment a second worker exists the rollout hangs until the progress deadline and fails without ever having been able to succeed | The input the platform needs (the volume) is already declared; asking for the conclusion as well makes a silent trap out of a forgotten field |
| Per-field opt-in — derive some mechanics, leave the rest authorable | The derived/authored boundary lives in convention rather than schema; ~30 layer-1 repositories drift apart on which half they use, and a platform-wide tuning change reaches only the derived half | A partial rule cannot be tested; the estate would still hold hand-tuned values nobody can trace to an input |
| A shared manifest template each service copies | Cheapest to build (one blueprint, no derivation code), but reproduces exactly the four identical blocks that exist today, one per service, drifting on every edit | Copies carry values without the reasoning; the 503 that produced `maxSurge: 1` is a comment in four files, not a rule |

## Reversibility
Undo cost today: the authored fields still exist — restoring them means reverting
two adapter call sites and the layer-1 schema enum, roughly a day, and the live
manifests still carry the tuned values as a fallback. Becomes irreversible once:
the hand-written manifests and their explanatory comments are deleted from the
service repositories, after which the rules are the only surviving record of
what the values cost to learn.

## Consequences
- A wrong derivation rule mis-tunes every workload at once rather than one — paid
  by the whole estate, on the first rollout after the bad rule ships.
- The progress deadline must derive to strictly more than the startup budget; the
  current renderer emits `600` against a `600s` budget, so a JVM still inside its
  legitimate startup window is marked `ProgressDeadlineExceeded` and every
  downstream Kustomization stalls behind it — paid by the renderer's maintainer,
  before the derivation is trusted.
- A wrong `reload` declaration — for change response or rotation tolerance —
  fails silently, reproducing today's bug for that one input; the default is
  `restart` so that omission is safe — paid by the Workload owner.
- An unusual workload cannot hand-tune probes or strategy except through the
  named-override hatch of [0031](0031-derived-overrides-with-reason.md), which
  costs a recorded reason per override — paid by that workload's owner.
- Service owners lose a lever they had, and every mechanic they can no longer
  reach becomes a platform support request — paid by the platform owner.
- New workloads inherit the four-deployment pattern as a rule, the reasoning
  stated once instead of copied — paid back to every future service author.
