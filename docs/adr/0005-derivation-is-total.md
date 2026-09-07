---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#derived-mechanics
---

# Derivation from declared intent is total

## Rests on
Every hand-tuned value in the live estate is reachable from a value only the
owning Service could know. False if: a live value exists that no layer-1 field
can reach. Settled by: rendering the whole estate and diffing against the live
manifests — every unauthored value remaining in the diff is a counterexample.

## Why
This is the premise under every derive-not-declare decision
([0030](0030-runtime-mechanics-derived.md) and its siblings): if a Service
declares what only it can know — its cold-start budget, whether it requires
zero-downtime rolls, which paths answer readiness and liveness, what a volume's
data is worth — then probe timings, rollout strategy, surge and unavailability,
progress deadlines, backup jobs and node pinning all follow, and no derived
value need ever be authored. The claim is one of reachability: derivation is
*total* only if no live value falls outside what layer-1 vocabulary can feed.

The estate's strongest evidence is the rollout configuration, the most
carefully-tuned thing in it. All four first-party deployments carry an
identical pattern — `progressDeadlineSeconds: 1800`, `RollingUpdate` with
`maxSurge: 1` and `maxUnavailable: 0`, `startupProbe` at `periodSeconds: 5` and
`failureThreshold: 120`, readiness and liveness at `timeoutSeconds: 5` — and
the comments record what it cost to arrive there: *"under `Recreate` every
image roll opened a zero-pod window, so a slow cold start or a flaky ghcr image
pull took the MCP fully down (503)"*; *"JVM cold start (~250–300 s); the 600 s
startupProbe budget covers it"*. Estate-wide the strategy split is 21
`Recreate` to 9 `RollingUpdate`, and `Recreate` is forced exactly where a
`ReadWriteOnce` volume cannot attach to two pods at once — strategy is a
function of declared volumes, and the identical block in four places is the
same derivation done four times by hand.

The premise is currently false as built, which is why its claim is open.
`grep -rniE 'securityContext|runAsNonRoot|readOnlyRootFilesystem' src/ schemas/`
returns **0 hits** (verified 2026-08-31; the grep spans both renderer
generations), and resource requests are emitted only when the model already
carries them: pod hardening and QoS have no layer-1 vocabulary at all, so every
pod runs root-by-default and BestEffort with no field able to reach either
(`review/CONSOLIDATED.md` B6). [0016](0016-pod-hardening-and-resource-class.md)
closes that known gap; the premise stays open until the render-and-diff shows
no others.

## Alternatives
Rival premises, this being a premise:

| option | cost if taken | why rejected |
|---|---|---|
| Partial derivation, hand-tuning allowed (the v2 state) | v2's vocabulary was `path`, `port`, `timeoutClass`, `mandatory`, `livenessPath`, `probeTimeoutSeconds`; everything else lived only in hand-written manifests, so each new service rediscovered the rollout pattern or blind-copied it without the reasoning | Hard-won behaviour decays into uncomprehended copies; the four identical blocks with cost-recording comments are the price already paid |
| Full declaration (every service restates the platform) | the ~10 hand-authored layer-1 repositories carry every mechanic for all ~30 Services; one platform-wide tuning change is ~30 Service edits across ~10 pull requests | The values are platform knowledge, not Service knowledge; a Service owner cannot defend `failureThreshold: 120` and should not be asked to |

## Reversibility
Undo cost today: reopen the 14 index decisions that rest on this premise (0011
through [0056](0056-node-facts-single-source.md)), reintroduce
authored-mechanics fields into the layer-1 schemas, and accept hand-tuned
values back across ~10 repositories — days of schema work plus an estate-wide
re-author. Becomes irreversible once: the hand-written manifests carrying the
tuned values and their explanatory comments are deleted from the service
repositories — after that the derivation rules are the only record of the
hard-won values, and there is nothing to fall back to.

## Consequences
- Every hand-tuned live value must be traced to a declarable input before its
  manifest is deleted; the render-and-diff audit that settles this claim is
  real work — paid by joris.
- Vocabulary gaps (securityContext and requests today) are invisible at
  authoring time and surface only in the settlement diff — paid by whoever
  runs the estate render.
- New workloads inherit the four-deployment rollout pattern as a rule instead
  of a copy, and the reasoning lives once — maintenance paid by the platform
  owner.
- A wrong derivation rule mis-tunes every service at once instead of one —
  paid by the whole estate on the first rollout after the bad rule.
- An unusual workload cannot hand-tune anything except through the
  named-override hatch of [0031](0031-derived-overrides-with-reason.md) —
  paid by that workload's owner, in a recorded reason per override.
