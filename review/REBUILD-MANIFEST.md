# Rebuild manifest — the deterministic backbone

Single source of truth for the docs/adr rebuild and the spec/v1 follow-up.
Every authoring agent reads this file. Deviating from it is a defect.

## Global rules (every ADR)

1. **ADRs justify; `spec/v1` is normative.** No field lists, no error-code
   tables, no YAML over 10 lines, no worked examples. The `normative:` pointer
   names where the detail lives.
2. **Template** — exact frontmatter keys, exact section order:

```markdown
---
tier: premise | decision
status: proposed
claim: settled | open | accepted-untested
owner: joris            # required when claim is not settled
date: 2026-08-31
normative: spec/v1/<chapter>.md#<anchor>
decided-in: JorisJonkers-dev/workspace#45    # only where the manifest says so
rests-on: ["0004"]      # decisions only; premises omit the key entirely
---

# <The decision, as one declarative sentence — the H1 IS the decision>

## Rests on
<one falsifiable claim>. False if: <observation>. Settled by: <exact command/experiment/measurement>.

## Why
Two or three paragraphs of evidence. Carry the estate evidence from the old ADR
faithfully (quotes, counts, file paths) — it is the most valuable content.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
(at least one real row; costed, never dismissed in a clause)

## Reversibility
Undo cost today: <concrete: files, hours, blast radius>.
Becomes irreversible once: <the event past which undo is unavailable>.

## Consequences
- <effect> — paid by <who>
(costs as well as benefits; every line names a payer)
```

3. **Citations.** Never write the bare token `ADR-`. Reference new-set ADRs as
   relative links: `[0023](0023-grant-unit-is-the-path.md)`. Reference workspace
   decisions as absolute links:
   `[workspace ADR-0010](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0010-system-tests-disposition.md)`.
   Reference spec chapters relative from docs/adr: `../../spec/v1/20-resolved-deployment.md`.
   The old 19 ADRs are deleted; never link to them. Their reference copies for
   evidence live at `review/old-adr/` — read them, do not link them.
4. **Length.** 40–90 lines per file. Premises may run to 100.
5. **Tone.** Declarative, evidenced, no praise, no hedging. State the decision;
   state what would prove it wrong.
6. **Known corrections you must not reintroduce** (found by review):
   - Env files are per **Workload**, never per Service.
   - `keys: ['*']` is not vocabulary.
   - The claim "reads granted keys only" is false under P9; grants are per path.
   - The old push-delivery ADR misquoted the composition ADR; the correct
     wording is "no repository needs a merge before a change takes effect".
   - The old co-testing ADR cited a rejection that never existed; state the
     provider-never-knows-its-consumers argument directly instead.
7. Full findings live in `review/CONSOLIDATED.md`; the approved carving in
   `review/SPINE.md`. Read what your row points at.

## Direction decisions (fixed here; ADRs elaborate, never contradict)

- **P6/0034**: Layer-2 purity is retained over an **enlarged pinned input set** —
  a `ClusterState` snapshot with its own digest joins Intent, Context and locks.
  Reproducibility claims become "identical inputs including clusterStateDigest".
- **0052**: The 16 **registered adapters are v1**; `src/deployment/render/`
  (14 modules, 1,967 lines, imported only by tests) is deleted in the code pass.
- **0023**: The **grant unit is the path**; `keys:` documents and validates but
  confers nothing; the Secret Subtree is laid out one path per reader set.
- **0024**: ServiceAccount and Vault role are **per Workload**
  (`<service>-<workload>`; single-workload Services collapse to `<service>`).
- **0027**: A `${secret:<path>#<key>}` placeholder must **byte-match a granted
  path**; non-KV engines (transit) are `self`-delivery only, no placeholders.
- **0028**: The renderer refuses `delivery: env|file` unless the pinned cluster
  context advertises `secretsEncryption: true` (`E_SECRETS_AT_REST_REQUIRED`).
- **0036**: Direction is **Cilium** (a CNI with a non-enforcing policy stage),
  claim open, settled by a lab evaluation on the pinned k3s version.
- **0042**: **Apply first, prune last**, from an inventory enumerating exactly
  the kinds the registered adapters render (CRDs and PVCs included).
- **0043**: The deployer Role holds `delete` only on kinds reversible from git;
  a claim backing non-`reconstructible` data leaving the render is
  `E_ORPHANED_CLAIM` plus a state-move-plan, never a delete.
- **0046**: Distinct field managers (`deploy:<agg>`, `cron:<agg>`), conflicts
  are signals, a Lease serialises the two appliers per aggregator.
- **0047**: A **namespace has exactly one deployer**; `aliases.namespace` may
  not cross deployer boundaries (`E_NAMESPACE_FOREIGN_DEPLOYER`).
