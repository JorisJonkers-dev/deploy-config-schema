---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/40-composition.md#unmanaged-surfaces
rests-on: ["0004"]
---

# Un-deployed hostnames are Registered Unmanaged Surfaces

Service Intent covers Kubernetes workloads only. Any hostname the model does
not deploy is listed as a **Registered Unmanaged Surface** carrying an owner, a
reason and a review date, and composition asserts that estate reachability
equals the derived set plus the registered set exactly. An unregistered
hostname is a build error.

## Rests on

A hostname must be unique estate-wide, so per
[0004](0004-contention-decides-authority.md) it is contended and takes exactly
one authoritative form — which for a host the model does not deploy can only be
a registration, since there is no derivation to be the authority. False if: a
hostname exists that is neither derivable from a Service nor attributable to
one owner with a stated reason — a wildcard, a dynamically allocated name, or a
host two parties both claim. Settled by: composing the full participants
list and diffing `derived ∪ registered` against
`homelab-inventory/catalog/reachability.yml`, asserting the symmetric
difference is empty and that every registered entry carries a non-empty
`owner`, `reason` and `reviewBy`.

## Why

The estate has three deployment targets, not one. `samba` exists only as a
NixOS module yet owns `samba.lan.jorisjonkers.dev`; `wolf` exists in neither
target and owns `wolf.jorisjonkers.dev`; `adguard` and `ollama` exist in both
Kubernetes and nix. Host-level services — `tailscale`, `media-storage`,
`backup-storage`, `btrfs-backup-snapshots` — have no cluster presence at all.
Modelling all of them was rejected: rendering NixOS is not writing a file but
producing a build and an activation, an order of magnitude larger v1. So
Service Intent stays Kubernetes-only.

That leaves a remainder, and an unbounded remainder is how the seven-way split
of `kb.jorisjonkers.dev` began: a scope boundary silent about what falls
outside it bounds nothing, and moves the drift where no check looks.

Registration bounds the remainder without modelling it. Each un-deployed
hostname is a ledger entry per [0055](0055-bidirectional-ledgers.md) with an
owner, a reason and a review date, and the render asserts set equality against
the estate reachability channel: derived entries come from Audience declarations
([0018](0018-exposure-by-audience.md)), registered entries come from the ledger,
and anything in neither is `E_UNREGISTERED_SURFACE`. `wolf`'s status — a
public hostname with no deployment in either target — becomes explicit data
with a name against it rather than an accident nobody had noticed.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Model NixOS hosts as a second deliverable target | a second render port beside [0053](0053-adapter-port-contract.md) whose output is a build and an activation, not a file; every layer-1 concept (probes, policy, grants) needs a nix meaning | an order of magnitude more v1 scope to cover roughly eight hosts, against the stopping rule in [0059](0059-v1-scope-stopping-rule.md) |
| Leave the remainder unlisted — Kubernetes-only, silence outside | zero authoring cost; reachability stays hand-authored for un-deployed hosts | no check can fire on a host nobody claims; `wolf` sat public and undeployed with no owner of record, which is the failure this decision exists to make impossible |
| Register hostnames as prose in a README | cheap to write, and no schema change | prose cannot be diffed against the derived set, so set equality is unassertable and the register rots exactly like the seven-way split did |

## Reversibility

Undo cost today: hours. The register is one collection file plus the
set-equality assertion in composition; deleting both and letting reachability go
back to hand-authorship touches the composition step and the entries for roughly
eight hosts. Blast radius is confined to the reachability channel.
Becomes irreversible once: the edge catalogs and the Gatus endpoint ConfigMap
are generated from the composed reachability set. Past that point the register
is load-bearing for un-deployed hosts, and removing an entry silently withdraws
a route and its monitoring instead of raising an error.

## Consequences

- Every hostname in the estate has exactly one owner of record, derived or
  registered — paid by whoever owns an un-deployed host, who must file a
  registration before the next compose succeeds.
- Composition fails closed on a hostname nobody claims
  (`E_UNREGISTERED_SURFACE`) — paid by the aggregator operator, who absorbs
  the first-run failures while the backlog is registered.
- A registration is an unverified assertion: nothing proves `samba` is actually
  listening where the registration claims — paid by consumers of the
  reachability set, who inherit a claim no check validates.
- Review dates make registrations expire, so the register is recurring work
  rather than a one-time backfill — paid by each registration's named owner.
- Service Intent stays Kubernetes-only, so NixOS-only services get no probes,
  no policy and no grants from this model — paid by their owners, who keep two
  toolchains and gain only a hostname entry from this one.
