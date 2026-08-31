---
status: proposed
---

# Node facts are authored in YAML; Services declare capabilities, not labels

A node is described once, in YAML. The node contract, the k3s label set and the
nix host configuration are all generated from that one file — nix imports node
labels rather than authoring them. A Service declares placement as capability
`requires` and weighted `prefers`, never as label selectors, and both are
validated against what nodes actually advertise.

## Why

Each node was declared three times by hand: `nix-config/inventory/nodes/<n>.yml`
(37–83 lines of capacity, ssh, disks, longhorn and taints),
`nix-config/nix/hosts/<n>/default.nix` (`platformBlueprints.k3s.nodeLabels`, the
labels actually applied), and
`homelab-inventory/node-contract/inputs/<n>.yml` (labels and capacity again, in
different casing — `cpuMillicores` against `cpu_millicores`). Three more
artifacts were generated from those. `specs/002-node-contract-drift` and
`scripts/audit-node-labels.sh` exist to police the disagreement.

`nix-config/generated/node-contract.yml` emits 110 labels for 7 nodes — 55 under
`platform.jorisjonkers.dev/*` and the same 55 under `personal-stack/*`. The
`.nix` files author only the latter, which is named after
`ExtraToast/personal-stack`, an **archived** repository that rejects pushes. The
live cluster's node labels are named after a repository nobody can commit to.

Making YAML the source is what decouples placement from nix. Nix stays
responsible for building machines; it stops being the place the deployment model
must read to know where anything can run.

## Capabilities rather than labels

Placement is expressed as capabilities because the estate has already been burnt
by the alternative. From `fleet-infra/docs/live-divergence.md`: *"No affinity
preference for `gpu-model-gtx960m` — no node advertises it: the 960M's driver is
deliberately left unloaded so the card stops drawing idle power. **An
unsatisfiable preference is silently ignored, so it read as GPU-aware placement
while doing nothing.**"*

That is the failure mode a capability vocabulary closes. A hard `requires` that
cannot be met leaves a pod `Pending`, which is loud. A `prefers` that cannot be
met is discarded by the scheduler in silence, which is why an unsatisfiable
preference is a **build error** here rather than a runtime shrug. The same
document records the corresponding success: *"Architecture is a preference, not a
requirement… as a weighted `nodeAffinity`, so they schedule on Frankfurt rather
than sitting Pending when the Pis are full or down."* Both shapes are needed and
the model must distinguish them.

Keeping labels out of Service Intent also means retiring `personal-stack/*`
touches no service repository.

Placement that is already implied is derived rather than declared. Storage is
`local-path`, so a volume pins its workload to the node holding the PV; that
constraint is stated by the resolver, not repeated by every stateful service.

## Consequences

- Nix must read generated data (`readFile`/`fromJSON`) for its node labels, and
  `nix-config/inventory/` is deleted rather than kept in sync.
- A capability must exist on some node before a Service may require it. Adding a
  capability is a node-declaration change, which is the right place for it.
- One label prefix survives. Retiring the other is a cluster-side change with no
  service-repo impact, but it does mean relabelling live nodes, and
  `CLAUDE.md` is explicit that a `kubectl label` drifts back on the next
  reconcile — so it must go through the generated contract.
