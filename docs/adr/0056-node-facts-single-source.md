---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/60-setup.md#node-facts
rests-on: ["0005"]
---

# Node facts are authored once; nix imports them

## Rests on

Every node fact the host build needs can be read from generated data at nix
evaluation time, so deleting the hand-authored inventory loses nothing. False
if: a host configuration needs a fact the node contract cannot carry, or the
generator needs a machine nix has not built yet. Settled by: with
`nix/hosts/<n>/default.nix` setting `platformBlueprints.k3s.nodeLabels` via
`builtins.fromJSON`, diff `nix eval .#nixosConfigurations.<n>.config.platformBlueprints.k3s.nodeLabels --json`
against `yq -o=json '.nodes.<n>.labels' nix-config/generated/node-contract.yml`
for all 7 hosts with `nix flake check` green.

## Why

Each node is declared three times by hand.
`nix-config/inventory/nodes/<n>.yml` carries 37–83 lines of capacity, ssh,
disks, longhorn and taints; `nix-config/nix/hosts/<n>/default.nix` carries
`platformBlueprints.k3s.nodeLabels`, the labels actually applied to the live
node; `homelab-inventory/node-contract/inputs/<n>.yml` carries labels and
capacity a third time in different casing — `cpuMillicores` against
`cpu_millicores`. Three further artifacts are generated from those inputs, and
the estate does not claim they agree: `specs/002-node-contract-drift` and
`scripts/audit-node-labels.sh` exist only to police the disagreement.

The duplication shows in the output. `nix-config/generated/node-contract.yml`
emits **110 labels for 7 nodes** — 55 under `platform.jorisjonkers.dev/*` and
the same 55 under `personal-stack/*`. The `.nix` files author only the latter,
named after `ExtraToast/personal-stack`, an **archived** repository that
rejects pushes: the live labels are named after a repository nobody can commit
to. The renderer inherited the name — `src/adapters/flux-utils.ts:957-962`
builds its selector key from `platform.name`, so
`test/fixtures/kubernetes-parity/postgres-derived.yaml:13` renders
`personal-stack/site: frankfurt`.

One YAML file per node is the source; node contract, k3s label set and nix host
configuration are all generated from it. Nix reads generated data
(`readFile`/`fromJSON`) rather than authoring labels, and
`nix-config/inventory/` is deleted rather than kept in sync. Nix then builds
machines and stops being the place the deployment model must read to learn
where anything can run — the precondition for
[0017](0017-placement-by-capability.md), whose capabilities need one advertised
label set to validate against. Retiring the dead prefix goes through
the generated contract rather than a `kubectl label`, which the [estate agent
contract](https://github.com/JorisJonkers-dev/workspace/blob/main/CLAUDE.md)
warns drifts back on the next reconcile.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the three declarations and the drift machinery | every node change stays three edits across two repositories in two casings, and `specs/002-node-contract-drift` plus `scripts/audit-node-labels.sh` stay funded and green forever | a detector that finds the copies disagreeing is cheaper to delete than to run; it reports the problem it exists because of |
| Invert it — nix is the source, the YAML contract generated from `.nix` | composition must evaluate a flake to learn a node’s capabilities, so nix enters CI for every consumer that resolves placement | node facts become readable only through a toolchain no service repository has, and the fact is needed by the resolver, not the machine builder |
| Keep `homelab-inventory` authoritative, retain the nix inventory as a cache, keep both label prefixes | two writable copies survive so the audit script survives with them, and 110 labels on 7 nodes persist with half under a name nobody can correct at its source | the second writable copy *is* the drift, and the archived-repository name outlives every attempt to explain it |

## Reversibility

Undo cost today: `git revert` restores `nix-config/inventory/` in minutes, but
re-authoring labels into 7 `nix/hosts/<n>/default.nix` files, re-splitting the
casings and rewriting the drift spec and audit script to match is a day; blast
radius is a nix rebuild per host and no service repository either way. Becomes
irreversible once: the live nodes are relabelled to the single surviving prefix
through the generated contract — the hand-authored files then no longer
describe the cluster, and reverting means relabelling 7 nodes back.

## Consequences

- Nix reads generated data for its labels and gains a build-order dependency on
  the generator — paid by the nix-config maintainer.
- `nix-config/inventory/` is deleted, and with it the reason
  `specs/002-node-contract-drift` and `scripts/audit-node-labels.sh` exist —
  paid by the platform owner.
- A capability or capacity fact exists only once the node YAML declares it —
  paid by the platform owner.
- Retiring `personal-stack/*` touches no service repository but does mean
  relabelling live nodes through the contract — paid by the platform owner.
- The selector key comes from the contract’s prefix rather than `platform.name`,
  changing output for every workload carrying a `nodeSelector` — paid by
  adapter maintainers.
- One casing wins, so consumers reading `cpu_millicores` are repointed at the
  contract — paid by the owners of the three downstream artifacts.
