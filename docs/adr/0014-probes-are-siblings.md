---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#probes
rests-on: ["0005"]
---

# Probes are sibling declarations, each carrying its own path

## Rests on

A liveness probe pointed at a readiness endpoint restarts pods during
dependency outages. False if: a pod whose readiness handler reports unready
because a dependency is down survives its liveness `failureThreshold` without
a restart. Settled by: deploy a workload whose single health endpoint checks a
dependency, take the dependency down for longer than the derived liveness
window, and read
`kubectl get pod <pod> -o jsonpath='{.status.containerStatuses[0].restartCount}'`.

## Why

`readiness` and `liveness` are siblings: each carries its own `path` and
`port`, or `tcp` and a port for a service with no HTTP surface, and neither
falls back to the other. The endpoints are the part only the owning Service
knows ([0005](0005-derivation-is-total.md)); timings, thresholds and deadlines
stay derived ([0030](0030-runtime-mechanics-derived.md)). The v2 model instead
made liveness a fallback — `src/adapters/kubernetes-workload-fragment.ts:166`
renders `livenessProbe: probe(health.livenessPath ?? health.path)` — and two
live workloads rely on it: `app-ui` declares only `/`, `agents-login` only
`/healthz`. For both, liveness silently probes the readiness endpoint.

That fallback made a specific failure the default. Readiness means *can I
serve traffic*; liveness means *is my process wedged*. When liveness probes
the readiness endpoint, a dependency outage turns readiness red, which fails
liveness, which restarts the pod — converting a degraded service into a
crash-loop. Requiring both declarations does not prevent an author pointing
them at the same endpoint; it prevents them doing so without noticing.

`tcp` is not optional decoration: `postgres` probes with `tcpSocket` on port
`db` for both readiness and liveness, and the other data services do the same
— an HTTP-only vocabulary could not express the estate's data tier. Absence
must also be sayable: `knowledge-ingest-worker` has no ports and nothing to
probe, and declaring `probes: none` distinguishes that fact from an oversight.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the v2 fallback (`livenessPath` optional, defaults to `path`) | every service taking the default inherits the dependency-outage crash-loop; `app-ui` and `agents-login` already do | makes the worst wiring the path of least resistance |
| Derive liveness from readiness with softer thresholds | same endpoint either way — restarts are delayed, not avoided, and tuning hides the design error | mitigates a failure the model should not produce |
| Omit liveness unless authored | a wedged process (deadlocked JVM, stuck event loop) is never restarted — the one condition liveness exists for | trades a loud failure for a silent one |
| HTTP-only probes, no `tcp` | `postgres` and the rest of the data tier need fake HTTP sidecars or lose probes entirely | the estate's stateful services are TCP-native today |
| Absence by omission instead of `probes: none` | a forgotten probe block is indistinguishable from a deliberate one | reviewability is the point of declared intent |

## Reversibility

Undo cost today: restore the fallback in the probe derivation (the workload
adapter and the intent schema, two files, under a day) and relax validation;
Intents that already author both paths keep working unchanged. Blast radius is
one rolling restart per workload whose rendered probes change.
Becomes irreversible once: workloads ship liveness endpoints distinct from
their readiness paths — reinstating a fallback would then silently repoint
liveness for every service that omits it, and no diff would show which
services regressed.

## Consequences

- Every HTTP workload authors two endpoint declarations even when they are
  deliberately identical — paid by service authors.
- `app-ui` and `agents-login` must each decide what their liveness endpoint
  actually is instead of inheriting the readiness path — paid by their owners.
- A dependency outage degrades a service to unready instead of restarting it,
  provided the authored liveness endpoint checks process health only — paid by
  service authors, in endpoint discipline.
- Port-less workers add one `probes: none` line so silence is never ambiguous
  — paid by their authors.
- Adapters render `httpGet` and `tcpSocket` variants and refuse a Workload
  with ports but no probe declaration — paid by adapter maintainers.
- Pointing both probes at one endpoint remains expressible; the model makes it
  visible, not impossible — paid by the service that chooses it.
