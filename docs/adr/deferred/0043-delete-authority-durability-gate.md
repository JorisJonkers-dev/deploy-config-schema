---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#delete-authority
rests-on: ["0008"]
---

# Deletion is gated by Durability Class

## Rests on

Every kind the registered adapters render is reconstructible by re-applying the
same lock, except a PersistentVolumeClaim, whose contents no re-apply restores.
False if: deleting a deployer's whole labelled set and re-applying its lock
reproduces the live state a consumer sees, volume contents included. Settled by:
on a k3d vcluster, apply the `auth-federation` slice, write a marker file into
every mounted claim, delete the labelled set, re-apply the identical lock, then
diff both the live objects and the mounted file trees; one missing marker
settles it. The dependence on the Durability Class
([0015](../0015-durability-class-per-volume.md)) is carried in prose, not in
`rests-on`: 0015 is a decision, and `rests-on` names premises only.

## Why

The authority is currently wider than the undo. `spec/v1/examples/rendered/deployer-rbac.yaml:29-30`
puts `persistentvolumeclaims` in the same rule as `services`, `serviceaccounts`
and `configmaps` and grants `[get, list, create, patch, update, delete]` with no
`resourceNames`, under a comment claiming the Role is *"Exactly the kinds the …
adapters attribute to auth-api. Nothing else"* — true as a list of kinds, silent
about one of them being irreversible. The only thing that reads like a safeguard
is not one: `--confirm-deletions` (`spec/v1/examples/workflows/aggregator-deploy.yml:95`)
is a non-interactive CI flag passed unconditionally by the workflow, on a path
whose two callers are an Actions job and a CronJob. Neither has a human in it.

Nothing downstream narrows that grant, and nothing behind it restores.
`grep -rniE 'durability|reconstructible|irreplaceable' src/ schemas/` returns
**0 hits**: the field [0015](../0015-durability-class-per-volume.md) introduced
specifically to replace an inert attestation is, today, exactly as inert as the
`rollbackTargetRetention` it condemned. Storage is `local-path` with no CSI
snapshot support and all fourteen PVCs `ReadWriteOnce`; every fixture has exactly
one `k3s-control-plane` host; a grep for `restore`, `RPO` and `RTO` across
`spec/`, `src/` and `schemas/` returns two hits, both about re-applying Flux
manifests (`spec/v1/60-setup.md:96`, `:107`), neither concerning data; and that
chapter's pre-flight checklist rehearses only a break-glass *rollback*, which
re-applies a lock and restores no data. Push delivery ([0008](0008-tested-equals-deployed-requires-push.md))
is what puts a `delete` verb in a token at all; a pull model never held one.

The worked example ties it together: `knowledge-vault-clone` is declared
`durability: irreplaceable` on `local-path` (`spec/v1/examples/knowledge.service.yml:110-112`),
and it is a personal knowledge vault. A rename, a claim moving between Workloads,
or a Service reassigned between Aggregators each present to the prune pass as a
delete-then-create. So: the deployer Role holds `delete` only on kinds reversible
from git. A claim backing non-`reconstructible` data that leaves the render is
`E_ORPHANED_CLAIM` plus a required state-move-plan — the artefact
`schemas/state-move-plan.schema.json` already defines — never an automatic delete,
and `--confirm-deletions` is retired rather than reinterpreted. Ordering is the
other half of this defect, decided in [0042](0042-apply-before-prune-inventory.md).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the verb, add a real interactive confirmation | a prompt in the apply path, plus a held-open CI job per deploy | both callers are unattended by design — a CronJob and an Actions runner — so the prompt is either auto-answered or the reconcile loop stops; the flag that exists is already this idea, auto-answered |
| Keep the verb, refuse in the renderer when `durability != reconstructible` | one check and one negative fixture, days of work | the token still holds `delete` on every claim, so a bug in the check, or any break-glass `kubectl` using the deployer credential, still reaches the vault; RBAC is the only refusal that survives the tool being wrong |
| Set `persistentVolumeReclaimPolicy: Retain` and keep pruning claims | a directory per deleted claim left on the node with no sweep; re-created claims bind fresh empty volumes | protects the bytes and loses the binding: the vault survives as an unreferenced directory nobody is told about, and the Workload comes back empty and healthy |
| Prune nothing, ever | withdrawn hostnames stay served; `IngressRoute` and `VaultStaticSecret` outlive their Service | abandons "the render is the truth" for every reversible kind to protect the one irreversible one, and leaves the coverage assertion permanently red |

## Reversibility

Undo cost today: the delete verbs live in one rendered Role per aggregator plus
one workflow flag — the RBAC adapter, `deployer-rbac.yaml`, `aggregator-deploy.yml`.
Widening the grant back is a two-line diff and a re-render, under an hour, blast
radius one Role per aggregator. Becomes irreversible once an aggregator has run
this narrow Role against production volumes: the Role is then the only thing
between a claim rename and `knowledge-vault-clone`, and re-granting `delete`
restores exactly the state this record exists to end.

## Consequences

- A stateful claim leaving the render stalls the deploy on `E_ORPHANED_CLAIM`
  until a state-move-plan exists; renaming one stops being a one-line edit —
  paid by service owners.
- Dead claims are never reclaimed automatically; the one `k3s-control-plane`
  host accumulates them until swept by hand — paid by the platform owner.
- The RBAC adapter splits `delete` by kind and re-renders every deployer Role;
  `--confirm-deletions` disappears from every aggregator workflow and from the
  lifecycle chapter — paid by adapter maintainers and aggregator repositories.
- [0015](../0015-durability-class-per-volume.md) becomes load-bearing: a volume
  mis-declared `reconstructible` is deletable — paid by whoever declares it.
- The gate protects claims, not the bytes inside them; a Workload that corrupts
  its own volume is untouched — paid by owners who read the gate as a backup.
