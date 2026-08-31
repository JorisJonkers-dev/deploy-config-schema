---
status: proposed
---

# Observability is a scrape surface plus an Alert Class

A Workload declares where its metrics are and how urgent its failure is. Gatus
checks derive from health and exposure, ServiceMonitors from the scrape surface,
PrometheusRules from the Alert Class, and notifier routing from the Alert Class
and owner.

## Why

Observability had no authoring vocabulary at all in v2. The resolved schema had
`observability: {metrics[], status[]}` and collections had
`observability: {metrics[], gatus[]}` — two shapes, neither used by a service
repository — so everything real was hand-written.

The result is two silent holes. **Gatus monitors 41 endpoints and notifies
nobody**: `gatus-config-configmap.yaml` contains `storage` and `ui` and no
`alerting` section whatsoever. And **8 ServiceMonitors plus 2 PodMonitors cover
roughly thirty workloads**, with exactly one `PrometheusRule` in the estate.
Deriving notifier routing from a declared Alert Class makes
monitored-but-unrouted impossible to express.

The scrape path stays service-declared because it is genuinely service
knowledge and varies — `/actuator/prometheus`, `/api/actuator/prometheus`,
`/metrics` — so a platform that guessed it would silently collect nothing.

Rendering PrometheusRules also closes a trap the estate has documented and paid
for: a rule without `release: metrics-stack` in `metadata.labels` is accepted,
its Kustomization goes Ready, the operator logs nothing, and the rules never
evaluate. A generated rule always carries the label; an authored one relies on
the author remembering.

## Consequences

- A bespoke SLI or custom alert expression needs an escape hatch, and that hatch
  must name what it supplements.
- Gatus's UI strings still read "personal-stack" and reference
  `inventory/fleet.yaml`; both become derived and both stop naming an archived
  repository.
- Alert Class is a closed set (`none`, `business-hours`, `urgent`, `page`).
  Routing is not declared by a Service, because a notifier is a shared resource.
