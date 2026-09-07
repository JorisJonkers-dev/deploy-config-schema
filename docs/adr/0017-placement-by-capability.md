---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#placement
rests-on: ["0005"]
---

# Placement is declared as capabilities, never labels

## Rests on

A node-affinity *preference* naming a key no node carries is discarded by the
scheduler without an event, a warning or a condition. False if: a pod with a
`preferredDuringSchedulingIgnoredDuringExecution` term matching no node label
surfaces any diagnostic. Settled by: apply a Deployment with a weighted
`nodeAffinity` on `platform.jorisjonkers.dev/capability-does-not-exist`, then
`kubectl describe pod <pod>` and `kubectl get events --field-selector
involvedObject.name=<pod>` — Running, no event, confirms it.

## Why

The estate has already been burnt by the alternative. From
`fleet-infra/docs/live-divergence.md`: *"No affinity preference for
`gpu-model-gtx960m` — no node advertises it: the 960M's driver is deliberately
left unloaded so the card stops drawing idle power. **An unsatisfiable
preference is silently ignored, so it read as GPU-aware placement while doing
nothing.**"* The shapes fail differently: an unmet hard `requires` leaves a pod
`Pending`, which is loud; an unmet `prefers` is dropped by the scheduler in
silence. That asymmetry is why an unsatisfiable preference is a **build error**
here (`E_CAPABILITY_UNSATISFIABLE`, [chapter
40](../../spec/v1/40-composition.md)) — before the manifest exists is the only
place the silence can be broken.

Both shapes are needed. The same document records the success case:
*"Architecture is a preference, not a requirement… as a weighted `nodeAffinity`,
so they schedule on Frankfurt rather than sitting Pending when the Pis are
full or down."* Only-hard turns a capacity dip into an outage; only-soft cannot
say a workload needs the ingress node.

Labels are also not the Service's to name.
`nix-config/generated/node-contract.yml` emits 110 labels for 7 nodes — 55 under
`platform.jorisjonkers.dev/*` and the same 55 under `personal-stack/*`, named
after an archived repository that rejects pushes. Authored as selectors,
retiring that prefix is an edit in every service repository; as capabilities it
touches none. Losing the capability on the way out costs as much:
`src/adapters/flux-utils.ts:957-958` finds the host advertising the requested
capability and returns a selector on that host's *site*, discarding it, so
`test/fixtures/kubernetes-parity/postgres-derived.yaml:13` renders
`personal-stack/site: frankfurt` and a workload requiring `public-ingress` lands
on any node in the site. Pinning already implied stays derived instead: a
`local-path` volume ties its Workload to the node holding the PV and the
resolver states that ([0015](0015-durability-class-per-volume.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Node label selectors in Service Intent (the v2 shape) | retiring `personal-stack/*` — 55 of the 110 labels on 7 nodes — becomes an edit in ~30 service repositories instead of one node declaration | placement would be coupled to a naming decision no service owner takes part in |
| Capabilities, but an unsatisfiable `prefers` is a warning | reproduces the `gtx960m` outcome with a log line nobody reads | the silence is the failure being closed |
| Hard `requires` only, no preferences | arm64 workloads sit `Pending` when the Pis are full or down instead of scheduling on Frankfurt — the case the divergence document records as working | availability traded away for a distinction the model can afford |
| Declare node pinning for `local-path` volumes explicitly | every stateful Service restates a constraint the resolver already derives from the volume, and the two disagree the first time a PV moves | derivable from declared intent ([0005](0005-derivation-is-total.md)) |

## Reversibility

Undo cost today: one intent-schema block plus the selector/affinity derivation
(`src/adapters/kubernetes.ts:476` already emits `<cluster>/capability-<name>`)
— under a day, then re-authoring placement in every Service that declares it;
blast radius is a reschedule per workload whose `nodeSelector` changes. Becomes
irreversible once: the hand-authored node inventory is deleted for the generated
contract ([0056](0056-node-facts-single-source.md)) — no hand-maintained label
list then exists to write a selector against.

## Consequences

- A capability must exist on some node before a Service may require or prefer
  it; adding one is a node declaration — paid by the platform owner.
- Composition fails the build when `requires` or `prefers` names a capability
  no node advertises — paid by service authors, who lose the silent no-op.
- Adapters must carry the capability into the selector key instead of
  collapsing it to a site match, and the renderer's two label schemes become
  one — paid by adapter maintainers.
- Volume pinning is stated once by the resolver, so stateful Services declare
  durability and nothing about nodes — paid by resolver maintainers.
- Retiring the archived prefix touches no service repository, but does mean
  relabelling live nodes through the generated contract, since a hand-applied
  label drifts back on the next reconcile — paid by the platform owner.
- "Just run it on that machine" is no longer expressible without naming a
  capability first — paid by whoever wanted the shortcut.
