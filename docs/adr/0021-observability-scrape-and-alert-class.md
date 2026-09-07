---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#observability
rests-on: ["0005"]
---

# Observability is a scrape surface plus an Alert Class

## Rests on

A rule the platform generates always evaluates and its alert always reaches a
receiver; a hand-written one does neither reliably. False if: a `PrometheusRule`
rendered from a non-`none` Alert Class is in the cluster but absent from
Prometheus's loaded rule set, or resolves to no receiver. Settled by: render one Service at `alertClass: urgent`, diff
`kubectl get prometheusrule -A -o jsonpath='{.items[*].metadata.name}'` against
`curl -s http://prometheus:9090/api/v1/rules | jq -r '.data.groups[].rules[].name'`,
then `amtool config routes test alertclass=urgent`.

## Why

Observability had no authoring vocabulary at all in v2. The resolved schema
carried `observability: {metrics[], status[]}` and collections carried
`observability: {metrics[], gatus[]}` — two shapes, neither used by a single
service repository — so everything real was hand-written, leaving two silent
holes. **Gatus monitors 41 endpoints and notifies nobody**:
`gatus-config-configmap.yaml` contains `storage` and `ui` and no `alerting`
section whatsoever. And **8 ServiceMonitors plus 2 PodMonitors cover roughly
thirty workloads**, with exactly one `PrometheusRule` in the estate — the 8/2/1
count `spec/v1/30-deliverables.md:82` records. Deriving routing from a declared
Alert Class makes monitored-but-unrouted impossible to express.

The scrape path stays service-declared because it is genuinely service
knowledge and it varies — `/actuator/prometheus`, `/api/actuator/prometheus`,
`/metrics` — so a platform that guessed would silently collect nothing and
report success. That is the residue [0005](0005-derivation-is-total.md) leaves:
a port and a path only the framework inside the container knows. Everything
downstream is derived — Gatus checks from health and exposure, ServiceMonitors
from the scrape surface, PrometheusRules from the Alert Class, notifier routing
from the Alert Class and `owner`.

Rendering the rules also closes a trap the estate has documented and paid for.
A `PrometheusRule` without `release: metrics-stack` in `metadata.labels` is
accepted by the API server, its Kustomization goes Ready, the operator logs
nothing, and the rules never evaluate — `spec/v1/50-lifecycle.md:43` calls
`metrics-stack` "the referent of the `release: metrics-stack` label without
which a `PrometheusRule` never evaluates". A generated rule always carries the
label; an authored one relies on the author remembering. The scrape half is
built — the registered `kubernetes` adapter emits `servicemonitor.yaml` and
`podmonitor.yaml` (`src/adapters/kubernetes.ts:56-62`); the alerting half is
missing there exactly as it is missing in the cluster.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Derive the scrape path from a convention (`/metrics`) | breaks the live `/actuator/prometheus` paths; a wrong guess yields an empty target behind a green render | fails silently, the exact failure mode this decision removes |
| Let a Service declare its notifier or receiver | a notifier is a shared resource — N services × routes to maintain, and a Service can name a channel nobody reads without anything noticing | routing is estate knowledge; urgency is service knowledge |
| Keep the v2 `observability` shapes and hand-write the rest | zero service repositories use either shape today; ~30 workloads stay covered by 10 hand-written monitors and 1 rule | unused vocabulary is not vocabulary |
| Alert Class optional, defaulting to `none` | the honest `none` and the forgotten field become indistinguishable — exactly the 41-endpoint hole, re-created in the schema | absence must be declared, not inferred |

## Reversibility

Undo cost today: `alertClass` is one required intent field and one derivation
branch; removing it deletes the PrometheusRule and notifier-route derivations
and the Gatus `alerting` block — the intent schema plus two adapters, hours
rather than days. Blast radius is bounded, since the monitors render from the
scrape surface either way.
Becomes irreversible once: on-call routes exist only as derived output and the
hand-written Alertmanager routes have been deleted. Reverting past that point
leaves `urgent` and `page` with no receiver, and the symptom is silence.

## Consequences

- Every Service declares `alertClass`, including those whose honest answer is
  `none`, which puts that answer on the record — paid by service authors.
- Roughly thirty workloads need a scrape declaration to close the 8 + 2 gap, and
  a wrong path shows an empty target rather than nothing — paid by service owners.
- One `PrometheusRule` in the estate becomes one per non-`none` Service, all
  evaluated every interval — paid by the metrics stack's capacity budget.
- A bespoke SLI or custom expression needs an escape hatch that names what it
  supplements rather than replacing the generated rule — paid by adapters.
- Gatus's UI strings still read "personal-stack" and reference
  `inventory/fleet.yaml`; both become derived and stop naming an archived
  repository — paid by whoever lands the Gatus adapter.
- Routing derives from fields only a Service carries, so the delivery machinery
  has no Alert Class here; [0058](deferred/0058-delivery-machinery-observability.md)
  closes that gap — paid by platform.
