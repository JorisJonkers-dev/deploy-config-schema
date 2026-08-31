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
| [0005](../../docs/adr/0005-credential-provisioning.md) | Secrets on the Service at two levels; access tiers and delivery |
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
| [0019](../../docs/adr/0019-push-delivery-via-aggregators.md) | Push delivery via aggregators; Flux keeps the foundation |

## Chapters

Each lands as its own pull request into `v1-pre-release`, carrying its prose, its
diagram and worked example YAML. **Diagrams are embedded in their chapter** as
fenced `mermaid` blocks rather than kept as standalone `.mmd` files: GitHub does
not render a bare `.mmd`, so it would be invisible in the review the chapter
exists for, and a copy in both places is the duplication this specification
spends its time removing.

| Chapter | Covers | Diagram |
|---|---|---|
| [`10-service-intent.md`](10-service-intent.md) | **written** — Service, Workload, and every layer-1 field by concern | embedded |
| [`16-dependencies.md`](16-dependencies.md) | **written** — edges, inbound derivations, the derivation map | embedded |
| [`20-resolved-deployment.md`](20-resolved-deployment.md) | **written** — the purity rule, the assignment catalogue, publish-back | embedded |
| [`30-deliverables.md`](30-deliverables.md) | **written** — Fragments, the adapter set, measured coverage, ledgers | embedded |
| [`40-composition.md`](40-composition.md) | **written** — Intent Fragments, the 26 estate-wide invariants, the lock | embedded |
| [`50-lifecycle.md`](50-lifecycle.md) | **written** — push delivery, aggregators, prune, drift, rollback | embedded |

**Chapter 16's derivation map is the load-bearing artefact**, and its value is
that it is checkable by a script rather than read by eye. Three properties hold
over it:

1. **Totality** — no Deliverable has in-degree zero. An object reachable from no
   declaration is hand-written, and must either become derived or be entered in a
   Bidirectional Ledger. This is what was violated seven ways over by
   `kb.jorisjonkers.dev`.
2. **Single authority** — no field of a Deliverable has two declaring sites.
   Checked against the renderer's attribution table, not the diagram, because the
   diagram is object-level and this property is field-level.
3. **No dead declarations** — no declaration has out-degree zero. A declared field
   that derives nothing is ceremony, which is exactly what
   `rollbackTargetRetention` and `platform.layer` were.

An earlier draft of this section claimed the criterion was "any node with two
inbound arrows is a bled concern". That was wrong and is superseded: a
`Deployment` legitimately draws on `image`, `config`, `claims`, `health` and
`placement`. Convergence on an object is normal; convergence on the same *field*
of an object is the defect.

## Open items

Decisions this specification depends on and does not itself make.

1. **`exposure[].name` and apex hosts.** Chapter 20 corrects ADR-0003 by
   separating *identity* (unique, declared, checked) from *pool* (finite,
   assigned), because not one live hostname is derivable from a Service Id. An
   exposure entry therefore carries a `name`, and `apex: true` is proposed for
   `home-portal`. Both need grading — the first moves a value the contention test
   had placed on the platform side.
2. **Kubernetes secrets-at-rest encryption.** ADR-0005 makes `delivery: env` and
   `delivery: file` conditional on it. No `--secrets-encryption` configuration exists
   in `nix-config` or the bootstrap tree today. Blocks those two deliveries;
   `delivery: self` and `access: custody` persist nothing and are unaffected.
3. **Default-deny promotion.** ADR-0011 requires audit mode first. The criterion
   for promoting to enforce is unstated.
4. **Four images to build.** ADR-0007 moves `hermes-bootstrap` (221 lines of
   shell), `n8n-hooks` (499 lines of JavaScript) and the `garage` bootstrap out of
   ConfigMaps, and retires the `alpine:3.21` plus ConfigMap pattern.
   `postgres-init-script` needs no image because it becomes derived.
5. **Label prefix retirement.** ADR-0009 keeps one prefix. Retiring
   `personal-stack/*` means relabelling live nodes, and `CLAUDE.md` is explicit
   that a `kubectl label` drifts back on the next reconcile — so it must go
   through the generated contract.
6. ~~**Where third-party Service Intent lives.**~~ **Resolved by chapter 40.**
   Publication is repository-scoped and a fragment declares the domains it
   contributes to, so `homelab-collections` may stay one repository publishing one
   fragment for five domains, or split into five. Composition behaves identically,
   which makes the split a convenience rather than a prerequisite.
7. **Three fields chapter 10 had to propose.** `sidecars` (a Workload holds more
   than one container: `postgres` plus `postgres-exporter`, `stalwart` plus
   `stalwart-apply`, `agent-runner` plus the `agent-gateway` jar), `size` (a
   closed resource class, since requests and limits are contended), and
   `minAvailable` (since `replicas` is contended, and `auth-api`'s two were a
   capacity decision). All three are marked `<<proposed>>` in chapter 10's
   diagram and need grading before it is approved.
8. **Closing the measured coverage gap.** Chapter 30 measured it, so this is no
   longer an unknown: of 450 objects, 364 should come from an adapter and 328 do.
   The 36-object gap is `rbac` (16) and `availability` (6), which need writing,
   plus `prometheus` (11) and `networking` (3), which have working renderers that
   were never registered. Separately, four duplicated adapter pairs must collapse
   before attribution can be enforced, and Grafana's 45 authored objects need a
   home that is not "the ledger, indefinitely".
9. **The `resolved.yml` drift check's failure mode.** ADR-0017 requires the
   published projection to be guarded but not what a stale copy does — block that
   service's own pipeline, or merely report.
10. ~~**Fragment publication trigger**~~ and ~~**who runs composition**~~ —
    **both resolved by chapter 50.** Fragments publish on merge, independently of
    any image release; composition runs automatically on any publish with no pull
    request.
11. **Whether the union may span clusters** (chapter 40). The lock is keyed by
    cluster, but Service Id uniqueness is estate-wide. Invisible with one cluster.
12. **Fragment signing** (chapter 40). Composition verifies `MANIFEST.sha256` per
    file but not provenance, while `deploy-artifact.yml` already carries
    `id-token: write` and `attestations: write`.
13. **Aggregator CI cost** (chapter 50). A change anywhere invalidates every
    aggregator's pin, so ~6 suites run per service change. `CLAUDE.md` measures
    the shape — *"561 minutes of real compute billed 2,845"* — and advises one job
    with many steps, which sharded Gradle execution contradicts.
14. **Whether the test vcluster runs Flux for class B** (chapter 50). It does
    today; if production keeps Flux for the foundation, the test target should, or
    the paths diverge exactly where the foundation lives.
15. **The lag bound** (chapter 50). "More than N locks behind is reported" needs an
    N, and a decision on whether exceeding it blocks that aggregator's next merge.
16. **What replaces `deploy/production`** (chapter 50). Flux still reads it for
    class B, so it survives but narrowed to the foundation. ADR-0008 in the
    workspace records its current semantics.
