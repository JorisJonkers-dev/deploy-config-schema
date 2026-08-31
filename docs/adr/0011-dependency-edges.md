---
status: proposed
---

# A dependency edge carries the surface it uses, and the edge set becomes the network policy

`dependsOn` names the provider Service, which of its declared surfaces the
consumer uses, and whether the dependency is required. That single declaration
drives four derivations: the reconcile DAG, dependency coordinates, network
policy, and the co-test set. Because the edge set is then complete, network
policy is rendered as default-deny with explicit allows.

## Why

An id alone is not enough. Network policy is currently derived only from
credential claims matched to provider exports carrying an endpoint
(`render/networkpolicy.ts:69`), so a dependency with no credential — `knowledge`
calling `auth-api` over HTTP — produces neither a policy nor a coordinate. Since
ADR-0007 forbids authoring derived coordinates, an id-only edge would leave that
value with no legal home.

Naming a surface also puts the port in one place: the provider declares its
surfaces once, and every consumer refers to them by name rather than restating
`5432`.

Default-deny is the largest security improvement available here. Three
NetworkPolicy objects exist for roughly thirty workloads, so the cluster is
effectively open east-west. Opt-in enforcement was rejected on the evidence of
that same number: three of thirty is the realistic adoption rate for an opt-in
control.

## Consequences

- **Default-deny must ship in audit mode first.** Any connection that exists but
  is not declared breaks the moment enforcement lands, and this cluster is known
  to contain undeclared paths. Promotion from audit to enforce is a separate
  decision made on observed evidence, not on schedule.
- `required: false` yields an allow rule but no reconcile ordering and no startup
  gate, so an optional dependency cannot deadlock a rollout.
- A provider must declare its surfaces before a consumer can name one.
