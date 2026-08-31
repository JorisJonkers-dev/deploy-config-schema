---
status: proposed
---

# Delivery is push, gated by relationship-scoped aggregators; Flux keeps the foundation

Objects derived from Service Intent are applied to the cluster by an
**aggregator** — a repository owning a relationship between Services — using
`kubectl apply --server-side` on merge, after that relationship's system tests
have passed against an ephemeral vcluster. Flux continues to reconcile the
platform foundation. Composition is unchanged and still runs without a pull
request.

## Why

Two things the previous model could not do.

**A tested combination could not be the deployed combination.** Flux reconciles
whatever the rendered tree contains, and the system tests ran separately —
147 tests across 31 classes that had, per ADR-0010 in the workspace, *"zero runs,
ever"*. Making the thing that passed the tests also the thing that deploys
requires the deployer to be the thing that ran them.

**Relationships had no owner.** Of roughly 25 test classes, 12 exercise `auth-api`
*with its consumers* — `GrafanaOidc`, `N8nOidc`, `RabbitMqOidc`,
`ForwardAuthChain`, `DownstreamOidcAuthorization` and the rest. No Service knows
its own consumers, so no Service repository can own that suite. An aggregator can.

## Where the boundary falls, and why it is not a compromise

Chapter 30 measured coverage and found three classes: 364 objects derived from
Service Intent, 41 delivered by blueprint packs, 45 authored. Delivery splits at
exactly the same line, which was not planned.

Class B cannot move, and the reason is concrete rather than architectural.
Eighteen of those 41 objects are `HelmRelease`, and applying a `HelmRelease` with
`kubectl` accomplishes nothing without Flux's `helm-controller`. Those eighteen
charts are `vault`, `vault-secrets-operator`, `metrics-stack`, `traefik`,
`traefik-lan`, `cert-manager`, `external-dns`, `metallb`, `grafana`,
`grafana-operator`, `loki`, `tempo`, `pyroscope`, `alloy` ×2, `dcgm-exporter`,
`nvidia-device-plugin` and `headlamp` — which is to say the Secret Store, the
mechanism that delivers secrets, Prometheus, every route, TLS, DNS, load-balancer
addresses and all observability.

Rendering those charts to plain manifests was considered and rejected: it means
taking ownership of eighteen upstream charts' values, hooks and CRD upgrade paths,
and `vault` plus `vault-secrets-operator` are in the set, so a bad render breaks
secret delivery for everything.

## What is given up

Stated plainly, because a push model loses properties a pull model has for free.

- **Pruning.** Flux prunes because a Kustomization keeps an inventory of what it
  applied. `kubectl` keeps none, so the model supplies one: every applied object
  carries a `deployer` label, and the previous set is a query. The delete pass is
  the difference between that query and the current render.
- **Continuous reconciliation.** Replaced by an in-cluster CronJob per aggregator
  re-applying its own lock. GitHub Actions schedules were rejected on the estate's
  own measurement — *"four to seven runs per repo per day regardless of the
  declared interval… Never build anything needing prompt reaction on a schedule
  alone, and do not raise the frequency to compensate."* Drift correction is
  precisely a reaction to something having gone wrong.
- **A single answer to what is live.** Each slice sits at whatever lock its
  aggregator merged. Forcing convergence was rejected because one red aggregator
  would halt the estate, which is the coupling aggregators exist to break. Lag is
  measured instead, and cross-slice removals must go through expand/contract —
  checkable by composition, since it sees both sides of every inbound derivation.

One property improves. Server-side apply reports a **field-ownership conflict**
when a human has edited a field the aggregator owns, rather than silently
reverting it as continuous reconciliation would.

## Consequences

- **ADR-0015's rationale shifts.** A merge is now required to deploy, which reads
  against *"no centralized repo that needs to get pushed and merged for updates"*.
  The difference is that the merge is per-relationship rather than estate-wide,
  and it exists to run tests rather than to record pointers. Composition itself
  still requires no merge.
- **ADR-0014's relationship repository is renamed `Aggregator` and becomes the
  deploy unit**, gaining a `deploys`
  list alongside `exercises`. Testing membership is many-to-many; deploy authority
  is exactly one, enforced by `E_NO_DEPLOYER` and `E_MULTIPLE_DEPLOYERS` and,
  independently, by the API server through generated RBAC.
- **ADR-0006's Reconcile Unit survives with two meanings**: the Flux Kustomization
  DAG for class B, and the apply-order DAG for class A. Both read
  `lock.spec.dependencyGraph.order`, which
  `deploy-harness/scripts/apply-candidate.mjs` already does.
- **The `rbac` adapter becomes load-bearing.** It was 16 of the 36 objects in
  chapter 30's coverage gap; it now also renders the deployer ServiceAccounts and
  Roles this decision depends on.
- **CI cost grows.** A change anywhere invalidates every aggregator's pin, so
  roughly six suites run per service change, each provisioning a vcluster. The
  estate has measured this shape: *"561 minutes of real compute billed 2,845 —
  four fifths of the spend was rounding"*, with the advice to *"prefer one job
  with many steps"*. Sharded Gradle execution across parallel jobs is the opposite
  of that.
- **A break-glass path exists and must stay visible.** Applying an older lock
  without tests is necessary for incidents, and because the applied lock is read
  from cluster annotations the rollback sticks rather than being undone by the next
  CronJob run. An unreported break-glass state becomes the silent status quo.
