---
status: proposed
---

# Contention decides who declares a value

A value is assigned by the platform, with Service Intent expressing only a need
for it, if and only if the value must be unique across the estate or draws on a
shared finite resource. Every other value is declared outright by the Service.

## Why

The estate had no test for where a field belongs, so fields landed wherever the
change that introduced them was being made. One hostname, `kb.jorisjonkers.dev`,
ended up declared in seven authoritative places across three repositories —
`homelab-inventory/catalog/reachability.yml`, three `fleet-infra` edge and
knowledge manifests, a bearer-token secret, and the service's own
`platform/deployment.yml` — plus hardcoded in `ServicePermission.kt`. Two
conformance tests exist for no purpose other than detecting when those seven
disagree. The guard was cheaper to write than the fix, which is how the estate
arrived here.

Ownership-by-on-call and ownership-by-churn were the implicit rules in play.
Both produce a fresh negotiation per field, which is why seven declarations
accumulated without anyone deciding they should.

Under this rule: hostnames, namespaces, PVC names, node placement, Vault paths
and edge tiers are platform-assigned. Health paths, container ports, statefulness,
migration strategy, dependency lists, co-test sets and observability scrape
paths are service-declared.

## Consequences

- A service owner cannot read their own service's URL out of their own
  repository. The Resolved Deployment must therefore be published back to the
  owning repository, not merely computed during a render.
- Six of the seven `kb.jorisjonkers.dev` declarations become derived, and both
  conformance tests become unnecessary rather than merely passing.
