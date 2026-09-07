# deploy-config-schema v1 — specification index

This branch holds the v1 specification. The decisions that justify it live in
[`docs/adr/`](../../docs/adr/README.md); the vocabulary lives in
[`CONTEXT.md`](../../CONTEXT.md). None of the three restates the others: the
glossary defines terms, the ADRs record why, and **these chapters are
normative** — where a chapter and an ADR disagree, the chapter wins and the ADR
is what gets fixed.

One boundary runs through the whole document and is stated once here: **how the
estate deploys, and how dependency on other units for testing gates a deploy,
are defined separately from the model** (owner decision, 2026-09-07). This
specification defines the model. The separate definition is scoped in
[`docs/adr/deferred/`](../../docs/adr/deferred/README.md), and nothing in these
chapters specifies push delivery, deploy workflows, pruning, field managers,
deploy RBAC, break-glass or co-test gating.

## The estate

Every mechanism in this specification must justify itself at the scale that
exists, not at the scale of an imagined organisation
([0001](../../docs/adr/0001-estate-scale-and-ownership.md)).

| fact | value | how it is counted |
|---|---|---|
| regular human maintainers | 1, across three git identities | `git shortlog -sn --all`: 35 commits by the one human, 99 by five bot accounts |
| production clusters | 1, seven nodes | clusters serving production traffic |
| Services | about 30 | in about 10 repositories — reviewers who wrote "~30 repositories" were counting Services |
| horizon | 2028-08-31 | re-run the counts at that date, or earlier on a falsifying observation |

Two consequences are normative for the rest of the specification. First,
invariants that arbitrate **between people** — a self-reviewed publish-back pull
request, an authorisation control protecting the author from the author — are
out of v1 scope; the invariants v1 builds are the ones that catch the
maintainer's own mistakes. Second, if a second regular maintainer or a second
production cluster appears before the horizon, every decision resting on this
premise is re-opened against the new scale rather than re-worded.

## Substrate

Kubernetes stays, and not for the reasons it is usually bought
([0002](../../docs/adr/0002-kubernetes-as-substrate.md)). Rescheduling does not
exist here: storage is `local-path`, all fourteen PVCs are `ReadWriteOnce`, and
a `local-path` volume does not survive its node, so every stateful Workload is
pinned to one machine by construction. Control-plane HA does not exist: every
platform fixture carries exactly one `k3s-control-plane` host. Horizontal scale
is not exercised: `auth-api`'s two replicas were a capacity decision on freed
budget, and on one node two replicas are two processes on one kernel. The
overhead is counted — 405 rendered objects for about 30 Services, 41 of them
foundation, and the foundation is the part carrying the CVEs and the CRD
upgrades.

The substrate is retained as **a declarative object store with field-level
ownership and an authorisation boundary, that happens to also run containers**.
Two properties earn it: the API server as an authorisation boundary between
appliers, and server-side-apply field ownership as the signal that a human
edited a field something else owns. No design in this specification may cite
rescheduling, HA or horizontal scale as justification.

Both retained properties are made real by *how objects are applied* — which
identity applies, under which field manager. That is delivery, and it is
defined separately: see
[`docs/adr/deferred/`](../../docs/adr/deferred/README.md). The model's own
obligation is narrower and is discharged in these chapters: every Deliverable is
a serialized object attributed to exactly one adapter, so there is always a
single answer to "what should own this field".

The layer-1 intent files survive a substrate swap — they name no Kubernetes
kind. The registered adapters do not: all sixteen emit Kubernetes kinds, which
is why the swap is a v2 migration rather than an undo once repositories author
against a shipped v1.

## The meta-model

Deployment configuration is split into three layers, and the middle one is a
contract ([0003](../../docs/adr/0003-three-layer-meta-model.md)).

| Layer | Name | Authored | Owns |
|---|---|---|---|
| 1 | Service Intent | by hand, in the owning repo | requirements, never mechanisms |
| 2 | Resolved Deployment | never — derived | every platform decision |
| 3 | Deliverable Set | never — serialized | files, no decisions |

