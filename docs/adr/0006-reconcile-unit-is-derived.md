---
status: proposed
---

# The Reconcile Unit is derived from the dependency graph

A Service does not declare which Reconcile Unit it belongs to. Layer 2 computes
the unit and its ordering from the Service's `dependsOn` list and its credential
Claims. The `platform.layer` field is removed.

## Why

`platform.layer` was a free-form string — `cluster-state.schema.json` types it
as `"type": "string"` with no enumeration — and every service declared
`apps-core`. Not one of them reconciled there: `auth-api`, `agents-api` and
`app-ui` land in `apps-stateless`, `knowledge` in `apps-knowledge`,
`agent-runtime` in `apps-agents`. The field was wrong in every case and nobody
noticed, because it feeds service-registry registration and never placement.

`agents-login`'s objects appear in two Reconcile Units at once, so a
service-level field cannot describe the cluster even in principle.

The derivation is available and exact. The fourteen-node Flux `dependsOn` graph
is the service dependency graph projected onto Domains: `apps-knowledge` depends
on `apps-data` because `knowledge` depends on `platform-postgres` and
`platform-rabbitmq`; `apps-agents` depends on `apps-knowledge` because the agent
services consume `knowledge`, and on `apps-vso-secrets` because they claim
credentials; everything depends on `apps-core`.

## Two meanings after ADR-0019

Delivery is now split (ADR-0019), so the derived Reconcile Unit is consumed twice.
For class B — the pack-delivered foundation — it remains a Flux `Kustomization`
with a `dependsOn` graph. For class A — everything derived from Service Intent —
it is the **apply order**: an aggregator applies its slice layer by layer in
`lock.spec.dependencyGraph.order`, which
`deploy-harness/scripts/apply-candidate.mjs` already does against a vcluster.

The derivation is unchanged. Only the number of consumers is.

## Consequences

- A service owner cannot pin their reconcile position. If ordering is wrong, the
  fix is to correct the dependency declaration that produced it.
- A dependency cycle becomes a build failure rather than a reconcile deadlock.
- The fourteen-node graph in
  `fleet-infra/cluster/flux/clusters/production/kustomizations.yaml` stops being
  hand-maintained.
