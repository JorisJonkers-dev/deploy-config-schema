---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/40-composition.md#fragments
rests-on: ["0001", "0005"]
---

# Declarations compose from published OCI fragments

## Rests on

No single repository can evaluate the estate-wide properties this specification
requires. False if: composing one fragment in isolation leaves zero assertions
unevaluated. Settled by: compose one fragment alone and count the assertions that
cannot run — seven, tabled in [chapter 40](../../spec/v1/40-composition.md).

## Why

Each domain repository publishes its own declarations — Service Intents, its
Secret Subtree, node facts, test projects — as an OCI artifact on release.
Composition resolves the current set at render time, unions it, asserts the
estate-wide invariants, and records every resolved digest in the lock beside the
render. Seven properties, spread across six earlier decisions, need that global view: estate-wide Service Id
uniqueness ([0010](0010-flat-service-identity.md)), Secret Subtree union with
prefix-collision rejection ([0023](0023-grant-unit-is-the-path.md)), reconcile
DAG construction ([0032](0032-reconcile-unit-derived.md)), hostname assignment
and reachability completeness ([0018](0018-exposure-by-audience.md)), inbound
edges for co-test sets ([0020](0020-dependency-edges-carry-surface.md)), and
test project discovery ([0049](deferred/0049-aggregator-owned-tests.md)). None works
against one repository, because no Service knows its own consumers — the
totality [0005](0005-derivation-is-total.md) demands of derivation.

Git submodules were the obvious candidate, rejected on the estate's own
evidence. A pointer bump is a push and a merge, so submodules do not remove the
central merge point — they make it mandatory for every change. `workspace` runs
a sync bot precisely because pointer bumps do not happen by themselves, and its
[agent contract](https://github.com/JorisJonkers-dev/workspace/blob/main/CLAUDE.md)
records the lag: *"The audit reads pinned pointers, not live `main`… so a fix
merged since the last sync shows as drift for up to a day."* Live discovery by
repository topic was rejected for reproducibility and a documented failure mode
in the same file: *"A repo without one lands in `inbox/` rather than blocking the
sync — so it fails quietly."*

OCI publication is the pattern the estate already runs for exactly this purpose:
`homelab-inventory` publishes `cluster-deploy-context-public` and
`cluster-deploy-context-internal` to GHCR, and consumers pin them by digest with
no submodule anywhere. The lock is an **output**, for a mechanical reason — an
artefact cannot contain its own digest. `context/public/context-manifest.yml`
ships with `packageDigest: ""` because the digest does not exist until the push
completes, so `oras resolve` must follow `oras push`. Recording digests on the
consumer side satisfies the property that **no repository needs a merge before a
change takes effect**, and keeps a render reproducible from recorded digests.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Git submodules, pointers bumped centrally | A pointer-bump PR per declaration change, the sync bot that already exists to make those bumps happen, and up to a day of recorded drift | Does not remove the central merge — makes it mandatory for every change |
| Live discovery by repository topic | No pinning, so no reproducible render; a repo missing its topic lands in `inbox/` and contributes nothing, silently | Reproducibility, and a failure mode the estate has already observed |
| Each fragment pins its peers (lock as input) | Every fragment must carry digests that do not exist at authoring time | Mechanically impossible; `packageDigest: ""` is the evidence in the tree |
| One declarations directory in this repository | Every domain merges here before a change takes effect; independent release cadence is gone | Contradicts [0001](0001-estate-scale-and-ownership.md). It would delete OCI publication, `lockChain`, the participants list, dormancy and both participant errors, and stays the fallback if that premise fails |

## Reversibility

Undo cost today: swapping OCI resolution for a checked-in declarations directory
touches the per-repo publish workflow, the resolver, the participants list and
both participant errors — chapter 40 plus the composition module, roughly a day.
Blast radius is one repository: the lock is an output and nothing pins a fragment
by digest except the lock. Becomes irreversible once: a repository outside this
owner's control publishes on its own cadence — removing OCI publication then
needs a merge in every one of them, the cost this decision was taken to avoid.

## Consequences

- A render is only as current as the last publish; a domain that has not
  published does not contribute — paid by the domain repository owner.
- Because Flux prunes, a silently omitted domain is deleted from the cluster on
  the next reconcile while the render still validates, so the participants list
  and its staleness bound ([0038](0038-participants-list-staleness.md)) are
  load-bearing rather than hygiene — paid by the estate owner.
- Composition itself merges nothing: a fragment publishes, composition runs, a
  lock is published. The pull request introduced by
  [0041](deferred/0041-push-delivery-boundary.md) is per-relationship rather than
  estate-wide and runs that relationship's system tests, it does not record
  pointers; aggregators pin the composed lock rather than individual fragments,
  so the invariants are evaluated exactly once — paid by the aggregator.
- Each participant needs a publish workflow and credentials, and debugging means
  resolving digests, not reading a tree — paid by that owner and by on-call.