The rule that makes this worth naming: **Layer 1 contains no mechanisms, Layer 3
contains no decisions.** Every field is assignable to exactly one layer, decided
by two questions — must a human author it, and does it record a decision or
merely serialize one. Which side of layer 1 a value falls on is decided by the
contention test: a value is platform-assigned if and only if it must be unique
across the estate or draws on a shared finite resource
([0004](../../docs/adr/0004-contention-decides-authority.md), normative in
[chapter 20](20-resolved-deployment.md#authority)).

The counter-experiment is on record. Two layers, with resolution private to the
renderer, produced three mutually incompatible documents all claiming
`deployment.jorisjonkers.dev/v2` — the authoring shape, the collection shape and
the resolved shape — and the estate documented the consequence as a trap rather
than fixing it, because a two-layer vocabulary could not say which document was
wrong.

Layer 2 is derived from a **closed set of pinned, digested inputs** — Service
Intent, the Cluster Context, the locks, and a ClusterState snapshot carrying its
own digest ([0006](../../docs/adr/0006-pinned-inputs.md),
[0034](../../docs/adr/0034-cluster-state-pinned-input.md)). Nothing at render
time reads live cluster state. Reproducibility is therefore conditional and
true: identical inputs *including* `clusterStateDigest` produce a byte-identical
tree, so a differing render with identical digests is a defect, never weather.

```mermaid
flowchart TB
    subgraph AUTH["layer 1 — Service Intent, hand-authored in each owning repository"]
        a1["service.yml<br/>releaseUnit, size, hardening,<br/>durability, probes, exposure, secrets"]
        a2["env/&lt;workload&gt;/*.env<br/>one set per Workload"]
        a3["assets<br/>declarative, never executable"]
        a4["node declarations"]
    end

    a1 --> FR["Intent Fragment<br/>published per repository, by digest"]
    a2 --> FR
    a3 --> FR
    a4 --> FR

    FR --> CO["composition<br/>union + estate-wide invariants<br/>merges nothing, runs on any publish"]
    PAR["participants.yml<br/>expected domains, maxAge 7d"] --> CO
    CO --> CI["ComposedIntent<br/>+ CompositionLock"]

    CI --> RES["layer 2 — Resolved Deployment<br/>every platform assignment,<br/>a function of the pinned inputs alone"]
    CTX["Cluster Context<br/>by digest"] --> RES
    CS["ClusterState snapshot<br/>clusterStateDigest"] --> RES
    IL["images lock<br/>digests, never tags"] --> RES

    RES --> RS["resolved.yml<br/>published back per Service"]
    RES --> DS["layer 3 — Deliverable Set<br/>registered adapters,<br/>one attributed adapter per file"]

    DS --> DEL["delivery — DEFINED SEPARATELY<br/>docs/adr/deferred/<br/>must honour Release Unit atomicity,<br/>Durability Class gates,<br/>pinned inputs only"]
    DEL --> K["the cluster"]

    RS -.->|"an owner reads their own assignments"| AUTH

    classDef separate stroke-width:2px,stroke-dasharray:6 4;
    class DEL separate;
```

## Programme scope

v1 is the model ([0059](../../docs/adr/0059-v1-scope-stopping-rule.md)): the
layer-1 authoring vocabulary, composition, layer-2 derivation, and the
registered renderer that serializes layer 3. It ships when it renders the live
estate from declared intent and that render is delivered by today's Flux tree
unchanged. No deferred decision can block it.

The partition is structural rather than enumerated, so it cannot drift: **every
ADR in `docs/adr/` is v1 model scope; every ADR in `docs/adr/deferred/` is
not.** A future decision moves a file across that boundary or it does not move
at all. The first draft of this rebuild defined a "core" and a "group G" that
failed to partition the decision set — six ADRs landed on neither side — which
is why membership of a directory, not a list, is the line.

The model makes exactly three demands on whatever delivery is eventually
defined. They are model decisions, not delivery ones, and together they are the
complete interface between the two scopes.

| demand | decided in | what any delivery definition must do |
|---|---|---|
| Release Unit atomicity | [0060](../../docs/adr/0060-release-unit.md) | no member's new version receives traffic until every member's new version is healthy; if any member fails its budget, none switch and the old versions keep serving |
| Durability Class gating | [0015](../../docs/adr/0015-durability-class-per-volume.md) | no destructive operation proceeds automatically against a volume declared `recoverable` or `irreplaceable` |
| Pinned inputs only | [0006](../../docs/adr/0006-pinned-inputs.md), [0034](../../docs/adr/0034-cluster-state-pinned-input.md) | render from recorded digests — Intent, Cluster Context, locks, ClusterState — never from live cluster state |

Anything else the delivery definition chooses — push or pull, who applies, what
prunes, what reconciles, how co-testing gates — is its own business. A delivery
definition that needs a fourth demand amends the model first, in one ADR.

**The stopping rule.** The deferred set is taken up only after
[workspace#45](https://github.com/JorisJonkers-dev/workspace/issues/45) runs and
the test-substrate measurement exists; that experiment informs the separate
definition and gates nothing in v1. Review date **2026-11-30**: deferred work
still unstarted then is cut from planning, not extended. The named failure mode
this rule exists to prevent is not collapse but partial completion with both
delivery models live.

Live-defect fixes ride independently of both scopes — the unpinned foundation
charts and this repository's own unpinned CI are operational fixes that proceed
regardless of any delivery decision.

## Decision register

The register is [`docs/adr/README.md`](../../docs/adr/README.md). It is not
reproduced here, and there is no second table.

It carries the premises (0001–0007, 0009) and the decisions (0010–0040,
0052–0057, 0059–0060) that make up v1, each with its claim — `settled`, `open`
or `accepted-untested` — and its `normative:` pointer naming the section of
these chapters where its detail lives. A `claim: open` means decided in
direction and untested; its owner and settling test are in the ADR file, never
here. The delivery and co-testing decisions have their own inventory at
[`docs/adr/deferred/README.md`](../../docs/adr/deferred/README.md); they are not
in the register, not linted, and their `normative:` pointers name sections these
chapters deliberately do not carry.

Citation rule, in the ADRs and in these chapters: never a bare ADR number.
In-set references are relative links; workspace decisions live in a separate
namespace and are always linked absolutely.

## Chapters

**Diagrams are embedded in their chapter** as fenced `mermaid` blocks rather
than kept as standalone `.mmd` files: GitHub does not render a bare `.mmd`, so
it would be invisible in the review the chapter exists for, and a copy in both
places is the duplication this specification spends its time removing.

| Chapter | Covers | Diagram |
|---|---|---|
| [`10-service-intent.md`](10-service-intent.md) | Service, Workload, and every layer-1 field by concern: identity, configuration, assets, probes, storage and durability, hardening and size, placement, exposure, observability, secrets and grants, release units | embedded |
| [`16-dependencies.md`](16-dependencies.md) | dependency edges, per-Workload identity, derived network policy, the derivation map | embedded |
| [`20-resolved-deployment.md`](20-resolved-deployment.md) | the Resolved Deployment, the authority table in one place, the pinned input set including ClusterState, derived mechanics, overrides, the Reconcile Unit, publish-back | embedded |
| [`30-deliverables.md`](30-deliverables.md) | adapters, the adapter port, attribution, ledgers, coverage re-derived from the registry | embedded |
| [`40-composition.md`](40-composition.md) | Intent Fragments, participants and the staleness bound, schema versioning and rollout, unmanaged surfaces | embedded |
| [`50-lifecycle.md`](50-lifecycle.md) | model-level lifecycle: Release Unit switchover, expand/contract for cross-Service contract changes, lock lifecycle — and the statement that delivery mechanics and co-testing are defined separately | embedded |
| [`60-setup.md`](60-setup.md) | blueprint packs, secrets at rest, CNI selection, node facts, platform facts and restore | embedded |

**Chapter 16's derivation map is the load-bearing artefact**, and its value is
that it is checkable by a script rather than read by eye. Three properties hold
over it:

1. **Totality** — no Deliverable has in-degree zero. An object reachable from no
   declaration is hand-written, and must either become derived or be entered in
   a Bidirectional Ledger. This is what was violated seven ways over by
   `kb.jorisjonkers.dev`.
2. **Single authority** — no field of a Deliverable has two declaring sites.
   Checked against the renderer's attribution table, not the diagram, because
   the diagram is object-level and this property is field-level.
3. **No dead declarations** — no declaration has out-degree zero. A declared
   field that derives nothing is ceremony, which is exactly what
   `rollbackTargetRetention` and `platform.layer` were: the former is validated,
   scorecarded, documented in three files, and read by no renderer or adapter.

Convergence on an *object* is normal — a `Deployment` legitimately draws on
`image`, `config`, `claims`, `health` and `placement`. Convergence on the same
*field* of an object is the defect. An earlier draft's rule, "any node with two
inbound arrows is a bled concern", is superseded by that distinction.

## Examples

Every example is rendered from live state, and every YAML and JSON file is
parse-checked in CI.

| path | what it shows |
|---|---|
| `examples/{knowledge,auth-api,platform-postgres}.service.yml` | Service Intent: two-level secret grants, `probes: none` stated explicitly, TCP probes, `size` and declared hardening exceptions, `durability` per volume, `releaseUnit` on the auth pair |
| `examples/{knowledge-api,knowledge-ingest-worker,auth-api,platform-postgres}.base.env` | env files, one set **per Workload**, threaded with `${dependency:…}` and `${secret:<granted-path>#<key>}` placeholders whose paths byte-match a granted path |
| `examples/workflows/service-publish-fragment.yml` | publish on merge, `oras push` then `oras resolve`, read back |
| `examples/workflows/compose.yml` | pull participants, assert the estate-wide invariants, **prove the gate can fail** |
| `examples/negative/duplicate-service-id/` | a negative fixture, so an invariant that stops running is detectable |

Delivery examples are no longer part of this specification. `aggregator.yml`,
both aggregator workflows, the generated deployer RBAC, the re-apply CronJob and
the Renovate manager that pinned the aggregator moved to
[`docs/adr/deferred/examples/`](../../docs/adr/deferred/examples/) with the
decisions they illustrate.

Both remaining workflows are **one job with many steps**, each step carrying
`if: ${{ !cancelled() }}`. The
[estate agent contract](https://github.com/JorisJonkers-dev/workspace/blob/main/CLAUDE.md)
measured why: *"561 minutes of real compute billed 2,845 — four fifths of the
spend was rounding"*, and *"prefer one job with many steps."*

## Open items

Decisions this specification depends on and does not itself make. Every
unresolved entry carries three lines: who owns it, the observation that settles
it, and what it blocks. An entry that an ADR has since decided is struck
through, with the deciding ADR named.

1. **`exposure[].name` and apex hosts.** Not one live hostname is derivable from
   a Service Id, so identity (unique, declared, checked) and pool (finite,
   assigned) had to be separated: an exposure entry carries an authored `name`
   while the hostname itself stays platform-assigned
   ([0004](../../docs/adr/0004-contention-decides-authority.md),
   [0018](../../docs/adr/0018-exposure-by-audience.md)). `apex: true` is
   proposed for `home-portal` and remains ungraded, though chapter 40 already
   asserts `E_DUPLICATE_APEX` against it. `name` moves a value the contention
   test had placed on the platform side, which is exactly the kind of move that
   needs grading rather than assumption.
   - **Owner:** joris.
   - **Settled by:** enumerate every routed surface in the estate, record for
     `name` and for `apex` whether the value contends, and land the result as an
     amendment to [0018](../../docs/adr/0018-exposure-by-audience.md) with
     chapter 10's exposure vocabulary updated to match.
   - **Blocks:** closing chapter 10's exposure section; the first apex render.

2. **Four ConfigMap-hosted scripts, three images to build.** Code is not
   configuration ([0012](../../docs/adr/0012-assets-not-code.md)), and an Asset
   may not be executable — so `hermes-bootstrap` (221 lines of shell),
   `n8n-hooks` (499 lines of JavaScript) and the `garage` bootstrap need
   first-party images, and the `alpine:3.21`-plus-ConfigMap pattern retires with
   them. The fourth candidate, `postgres-init-script`, needs no image: it
   creates one database and user per consuming Service, which the dependency
   graph already knows, so it becomes a derived Deliverable.
   - **Owner:** joris, as owner of `hermes`, `garage` and `n8n`.
   - **Settled by:** three published first-party images referenced from intent,
     then a ConfigMap census (`kubectl get configmap -A -o yaml`) in which no
     data key contains an executable script.
   - **Blocks:** rendering the live estate from intent — which is the settling
     test of [0059](../../docs/adr/0059-v1-scope-stopping-rule.md) itself, so
     this blocks v1's own stopping condition.

3. **Label prefix retirement.** Node facts are authored once and generate the
   contract ([0056](../../docs/adr/0056-node-facts-single-source.md)), and
   placement is declared as capabilities rather than labels
   ([0017](../../docs/adr/0017-placement-by-capability.md)) — so retiring a
   prefix costs no edit in any service repository. The live nodes still carry
   two: 110 labels across 7 nodes, 55 under `platform.jorisjonkers.dev/*` and
   the same 55 under `personal-stack/*`, named after an archived repository that
   rejects pushes. A hand-applied `kubectl label` drifts back on the next
   reconcile, so retirement must go through the generated contract.
   - **Owner:** joris.
   - **Settled by:** regenerate the node contract without `personal-stack/*`,
     apply it through the generated path, and confirm `kubectl get nodes -o
     json` contains zero `personal-stack/` keys after a full reconcile.
   - **Blocks:** [0056](../../docs/adr/0056-node-facts-single-source.md)'s
     single-source claim. It blocks no render: adapters emit
     `<cluster>/capability-<name>`.

4. **Closing the coverage gap, re-derived.** The published gap — 328 of 364
   objects attributed, 36 missing — was computed against a table wrong on two of
   its four rows: the registered `kubernetes` adapter already pushes `pdb.yaml`,
   `servicemonitor.yaml` and `podmonitor.yaml`, and builds the PDB from
   `rollout.availability`
   ([0052](../../docs/adr/0052-registered-adapters-are-v1.md)). The number is
   void until chapter 30 re-derives it from the registry, and chapter 60's
   bootstrap step 6 is sequenced off the void number. Three related items travel
   with it: four duplicated adapter pairs must collapse before attribution can
   be enforced, `E_PATH_COLLISION` has zero implementations, and Grafana's 45
   authored objects need a home that is not "the ledger, indefinitely".
   - **Owner:** joris.
   - **Settled by:** render the estate, attribute every object through
     `adapterContract()`, publish the corrected table in
     [chapter 30](30-deliverables.md#coverage); the real gap is what that
     table's unattributed rows total.
   - **Blocks:** chapter 60's bootstrap step 6; enforcing single attribution
     ([0054](../../docs/adr/0054-adapter-attribution.md)).

5. **`sidecars` and `minAvailable`.** Chapter 10 proposed three fields;
   [0016](../../docs/adr/0016-pod-hardening-and-resource-class.md) graded
   `size`, and the other two are still ungraded. Both have live evidence: a
   Workload holding more than one container already exists three times
   (`postgres` plus `postgres-exporter`, `stalwart` plus `stalwart-apply`,
   `agent-runner` plus the `agent-gateway` jar), and six PodDisruptionBudgets
   are live, which is `minAvailable` serialised.
   - **Owner:** joris.
   - **Settled by:** one grading pass per field against the contention test,
     landed either as a decision in `docs/adr/` with a `normative:` pointer into
     chapter 10, or as an explicit rejection with the live objects re-homed in a
     Bidirectional Ledger.
   - **Blocks:** approving chapter 10; the availability half of item 4.

6. **Whether the composed union may span clusters** (chapter 40). The lock is
   keyed by cluster while Service Id uniqueness is estate-wide. With one cluster
   ([0001](../../docs/adr/0001-estate-scale-and-ownership.md)) the question is
   invisible, and neither
   [0037](../../docs/adr/0037-composition-oci-fragments.md) nor
   [0038](../../docs/adr/0038-participants-list-staleness.md) settles it.
   - **Owner:** joris.
   - **Settled by:** only observable at a second cluster — decide at the 0001
     horizon review (2028-08-31) or on the day a second production cluster is
     proposed, whichever comes first.
   - **Blocks:** nothing today; it is recorded so the assumption is not silent.

7. **Fragment signing** (chapter 40). Composition verifies `MANIFEST.sha256`
   per file and pins every fragment by digest
   ([0037](../../docs/adr/0037-composition-oci-fragments.md)), which fixes
   *what* is composed but says nothing about *who* published it — while the
   artifact publishing workflow already carries `id-token: write` and
   `attestations: write`.
   - **Owner:** joris.
   - **Settled by:** choose between digest pinning alone and provenance
     verification inside composition, recorded as an ADR resting on 0037; the
     test is a fragment published by an identity outside the estate failing
     composition.
   - **Blocks:** nothing in v1's render.

### Retired since the rebuild

- ~~**Kubernetes secrets-at-rest encryption.**~~ Decided by
  [0028](../../docs/adr/0028-secrets-at-rest-gate.md): the renderer refuses
  `delivery: env` and `delivery: file` unless the pinned cluster context
  advertises `secretsEncryption: true` (`E_SECRETS_AT_REST_REQUIRED`), normative
  in [chapter 60](60-setup.md#secrets-at-rest). The claim is open and owned
  there, not here.
- ~~**Default-deny promotion criterion.**~~ Decided by
  [0035](../../docs/adr/0035-network-policy-default-deny.md) — zero undeclared
  flows observed over 14 days — and by
  [0036](../../docs/adr/0036-cni-selection.md), which supplies the non-enforcing
  policy stage the old audit-mode precondition assumed and `networking.k8s.io/v1`
  does not have.
- ~~**Where third-party Service Intent lives.**~~ Decided by
  [0037](../../docs/adr/0037-composition-oci-fragments.md): publication is
  repository-scoped and a fragment declares the domains it contributes to, so
  splitting a multi-domain repository is a convenience, never a prerequisite.
- ~~**Fragment publication trigger**~~ and ~~**who runs composition.**~~ Decided
  by [0037](../../docs/adr/0037-composition-oci-fragments.md): fragments publish
  on merge, independently of any image release; composition runs on any publish
  and merges nothing.
- ~~**The `resolved.yml` drift check's failure mode.**~~ Decided by
  [0033](../../docs/adr/0033-assignments-published-back.md): the file is
  generated, never hand-edited, and its drift check fails the build in the
  repository holding it when it disagrees with a fresh compose.
- ~~**Grading `size`.**~~ Decided by
  [0016](../../docs/adr/0016-pod-hardening-and-resource-class.md): a closed
  class `xs`–`xl`, with the requests and limits table in chapter 10 reaching the
  render through the pinned Cluster Context.
- ~~**Aggregator CI cost**~~, ~~**whether the test substrate runs Flux for the
  foundation**~~, ~~**the lag bound**~~ and ~~**what replaces
  `deploy/production`.**~~ All four are delivery or co-testing questions, and
  both are defined separately from the model: they are carried, with their
  evidence, in [`docs/adr/deferred/`](../../docs/adr/deferred/README.md).
