---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/10-service-intent.md#pod-hardening-and-resource-class
rests-on: ["0005"]
---

# Pod hardening and resource class are layer-1 vocabulary

## Rests on
Every image the estate runs can start under `restricted` — `runAsNonRoot`,
`readOnlyRootFilesystem`, all capabilities dropped, seccomp `RuntimeDefault` —
with a small, nameable set of exceptions. False if: a load-bearing image cannot
run non-root and has no rebuildable equivalent, so the default must be relaxed
rather than excepted. Settled by: rendering with the default class into a
vcluster ([0051](deferred/0051-vcluster-substrate.md)), then `kubectl get pods -A
--field-selector=status.phase!=Running` — each pod it names is a declared
exception with a reason, or a rebuild.

## Why
The vocabulary does not exist and neither renderer emits the fields.
`grep -rniE 'securityContext|runAsNonRoot|readOnlyRootFilesystem|seccompProfile'
src/ schemas/` returns **0 hits** (verified 2026-08-31; the grep spans *both*
renderer generations, so choosing one under
[0052](0052-registered-adapters-are-v1.md) does not rescue it).
`src/deployment/render/workloads.ts:130` builds a container from name, image,
pullPolicy, ports, command, args, env, envFrom, volumeMounts, probes and
resources — and stops. `resources` is emitted only when the model already carries
it, and `size`, the field that would supply it, is `<<proposed>>` and ungraded
(`../../spec/v1/00-overview.md` open item 7). Rendered pods run as their image's
UID, writable root, default capabilities.

The consequence is availability before it is policy. On a single node the k3s
server process, the datastore, the in-cluster deploy runner and every application
pod share one kernel with no reservation between them; the standing QoS class for
the estate is BestEffort. One leaking container drives node memory pressure and
the kubelet evicts from a pool where every candidate has identical priority,
including the runner that would repair the damage. The security half is worse to
fix late, which is why the review graded this a Blocker: hardening is a layer-1
field, and layer 1 is hand-authored across about ten
repositories ([0001](0001-estate-scale-and-ownership.md)), so the retrofit is a
pull request per Service — about thirty — plus a coordinated image rebuild — the
only finding in the review that gets strictly more expensive every week
(`review/CONSOLIDATED.md` B6).

Both fields become vocabulary now, before the first production apply. `size` is a
closed class, `xs` through `xl`: the class name is what an author writes, and the
requests and limits behind it live in the normative chapter, reaching the render
through the pinned Cluster Context ([0006](0006-pinned-inputs.md)) — capacity is
contended, so the contention test ([0004](0004-contention-decides-authority.md))
puts the numbers on the platform side, exactly as the durability class
([0015](0015-durability-class-per-volume.md)) already works. The hardening class
defaults to `restricted`; a Workload that cannot meet it declares the specific
exception with a reason, in the shape used for derived-value overrides
([0031](0031-derived-overrides-with-reason.md)). The claim stays open because the
estate's images have not been run against that default — the vocabulary's point
is that exceptions become declared and counted, not silent.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Accept BestEffort and root-by-default as an owned risk (the review's own stated alternative) | Nothing today; the same ~30 pull requests and image rebuild later, but against running services, each taking a restart, and after the eviction that prompts it | The cost does not stay flat — it is the one finding that rises weekly, and the first eviction storm on a shared kernel takes the deploy runner with it |
| Enforce from the platform only, via Pod Security Admission or an admission mutation | An admission controller on a single-node cluster; PSA can reject but never fill in, so a non-conforming pod fails at apply with no exception path a Service can author | A mutating default is a value the render cannot see, contradicting [0005](0005-derivation-is-total.md); rejection with no declared exception is an outage found at apply time |
| Free-form `resources` per Workload instead of a closed class | Each hand-authored Service negotiates node capacity alone; a platform-wide capacity change becomes 30 pull requests | Requests and limits are contended, so [0004](0004-contention-decides-authority.md) forbids declaring them; a class name is defensible by a Service owner, a millicore number is not |

## Reversibility
Undo cost today: two enum fields and an exceptions list in the layer-1 schema, the
class table in chapter 10, and the container renderer in the surviving adapter —
one afternoon, blast radius nil while no repository has authored them. After
adoption the undo is thirty pull requests, the size of the retrofit it avoided;
editing the table stays cheap but loud, since every pod whose class moves is
rescheduled next reconcile. Becomes irreversible once: images have been rebuilt
around a non-root UID and volumes chowned to match — ownership on the
PersistentVolumes then encodes it, and reverting is a data migration.

## Consequences
- Every Workload across the estate's ~30 Services gains two required fields
  before the first production apply, about thirty pull requests — paid by the one
  maintainer.
- Images that cannot run non-root are rebuilt or excepted in writing, and that
  list is the estate's inventory of what it cannot harden — paid by whoever
  adopts each image.
- QoS stops being BestEffort estate-wide, so eviction gains a real order and the
  deploy runner can sit above the pool it repairs — paid by the platform owner,
  in a class table kept honest against node capacity.
- A wrong row in that table mis-sizes every Service in the class at once, and
  the correction reschedules them all — paid by the estate, next reconcile.
- Grading `size` closes one of chapter 10's three `<<proposed>>` fields; settling
  the claim inherits [0051](deferred/0051-vcluster-substrate.md)'s risk — paid by joris.
