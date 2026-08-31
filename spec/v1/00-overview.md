# deploy-config-schema v1 — specification index

This branch holds the v1 specification only. Nothing under `schemas/`, `src/` or
`fixtures/` is touched; the published package continues to serve its consumers
from `main` unchanged.

Vocabulary is in [`CONTEXT.md`](../../CONTEXT.md). Decisions are in
[`docs/adr/`](../../docs/adr/). Neither restates the other: the glossary defines
terms, the ADRs record why.

## The three layers

| Layer | Name | Authored | Owns |
|---|---|---|---|
| 1 | Service Intent | by hand, in the owning repo | requirements, never mechanisms |
| 2 | Resolved Deployment | never — derived | every platform decision |
| 3 | Deliverable Set | never — serialized | files, no decisions |

The rule that makes this worth naming: **Layer 1 contains no mechanisms, Layer 3
contains no decisions.** Every field is assignable to exactly one layer, and
which layer is decided by the contention test in ADR-0003.

## Decision register

| ADR | Decision |
|---|---|
| [0002](../../docs/adr/0002-three-layer-meta-model.md) | Three layers, the middle one a versioned contract |
| [0003](../../docs/adr/0003-contention-decides-authority.md) | Contention decides who declares a value |
| [0004](../../docs/adr/0004-flat-service-identity.md) | One flat Service Id; renames are data |
| [0005](../../docs/adr/0005-credential-provisioning.md) | Claims by Vault path; four Claim Modes |
| [0006](../../docs/adr/0006-reconcile-unit-is-derived.md) | Reconcile Unit derived from the dependency graph |
| [0007](../../docs/adr/0007-configuration-and-assets.md) | Config declares its source; code is not configuration |
| [0008](../../docs/adr/0008-runtime-mechanics-derived-from-intent.md) | Runtime mechanics derived from declared intent |
| [0009](../../docs/adr/0009-node-facts-and-placement.md) | Node facts in YAML; Services declare capabilities |
| [0010](../../docs/adr/0010-exposure-by-audience.md) | Exposure by Audience; unmanaged surfaces registered |
| [0011](../../docs/adr/0011-dependency-edges.md) | Dependency edges carry a Surface; edges become policy |
| [0012](../../docs/adr/0012-observability-by-class.md) | Scrape surface plus Alert Class |
| [0013](../../docs/adr/0013-schema-version-lockstep.md) | Exact-match retained; Renovate behind an ordering gate |
| [0014](../../docs/adr/0014-co-testing-by-relationship.md) | System tests owned by relationship projects |
| [0015](../../docs/adr/0015-composition-by-oci-fragments.md) | OCI fragments; the lock is an output |
| [0016](../../docs/adr/0016-deliverables-and-ledgers.md) | Adapters own Deliverables; holes are bidirectional ledgers |
| [0017](../../docs/adr/0017-resolved-deployment-publish-back.md) | Assignments written back to the owning repository |
| [0018](../../docs/adr/0018-derived-value-overrides.md) | Derived values overridable inline; assignments are not |

## Chapters to write

Each lands as its own pull request into `v1-pre-release`, carrying its prose, its
diagram, and worked example YAML.

| Chapter | Covers | Diagram |
|---|---|---|
| `10-service-intent.md` | Service, Workload, identity, aliases, Domains | `10-service-intent.mmd` |
| `11-secrets.md` | Claims, Subtrees, the four Modes, Rotation Tolerance | in `10` |
| `12-configuration.md` | sources, Runtime Profiles, Coordinates, Assets, Change Response | in `10` |
| `13-runtime.md` | Startup Budget, health, rollout, volumes, Durability Class | in `10` |
| `14-exposure.md` | Audience, Surfaces, paths, Registered Unmanaged Surfaces | in `10` |
| `15-placement.md` | Capabilities, requires/prefers, volume pinning | in `10` |
| `16-dependencies.md` | Edges, Surfaces, the four derivations | `40-derivation-map.mmd` |
| `17-observability.md` | scrape, Alert Class, notifier routing | in `10` |
| `20-resolved-deployment.md` | what layer 2 assigns, and publish-back | `20-resolved.mmd` |
| `30-deliverables.md` | Adapters, Fragments, coverage, ledgers | `30-deliverables.mmd` |
| `40-composition.md` | Intent Fragments, participants, the lock | `60-topology.mmd` |
| `50-lifecycle.md` | build, co-test, publish, compose, render, reconcile | `50-pipeline.mmd` |

`40-derivation-map.mmd` is the load-bearing diagram. It maps each declared field
to every Deliverable derived from it, and its acceptance criterion is structural:
**any node with two inbound arrows is a bled concern.** One declaration of
`exposure.audience` must reach the hostname, the IngressRoute, the reachability
entry, the Gatus check and both edge catalogs — the six sites that previously
each declared `kb.jorisjonkers.dev` independently.

## Open items

Decisions this specification depends on and does not itself make.

1. **Kubernetes secrets-at-rest encryption.** ADR-0005 makes `mode: env` and
   `mode: file` conditional on it. No `--secrets-encryption` configuration exists
   in `nix-config` or the bootstrap tree today. Blocks those two modes; `fetch`
   and `write` are unaffected.
2. **Default-deny promotion.** ADR-0011 requires audit mode first. The criterion
   for promoting to enforce is unstated.
3. **Four images to build.** ADR-0007 moves `hermes-bootstrap` (221 lines of
   shell), `n8n-hooks` (499 lines of JavaScript) and the `garage` bootstrap out of
   ConfigMaps, and retires the `alpine:3.21` plus ConfigMap pattern.
   `postgres-init-script` needs no image because it becomes derived.
4. **Label prefix retirement.** ADR-0009 keeps one prefix. Retiring
   `personal-stack/*` means relabelling live nodes, and `CLAUDE.md` is explicit
   that a `kubectl label` drifts back on the next reconcile — so it must go
   through the generated contract.
5. **Where third-party Service Intent lives.** ADR-0015 has each Domain publish
   its own Intent Fragment, but whether `homelab-collections` splits into
   per-domain repositories or stays one repository publishing several fragments is
   undecided.
6. **Per-adapter totality measurement.** ADR-0016's cost is the gap between
   "attributable" and "total" across 342 files. That gap should be measured per
   adapter before any schedule is set.
