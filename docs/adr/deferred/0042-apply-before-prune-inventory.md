---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#apply-and-prune
rests-on: ["0008"]
---

# Apply first, prune last, from an inventory of rendered kinds

## Rests on

Every kind the registered adapters render tolerates a bounded window in which
the outgoing and incoming object both exist, so deferring the delete pass until
after a successful apply costs a transient duplicate, nothing more. False if: a
rendered kind is exclusive — two live objects contend for one resource, so the
overlap breaks the service rather than doubling it (two `IngressRoute`s on one
hostname). Settled by: in a k3d vcluster ([0051](0051-vcluster-substrate.md)),
rename a Service owning a public hostname and a PVC, apply the new slice before
pruning the old, and curl the hostname each second across the overlap; any
non-2xx falsifies it.

## Why

The order was inverted. `spec/v1/examples/workflows/aggregator-deploy.yml` runs
*"Prune what left the render"* (line 82) before *"Server-side apply in DAG
order"* (line 98), and `spec/v1/50-lifecycle.md:105-108` repeats it. Flux
applies then prunes. A rename, or a Service reassigned between Aggregators,
presents here as delete-then-create — and the create can fail: a
field-ownership conflict *"is reported and fails this step"* by design, and the
job times out at 20 minutes. Old object gone, new one never written (B4:
DAT-003, OPS-001, K3S-015).

The inventory was wrong both ways. `50-lifecycle.md:105` reads `prev = kubectl
get -l deploy.jorisjonkers.dev/deployer=<aggregator>` — no resource type, so
kubectl returns one namespace's default set, no custom resources, while the
deployer's declared reach spans two namespaces (`deployer-rbac.yaml:8`) and the
file emits a Role in `auth-system` only ([0047](0047-namespace-per-deployer.md)).
`IngressRoute` and `VaultStaticSecret` are never in `prev`, so a withdrawn
hostname stays served (both Traefiks set `allowCrossNamespace: true`) and a
withdrawn grant leaves VSO refreshing an unaudited Secret.
`persistentvolumeclaims` are not in that set either, while the Role grants
`delete` on them with no `resourceNames`
(`spec/v1/examples/rendered/deployer-rbac.yaml:29-30`) — the inventory cannot
see the one kind the token can destroy. Chapter 50 rests on *"The cluster is
the inventory"* (`:122`).

So: apply in DAG order first, prune only after the apply succeeds — a failed
apply prunes nothing, leaving a superset, never a hole. The inventory
enumerates exactly the kinds the registered adapters render, CRDs and PVCs
included. That list exists already, in the Role (`deployer-rbac.yaml:24-27`:
*"Exactly the kinds the `kubernetes`, `traefik`, `vso`, `prometheus`,
`networking` and `availability` adapters attribute to auth-api"*), and such
duplication is what drifted; so the port
([0053](../0053-adapter-port-contract.md)) carries the kind set as contract data —
`src/adapters/registry.ts` lacks such a field — and both derive from it. A PVC
in the inventory means seen, not deleted:
[0043](0043-delete-authority-durability-gate.md) decides deletion.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep prune-before-apply | Free, and it does avoid the overlap window. Costs a delete-then-create on every rename or reassignment, where a conflict-failed or timed-out apply leaves the old object gone and nothing in its place; recovery is a re-run at best, and nothing at all where the deleted object backed an `irreplaceable` claim | Buys a transient duplicate and pays with a hole; inverts the one ordering Flux got right, for no property the estate needs |
| Keep the bare `kubectl get -l` inventory, treat the rest as orphans | Zero build cost. `IngressRoute` and `VaultStaticSecret` stay unprunable forever: a withdrawn hostname remains publicly served and a withdrawn grant keeps refreshing a Secret, both invisible to the delete pass and indistinguishable from the adoption orphans the chapter trains readers to expect | Silently blind on exactly the two kinds carrying exposure and credentials |
| Enumerate the kinds by hand in the workflow, beside the Role | An hour now; a second hand-maintained list that diverges the moment an adapter emits a new kind, and diverges silently — a missing kind is an object never pruned, with no error anywhere | The same duplication that produced the current defect, doubled |
| Discover kinds at runtime (`kubectl api-resources`, prune everything labelled) | Always complete, never drifts. Widens the delete surface from what this deployer renders to every kind the API server serves, class-B and Flux-owned objects included; one mislabelled object anywhere becomes deletable | Contradicts the bounded delete authority of [0043](0043-delete-authority-durability-gate.md) and the one-deployer rule of [0047](0047-namespace-per-deployer.md) |

## Reversibility

Undo cost today: hours, documents only; nothing implements this — `apply prune`
is named in the workflow example and in no source file. Undoing reorders two
steps in `../../spec/v1/examples/workflows/aggregator-deploy.yml`, restores the
pseudo-code in `../../spec/v1/50-lifecycle.md`, and drops the kind-set field
from the adapter port: three or four files, no applied state. Becomes
irreversible once: deployer Roles are generated from the declared kind set and
locks applied against them — reverting then regrades every aggregator's RBAC by
hand, and prune-first would reintroduce the delete-then-create window.

## Consequences

- The adapter port gains a declared kind set, all 16 registered adapters
  ([0052](../0052-registered-adapters-are-v1.md)) must state what they render, and
  the Role derives from that list, so RBAC diffs move on adapter changes — paid
  by joris and every future adapter author.
- A failed apply leaves a superset of the intended state until the next run —
  paid by whoever reads the drift report
  ([0058](0058-delivery-machinery-observability.md)), now noisier with orphans.
- Renames have a window in which outgoing and incoming objects coexist — paid by
  anything assuming uniqueness, e.g. a hostname briefly served by two routes.
- `IngressRoute` and `VaultStaticSecret` become prunable and PVCs visible to the
  delete pass instead of silently retained — paid by joris in adapter work, and
  by the operator, who must act on a claim reported as left the render.
