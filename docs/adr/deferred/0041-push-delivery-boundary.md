---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#delivery-classes
rests-on: ["0008"]
---

# Class A is pushed by Aggregators; class B stays with Flux

## Rests on

Every object derived from Service Intent reaches its intended state under
`kubectl apply --server-side` alone; the eighteen `HelmRelease`s in the
pack-delivered foundation do not. False if: any class-A kind the registered
adapters render needs a Flux controller to take effect, or a pack-delivered
`HelmRelease` reaches its intended state without `helm-controller`. Settled by: enumerate the kinds from `adapterContract()`, apply a
full estate render into a vcluster with **no** Flux controllers, diff.

## Why

Chapter 30 measured coverage and found three classes: **364 objects derived
from Service Intent**, 41 delivered by blueprint packs, 45 authored. Delivery
splits at exactly the same line, which was not planned. An **Aggregator** — a
repository owning a relationship between Services — applies class A with
`kubectl apply --server-side` on merge, after that relationship's system tests
pass against an ephemeral vcluster; Flux keeps the foundation. The boundary is
enforced: both appliers claiming one object is a build error.

Class B cannot move, and the reason is concrete rather than architectural.
Eighteen of those 41 objects are `HelmRelease`, and applying one with
`kubectl` accomplishes nothing without Flux's `helm-controller`. The eighteen
are `vault`, `vault-secrets-operator`, `metrics-stack`, `traefik`,
`traefik-lan`, `cert-manager`, `external-dns`, `metallb`, `grafana`,
`grafana-operator`, `loki`, `tempo`, `pyroscope`, `alloy` ×2, `dcgm-exporter`,
`nvidia-device-plugin` and `headlamp` — the Secret Store, the mechanism that
delivers secrets, Prometheus, every route, TLS, DNS, load-balancer addresses
and all observability. Rendering them to plain manifests was considered and
rejected: it means owning eighteen upstream charts' values, hooks and CRD
upgrade paths, and with `vault` and `vault-secrets-operator` in the set a bad
render breaks secret delivery for everything.

What is given up must be stated plainly, because push loses properties pull
has for free: Flux prunes from a Kustomization inventory and `kubectl` keeps
none ([0042](0042-apply-before-prune-inventory.md)); continuous reconciliation
becomes a CronJob per aggregator ([0044](0044-reconcile-cronjob.md)); and no
single answer to what is live survives. The claim is **open** and conditional:
it inherits [0008](0008-tested-equals-deployed-requires-push.md), and if
[workspace#45](https://github.com/JorisJonkers-dev/workspace/issues/45)
falsifies that premise, scope is cut per
[0059](../0059-v1-scope-stopping-rule.md).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Push class B too: render the 18 charts to plain manifests and apply them with `kubectl` | Ownership of 18 upstream charts' values, hooks and CRD upgrade paths, re-paid on every chart bump | `vault` and `vault-secrets-operator` are in the set; one bad render breaks secret delivery for every Service in the estate |
| Draw the boundary elsewhere — per namespace, or a hand-kept list of pushed objects | A list to maintain across 364 objects and every new adapter | The split is already measured and each object's class is derivable from its adapter; a hand-kept list drifts, and then both appliers claim one object |
| Leave everything with Flux and gate the source update instead | An afternoon for the missing test caller, plus a required merge in front of the Flux source | Not rejected — this is [0008](0008-tested-equals-deployed-requires-push.md)'s live falsification path, and it is why this claim is `open` |

## Reversibility

Undo cost today: nothing is built — class A is still Flux-reconciled, so undo
is this file plus scope notes on [0042](0042-apply-before-prune-inventory.md)
through [0045](0045-break-glass-reporting.md), roughly a day. Becomes
irreversible once: the Flux Kustomization inventories covering the 364 class-A
objects are deleted — after that, undo means rebuilding them by hand, with
nothing pruning class A meanwhile.

## Consequences

- Pruning and continuous reconciliation stop being free: an inventory and
  delete pass ([0042](0042-apply-before-prune-inventory.md)) plus a CronJob per
  aggregator ([0044](0044-reconcile-cronjob.md)) — paid by joris, twice.
- No single answer to what is live; lag is measured per slice — paid by
  anyone debugging at 03:00.
- A merge is now required to deploy, against composition's *"no repository
  needs a merge before a change takes effect"* — but per-relationship, not
  estate-wide — paid by service owners, one PR per relationship change.
- CI cost grows: a change anywhere invalidates every aggregator's pin, so
  roughly six suites run per service change, each provisioning a vcluster — a
  shape the estate measured as *"561 minutes of real compute billed 2,845 —
  four fifths of the spend was rounding"* — paid by joris in Actions minutes,
  against [0051](0051-vcluster-substrate.md)'s thresholds.
- Server-side apply reports a field-ownership conflict where continuous
  reconciliation would silently revert — paid by whoever edited that field.
- The split is a delivery boundary, not a safety boundary, until class B
  carries class A's pinning discipline ([0048](0048-class-b-pinning.md)) —
  paid by joris, who may not call it safety before then.