- **0039**: `schemaVersion` is the **data model's own semver** starting 1.0.0,
  bumped only on model change; composition accepts same-major, minor ≤ toolkit;
  the lock records exact versions.
- **0038**: The staleness bound gets its number: **maxAge 7 days** default,
  per-participant override, dormancy is a ledger entry.
- **0016**: `size` is a closed class (xs–xl) with the requests/limits table in
  chapter 10; hardening class defaults to `restricted` (runAsNonRoot,
  readOnlyRootFilesystem, drop ALL, seccomp RuntimeDefault) with per-Workload
  declared exceptions carrying reasons.
- **0035**: Promotion audit→enforce criterion: zero undeclared flows observed
  over **14 days**.
- **0051**: vclusters run as **k3d on the CI runner**; gate viability thresholds
  to measure against: ≤15 min wall, ≤4 GB peak.
- **0057**: Platform facts (datastore kind, server count, k3s version+flags)
  become required schema fields; restore rehearsed before the first
  `irreplaceable` apply; RPO 24 h (daily node backup), RTO to be measured.
- **0059**: v1 core = authoring vocabulary + composition + registered renderer
  with Flux delivery unchanged; group G (push delivery) proceeds only on the
  workspace#45 result and the 0051 measurement; review date 2026-11-30 cuts
  unfinished group-G scope rather than extending it.

## Index — number | slug | tier | rests-on | claim | normative

