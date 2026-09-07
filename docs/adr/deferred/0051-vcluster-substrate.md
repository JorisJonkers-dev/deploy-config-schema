---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#test-substrate
rests-on: ["0008"]
---

# The test substrate is measured before it gates

## Rests on

One provision-and-apply of the whole composed estate into a k3d cluster on the CI
runner finishes within the gate budget: **≤15 minutes wall, ≤4 GB peak resident
memory**. False if: one measured run exceeds either threshold. Settled by: a single
run — `/usr/bin/time -v k3d cluster create gate-probe`, then
`node deploy-harness/scripts/apply-candidate.mjs --lock <latest CompositionLock>`,
recording elapsed wall time and maximum RSS across the k3d process tree.

## Why

The push-delivery design made every deploy conditional on a substrate it never
located. Objects are applied "after that relationship's system tests have passed
against an ephemeral vcluster", and its own consequence list concedes that "**CI
cost grows.** A change anywhere invalidates every aggregator's pin, so roughly six
suites run per service change, each provisioning a vcluster." What gets provisioned
six times is not small: chapter 30's coverage measurement is 364 objects derived
from Service Intent plus 41 delivered by blueprint packs — 405 rendered objects (364 class A plus 41 pack-delivered) per run —
and 18 of those 41 are `HelmRelease` (`vault`, `vault-secrets-operator`,
`metrics-stack`, `traefik`, `cert-manager`, `metallb`, `grafana`, `loki`, `tempo`
and the rest), none of which mean anything without Flux's `helm-controller` in the
substrate too. The only budget anywhere is `timeout-minutes: 45` and a
`cancel-in-progress` concurrency group in
`../../spec/v1/examples/workflows/aggregator-gate.yml:19-27` — an abort
threshold, not a measurement, and no chapter states a memory figure or a
per-runner concurrency limit at all.

Where they run was equally undecided, and the default reading is dangerous. The
lifecycle chapter puts the applier on "a self-hosted runner **inside** the
cluster", and its sequence diagram says only `Agg->>VC: provision, apply whole
composed estate` — the substrate's location is never named. If VC lands on the
production control plane, six concurrent full-estate applies draw on the same
7-node pool (node facts emit 110 labels for 7 nodes) and the same `local-path`
storage the placement model exists to arbitrate, contending for exactly the CPU and
memory [0016](../0016-pod-hardening-and-resource-class.md)'s size classes ration — a
test substrate on the production kernel defeats the control that protects
production. Hence k3d on the CI runner: the same k3s binary as production, in a
container namespace on the runner host, with no production API server, scheduler or
PersistentVolume in reach.

The measurement comes first because the number changes the design, not just the
budget. The estate has measured this shape of spend before — *"561 minutes of real
compute billed 2,845 — four fifths of the spend was rounding"*, with the advice to
*"prefer one job with many steps"* — and six provisions per change multiplies
whatever the single figure is. Taking it costs a run, not a build: the harness
script above "already does" a layer-ordered apply against a vcluster today.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| vclusters on the production k3s cluster | six concurrent syncers × 405 objects on the 7-node pool and its `local-path` volumes; no isolation from the workloads [0016](../0016-pod-hardening-and-resource-class.md) rations | Test load evicting production is precisely the failure the placement model exists to prevent |
| a dedicated always-on test cluster | second set of hardware plus its own k3s upgrade, CNI ([0036](../0036-cni-selection.md)) and restore ([0057](../0057-datastore-and-restore.md)) story, run by the same one person | Doubles the operational surface to serve a gate whose cost is not yet known |
| `kind` on the runner instead of k3d | same isolation, but a different distribution from the k3s the gate is predicting for | Reintroduces substrate drift the gate exists to eliminate; k3d runs the production k3s binary |
| no substrate — schema validation plus `--dry-run=server` against production | near-zero CI cost | Needs a production credential on every PR and still never runs a relationship suite ([0049](0049-aggregator-owned-tests.md)) |

## Reversibility

Undo cost today: nothing is built. The substrate is named in one spec section and
one sequence step; swapping k3d for another local distribution is a single runner
job definition — hours, blast radius bounded by CI. Becomes irreversible once
relationship suites depend on k3d-specific behaviour (its bundled load balancer,
its registry, `local-path` defaults) rather than the k3s API, or once the gate ships
*before* the measurement — after which the number surfaces only as a regression.

## Consequences

- The gate design stays open until one number exists; per-relationship slices
  versus full estate is decided by measurement — paid by the programme schedule
- If the run misses ≤15 min or ≤4 GB, [0041](0041-push-delivery-boundary.md)'s
  CI-cost consequence reprices and the gate is re-cut — paid by whoever owns the
  aggregator workflows
- The runner host must hold a k3d cluster plus 18 HelmReleases; it stops being a
  checkout-and-node box and needs a capacity budget — paid by its operator
- Production nodes are never the test substrate, so the 7-node pool stays rationed
  for real workloads — paid by nobody; a benefit to service owners
- k3d cannot exercise the production CNI's enforcement path or the real MetalLB
  pool, so [0035](../0035-network-policy-default-deny.md)'s flow observation still
  needs a real cluster — paid by the network-policy work
- The figure goes stale whenever the class-B chart set moves, so it is re-taken on
  each foundation pin bump ([0048](0048-class-b-pinning.md)) — paid by joris
