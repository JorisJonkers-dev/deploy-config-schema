---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/00-overview.md#substrate
---

# Kubernetes stays, for two properties that must be made real

## Rests on
Both retained properties — the API server as a per-aggregator authorisation
boundary, and server-side-apply field ownership as the drift signal — can be
made real at this scale. False if: either cannot — an aggregator can still
mutate a Service it does not deploy after
[0047](deferred/0047-namespace-per-deployer.md) lands, or a hand edit to an
owned field still surfaces no conflict after
[0046](deferred/0046-distinct-field-managers.md) lands. Settled by: a `kubectl
auth can-i` matrix (every aggregator ServiceAccount × every foreign namespace ×
create/patch/delete, all `no`) run after 0047 is applied, and one provoked
field-manager conflict — hand-edit a field the deployer owns, let the re-apply
CronJob run, observe the reported conflict — after 0046 is applied.

## Why
The estate uses none of the headline properties Kubernetes is bought for.
Rescheduling does not exist: storage is `local-path`, the fourteen PVCs are
`ReadWriteOnce`, and a `local-path` volume does not survive its node, so every
stateful workload is pinned to one machine by construction. Control-plane HA
does not exist: every platform fixture carries exactly one `k3s-control-plane`
host (`fixtures/platform/single-node.platform.yaml:30`,
`full-tree.platform.yaml:42`, `multi-site.platform.yaml:37`). Horizontal scale
is not exercised: `auth-api`'s two replicas "were a capacity decision on freed
Frankfurt budget, not an availability requirement"
(`spec/v1/10-service-intent.md:491-492`), and on one node two replicas is two
processes on one kernel. The overhead is counted: 405 rendered objects — 364
class A plus 41 pack-delivered, of 450 live — for ~30 Services
(`spec/v1/50-lifecycle.md:33`), and the foundation 41 is the part with the CVEs
and the CRD upgrades.

Exactly two properties justify keeping it. First, the API server as the
authorisation boundary: "a workflow that tries to apply a Service it does not
own receives a 403 rather than producing a bad deploy"
(`spec/v1/50-lifecycle.md:200`). Second, server-side-apply field ownership as
the drift mechanism: a conflict "means a human edited a field this aggregator
owns: it is reported, never resolved with `--force-conflicts`"
(`spec/v1/50-lifecycle.md:151`). The review (`review/CONSOLIDATED.md` B9)
verified both fail as currently designed. The boundary fails because the
generated deployer Role is namespace-scoped with no `resourceNames` while
`aliases.namespace` lets two Services share a namespace — so the ownership rule
is a CI check, not an API-server control. The drift signal fails because the
merge deploy and the hourly re-apply CronJob deliberately share the
field-manager name `auth-federation`
(`spec/v1/examples/workflows/aggregator-deploy.yml:103`,
`spec/v1/examples/rendered/reapply-cronjob.yaml:56`), so server-side apply
cannot report a conflict between the two writers most likely to collide.
[0047](deferred/0047-namespace-per-deployer.md) and
[0046](deferred/0046-distinct-field-managers.md) are what make the two
properties real; this premise stands or falls with their settling measurements,
which is why its claim is open.

The rival substrate is already resident: the estate runs Nix as a second
deployment target for five host services (`samba`, `wolf`, `tailscale`,
`media-storage`, `btrfs-backup-snapshots`). Collapsing onto it would delete the
41 foundation objects, two Traefiks, MetalLB, VSO and the upgrade treadmill —
and would also delete the authorisation boundary and field-level ownership,
which nothing on a plain host provides for free. The honest framing, carried
from `review/04-k3s.md`: the substrate is kept as "a declarative object store
with field-level ownership and an authorisation boundary, that happens to also
run containers", and every design resting on this premise is judged against
those two properties — never against scheduling, HA or scale.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Plain NixOS + systemd per node | rewrite the 16 registered adapters as module generators; rebuild per-aggregator authorisation and drift detection out of ssh grants and diff tooling | loses both retained properties; the estate already scoped NixOS rendering out of v1 because it "is not writing a file but producing a build and an activation" |
| docker-compose per node | the same two losses, plus hand-rolled pruning and the disappearance of the operator ecosystem (cert-manager, external-dns, VSO) | weaker than the Nix option on every axis the Nix option already loses on |
| Nomad | operate a second orchestrator nobody in the estate knows; today's only Nomad traces are a contract-only slot the validator pins to `renderer_status: design_only` (`src/artifact-validator.ts:178-197`) | buys server-side scheduling the estate does not use, while still lacking server-side-apply field ownership |

## Reversibility
Undo cost today: weeks, whole-estate blast radius — all 16 registered adapters
emit Kubernetes kinds, the delivery workflows speak `kubectl` and server-side
apply, the 41 foundation objects have no non-Kubernetes packaging, and fourteen
node-pinned `local-path` volumes must be re-homed by hand. The layer-1 intent
files survive a swap: they name no Kubernetes kind.
Becomes irreversible once: the ~10 service repositories holding the estate's ~30
Services author against a shipped v1 whose adapters and delivery machinery are
Kubernetes-shaped — from that point a substrate swap is a v2 migration, not an
undo.

## Consequences
- The estate keeps paying orchestrator overhead — 41 foundation objects, their CVEs and CRD upgrades, roughly a tenth of the object count — for two properties, not for scheduling — paid by joris, in operations time.
- [0046](deferred/0046-distinct-field-managers.md) and [0047](deferred/0047-namespace-per-deployer.md) become load-bearing: until both land and the settling measurements pass, this premise is unproven and every authority or drift claim built on it overstates — paid by joris, who owns the open claim.
- No design may cite rescheduling, HA or horizontal scale as justification; everything resting on this premise assumes node-pinned state and one control plane — paid by future decision authors, in narrowed options.
- The single-server shape leaves the datastore unnamed and unbacked-up; declaring platform facts and rehearsing restore falls to [0057](0057-datastore-and-restore.md) — paid by joris, before the first `irreplaceable` apply.
- Aggregators get platform-enforced 403s and human-edit conflict reports instead of bespoke tooling — paid for out of the foundation overhead above, by joris.