| # | slug | tier | rests-on | claim | normative |
|---|---|---|---|---|---|
| 0001 | estate-scale-and-ownership | premise | — | open | spec/v1/00-overview.md#the-estate |
| 0002 | kubernetes-as-substrate | premise | — | open | spec/v1/00-overview.md#substrate |
| 0003 | three-layer-meta-model | premise | — | settled | spec/v1/00-overview.md#the-meta-model |
| 0004 | contention-decides-authority | premise | — | open | spec/v1/20-resolved-deployment.md#authority |
| 0005 | derivation-is-total | premise | — | open | spec/v1/20-resolved-deployment.md#derived-mechanics |
| 0006 | pinned-inputs | premise | — | open | spec/v1/20-resolved-deployment.md#pinned-inputs |
| 0007 | schema-version-separable | premise | — | open | spec/v1/40-composition.md#versioning |
| 0008 | tested-equals-deployed-requires-push | premise | — | open | spec/v1/50-lifecycle.md#delivery-classes |
| 0009 | vault-read-is-per-path | premise | — | open | spec/v1/10-service-intent.md#secrets |
| 0010 | flat-service-identity | decision | 0004 | settled | spec/v1/10-service-intent.md#service-identity |
| 0011 | configuration-env-files-per-workload | decision | 0005 | settled | spec/v1/10-service-intent.md#configuration |
| 0012 | assets-not-code | decision | 0005 | settled | spec/v1/10-service-intent.md#assets |
| 0013 | blueprint-packs-pinned-checkout | decision | 0001 | settled | spec/v1/60-setup.md#blueprint-packs |
| 0014 | probes-are-siblings | decision | 0005 | settled | spec/v1/10-service-intent.md#probes |
| 0015 | durability-class-per-volume | decision | 0005 | settled | spec/v1/10-service-intent.md#storage-and-durability |
| 0016 | pod-hardening-and-resource-class | decision | 0005 | open | spec/v1/10-service-intent.md#pod-hardening-and-resource-class |
| 0017 | placement-by-capability | decision | 0005 | settled | spec/v1/10-service-intent.md#placement |
| 0018 | exposure-by-audience | decision | 0004 | settled | spec/v1/10-service-intent.md#exposure |
| 0019 | registered-unmanaged-surfaces | decision | 0004 | settled | spec/v1/40-composition.md#unmanaged-surfaces |
| 0020 | dependency-edges-carry-surface | decision | 0005 | settled | spec/v1/16-dependencies.md#dependency-edges |
| 0021 | observability-scrape-and-alert-class | decision | 0005 | settled | spec/v1/10-service-intent.md#observability |
| 0022 | grants-live-on-the-service | decision | 0009 | settled | spec/v1/10-service-intent.md#secrets |
| 0023 | grant-unit-is-the-path | decision | 0009 | open | spec/v1/10-service-intent.md#grant-unit |
| 0024 | identity-per-workload | decision | 0009 | settled | spec/v1/16-dependencies.md#workload-identity |
| 0025 | access-tiers-derive-policy | decision | 0009 | settled | spec/v1/10-service-intent.md#access-tiers |
| 0026 | delivery-env-file-self | decision | 0009 | settled | spec/v1/10-service-intent.md#delivery |
| 0027 | secret-reference-join-key | decision | 0009 | settled | spec/v1/10-service-intent.md#secret-references |
| 0028 | secrets-at-rest-gate | decision | 0009 | open | spec/v1/60-setup.md#secrets-at-rest |
| 0029 | resolved-deployment-versioned-artifact | decision | 0003 | settled | spec/v1/20-resolved-deployment.md#the-resolved-deployment |
| 0030 | runtime-mechanics-derived | decision | 0005 | settled | spec/v1/20-resolved-deployment.md#derived-mechanics |
| 0031 | derived-overrides-with-reason | decision | 0005 | settled | spec/v1/20-resolved-deployment.md#overrides |
| 0032 | reconcile-unit-derived | decision | 0005 | settled | spec/v1/20-resolved-deployment.md#the-reconcile-unit |
| 0033 | assignments-published-back | decision | 0004 | settled | spec/v1/20-resolved-deployment.md#publish-back |
| 0034 | cluster-state-pinned-input | decision | 0006 | settled | spec/v1/20-resolved-deployment.md#cluster-state |
| 0035 | network-policy-default-deny | decision | 0005, 0002 | settled | spec/v1/16-dependencies.md#network-policy |
| 0036 | cni-selection | decision | 0002 | open | spec/v1/60-setup.md#cni |
| 0037 | composition-oci-fragments | decision | 0001, 0005 | settled | spec/v1/40-composition.md#fragments |
| 0038 | participants-list-staleness | decision | 0001 | settled | spec/v1/40-composition.md#participants |
| 0039 | artifact-schema-versioning | decision | 0007 | settled | spec/v1/40-composition.md#versioning |
| 0040 | renovate-ordering-gate | decision | 0007 | settled | spec/v1/40-composition.md#version-rollout |
| 0041 | push-delivery-boundary | decision | 0008 | open | spec/v1/50-lifecycle.md#delivery-classes |
| 0042 | apply-before-prune-inventory | decision | 0008 | settled | spec/v1/50-lifecycle.md#apply-and-prune |
| 0043 | delete-authority-durability-gate | decision | 0008, 0015 | settled | spec/v1/50-lifecycle.md#delete-authority |
| 0044 | reconcile-cronjob | decision | 0008 | settled | spec/v1/50-lifecycle.md#reconciliation |
| 0045 | break-glass-reporting | decision | 0008 | settled | spec/v1/50-lifecycle.md#break-glass |
| 0046 | distinct-field-managers | decision | 0002 | settled | spec/v1/50-lifecycle.md#field-ownership |
| 0047 | namespace-per-deployer | decision | 0002 | settled | spec/v1/50-lifecycle.md#deploy-authority |
| 0048 | class-b-pinning | decision | 0008 | settled | spec/v1/50-lifecycle.md#foundation-pinning |
| 0049 | aggregator-owned-tests | decision | 0001 | settled | spec/v1/50-lifecycle.md#co-testing |
| 0050 | exercises-and-deploys | decision | 0001 | settled | spec/v1/50-lifecycle.md#deploy-ownership |
| 0051 | vcluster-substrate | decision | 0008 | open | spec/v1/50-lifecycle.md#test-substrate |
| 0052 | registered-adapters-are-v1 | decision | 0003 | settled | spec/v1/30-deliverables.md#adapters |
| 0053 | adapter-port-contract | decision | 0003 | settled | spec/v1/30-deliverables.md#the-adapter-port |
| 0054 | adapter-attribution | decision | 0003 | settled | spec/v1/30-deliverables.md#attribution |
| 0055 | bidirectional-ledgers | decision | 0003 | settled | spec/v1/30-deliverables.md#ledgers |
| 0056 | node-facts-single-source | decision | 0005 | settled | spec/v1/60-setup.md#node-facts |
| 0057 | datastore-and-restore | decision | 0002 | open | spec/v1/60-setup.md#platform-facts-and-restore |
| 0058 | delivery-machinery-observability | decision | 0008 | settled | spec/v1/50-lifecycle.md#machinery-observability |
| 0059 | v1-scope-stopping-rule | decision | 0001 | open | spec/v1/00-overview.md#programme-scope |

Titles (H1 sentences) are fixed in the workflow rows; do not retitle.

## Required chapter anchors (headings the spec rewrite must carry)

GitHub slugging: lowercase, spaces→dashes. Heading text is given; do not vary it.

- **00-overview.md**: `## The estate`, `## Substrate`, `## The meta-model`,
  `## Programme scope`, `## Decision register` (a pointer to
  `docs/adr/README.md`, not a second table), `## Open items` (each entry with
  **Owner / Settled by / Blocks** lines).
- **10-service-intent.md**: `## Service identity`, `## Configuration`,
  `## Assets`, `## Probes`, `## Storage and durability`,
  `## Pod hardening and resource class`, `## Placement`, `## Exposure`,
  `## Observability`, `## Secrets`, `## Grant unit`, `## Access tiers`,
  `## Delivery`, `## Secret references`.
- **16-dependencies.md**: `## Dependency edges`, `## Workload identity`,
  `## Network policy`.
- **20-resolved-deployment.md**: `## The Resolved Deployment`, `## Authority`
  (the field table lives here, in one place), `## Pinned inputs`,
  `## Cluster state`, `## Derived mechanics`, `## Overrides`,
  `## The Reconcile Unit`, `## Publish back`.
- **30-deliverables.md**: `## Adapters`, `## The adapter port`,
  `## Attribution`, `## Ledgers`, `## Coverage` (re-derived from the registry).
- **40-composition.md**: `## Fragments`, `## Participants`, `## Versioning`,
  `## Version rollout`, `## Unmanaged surfaces`.
- **50-lifecycle.md**: `## Delivery classes`, `## Apply and prune`,
  `## Delete authority`, `## Reconciliation`, `## Break glass`,
  `## Field ownership`, `## Deploy authority`, `## Foundation pinning`,
  `## Co-testing`, `## Deploy ownership`, `## Test substrate`,
  `## Machinery observability`.
- **60-setup.md**: `## Blueprint packs`, `## Secrets at rest`, `## CNI`,
  `## Node facts`, `## Platform facts and restore`.

---

# Amendment — 2026-09-07 (binding; overrides anything above that conflicts)

## The delivery/co-testing split
By owner decision: how the estate deploys, and how dependency on other units
for testing gates a deploy, are **defined separately from the model**. ADRs
0008, 0041–0051 and 0058 moved to `docs/adr/deferred/` (see its README). They
are not v1 decisions, are not linted, and their `normative:` pointers name
sections the v1 spec must NOT carry.

## New model decision
| # | slug | tier | rests-on | claim | normative |
|---|---|---|---|---|---|
| 0060 | release-unit | decision | 0003, 0005 | open | spec/v1/10-service-intent.md#release-units |

A Release Unit deploys several Services as a single task: no member's new
version receives traffic until every member's new version is healthy; if any
member fails its budget, none switch. Declared in layer 1 (`releaseUnit:
<name>`, at most one per Service); orthogonal to the Reconcile Unit (ordering
vs atomicity). The model's three demands on any future delivery definition:
Release Unit atomicity (0060), Durability Class gating (0015), pinned inputs
only (0006/0034).

## Required chapter anchors — changes
- `10-service-intent.md` ADDS `## Release units`.
- `50-lifecycle.md`: ALL previously listed anchors are dropped (they belonged
  to the deferred delivery decisions). The chapter is retitled in substance to
  model-level lifecycle: Release Unit switchover semantics, expand/contract
  for cross-Service contract changes, lock lifecycle, and one explicit section
  stating that delivery mechanics and co-testing are defined separately
  (pointing at `docs/adr/deferred/`). No ADR requires an anchor here.
- All other chapter anchor lists stand as written above.

## Spec examples — split
Delivery examples move OUT of the v1 spec to `docs/adr/deferred/examples/`:
`spec/v1/examples/workflows/aggregator-deploy.yml`,
`.../aggregator-gate.yml`, `spec/v1/examples/aggregator.yml`,
`spec/v1/examples/rendered/deployer-rbac.yaml`,
`.../rendered/reapply-cronjob.yaml`, and `spec/v1/examples/renovate.json`
(it managed the aggregator pin). Model examples stay and are rewritten to the
new decisions: per-Workload env files; no `keys: ['*']`; placeholder paths
byte-matching granted paths (0027); `releaseUnit` on the auth pair; `size`,
hardening exceptions and `durability` per 0016/0015; digests not tags;
`compose.yml` and `service-publish-fragment.yml` stay (composition is model).

## Chapter defects to fix in the rewrite (line-cited by the review)
- 20:11 purity rule vs 20:246 observed PV example — restate per 0006/0034.
- 10:463 replicas from live capacity — restate per 0034.
- 30:85 coverage table wrong on 2 of 4 rows — re-derive from the registry
  (src/adapters/registry.ts + kubernetes.ts already emit pdb/servicemonitor).
- 40:105 schemaVersion equality assert; 40:237 literal 1.0.0 — restate per 0039.
- 16:287 "granted keys only" — false under 0009/0023; 16:122 SA from Service id
  — per-Workload identity per 0024.
- 60:153 unsatisfiable audit-mode precondition — restate per 0036 (blocked,
  owned, not tickable today).
- 00: decision register becomes a pointer to docs/adr/README.md; Open items
  gain Owner / Settled by / Blocks on every unresolved entry.
