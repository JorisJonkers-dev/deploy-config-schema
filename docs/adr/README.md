# Decision register — the v1 model

This set was rebuilt from scratch on 2026-08-31 as the decision surface for the
v1 goal state, and restructured on 2026-09-07: **how the estate deploys, and
how co-testing gates a deploy, are defined separately from the model** — those
thirteen ADRs (0008, 0041–0051, 0058; the numbering gaps below) are parked in
[deferred/](deferred/README.md) and are not v1 decisions. The previous 19 ADRs
were deleted; the last commit carrying the old set is `7ea3c4f`, and after the
rebuild commit lands they are recoverable with
`git log --diff-filter=D -- docs/adr`.

**ADRs justify; `spec/v1` is normative.** Where an ADR and its `normative:`
pointer disagree, the spec wins and the ADR is what gets fixed. The `spec/v1`
chapters have **not yet been rewritten** to carry the anchors this register
names — that is the follow-up spec rewrite, tracked in
`review/REBUILD-MANIFEST.md`; `scripts/lint-adrs.mjs` stays non-blocking until
it lands.

Tier-0 **premises** carry one falsifiable claim each; tier-1 **decisions** name
the premises they stand on in `rests-on`. A `claim: open` means decided in
direction, untested — its owner and settling test are in the file.

Citation rule: never a bare ADR number. In-set references are relative links;
workspace decisions live in a separate namespace
(`JorisJonkers-dev/workspace/docs/decisions/`) and are always linked absolutely.

## Premises

| # | title | claim | normative |
|---|---|---|---|
| [0001](0001-estate-scale-and-ownership.md) | The estate is one maintainer, one cluster, about thirty Services | open | 00-overview.md#the-estate |
| [0002](0002-kubernetes-as-substrate.md) | Kubernetes stays, for two properties that must be made real | open | 00-overview.md#substrate |
| [0003](0003-three-layer-meta-model.md) | Three layers, with the middle layer as a contract | settled | 00-overview.md#the-meta-model |
| [0004](0004-contention-decides-authority.md) | Contention decides who declares a value | open | 20-resolved-deployment.md#authority |
| [0005](0005-derivation-is-total.md) | Derivation from declared intent is total | open | 20-resolved-deployment.md#derived-mechanics |
| [0006](0006-pinned-inputs.md) | Every assignment is a function of pinned, digested inputs | open | 20-resolved-deployment.md#pinned-inputs |
| [0007](0007-schema-version-separable.md) | The data model's version is not the package's version | open | 40-composition.md#versioning |
| [0009](0009-vault-read-is-per-path.md) | A Vault KV-v2 read grant covers the whole path | open | 10-service-intent.md#secrets |

Premise 0008 (tested-equals-deployed) moved to
[deferred/](deferred/0008-tested-equals-deployed-requires-push.md) with the
delivery work it underpins.

## Decisions

### Identity and authorship
| # | title | claim |
|---|---|---|
| [0010](0010-flat-service-identity.md) | One flat Service Id, with deliberate renames as data | settled |
| [0011](0011-configuration-env-files-per-workload.md) | Configuration is per-Workload env files with named placeholders | settled |
| [0012](0012-assets-not-code.md) | File-shaped configuration is an Asset; code is not configuration | settled |
| [0013](0013-blueprint-packs-pinned-checkout.md) | Blueprint packs arrive by pinned checkout, not a registry | settled |

### Workload-declared runtime intent
| # | title | claim |
|---|---|---|
| [0014](0014-probes-are-siblings.md) | Probes are sibling declarations, each carrying its own path | settled |
| [0015](0015-durability-class-per-volume.md) | Every volume declares a Durability Class | settled |
| [0016](0016-pod-hardening-and-resource-class.md) | Pod hardening and resource class are layer-1 vocabulary | open |
| [0017](0017-placement-by-capability.md) | Placement is declared as capabilities, never labels | settled |

### Exposure, dependencies, observability
| # | title | claim |
|---|---|---|
| [0018](0018-exposure-by-audience.md) | Exposure is declared by Audience, in one closed vocabulary | settled |
| [0019](0019-registered-unmanaged-surfaces.md) | Un-deployed hostnames are Registered Unmanaged Surfaces | settled |
| [0020](0020-dependency-edges-carry-surface.md) | A dependency edge names the provider, the surface, and necessity | settled |
| [0021](0021-observability-scrape-and-alert-class.md) | Observability is a scrape surface plus an Alert Class | settled |

### Secrets
| # | title | claim |
|---|---|---|
| [0022](0022-grants-live-on-the-service.md) | Secret grants live on the Service document, at two levels | settled |
| [0023](0023-grant-unit-is-the-path.md) | The grant unit is the path; the subtree splits per reader set | open |
| [0024](0024-identity-per-workload.md) | Workloads hold their own identity | settled |
| [0025](0025-access-tiers-derive-policy.md) | Access tiers derive the Vault policy | settled |
| [0026](0026-delivery-env-file-self.md) | Secret delivery is env, file, or self | settled |
| [0027](0027-secret-reference-join-key.md) | A secret placeholder byte-matches a granted path | settled |
| [0028](0028-secrets-at-rest-gate.md) | Secrets at rest gate env and file delivery | open |

### Layer 2 — derivation and assignment
| # | title | claim |
|---|---|---|
| [0029](0029-resolved-deployment-versioned-artifact.md) | The Resolved Deployment is a versioned, reviewable artifact | settled |
| [0030](0030-runtime-mechanics-derived.md) | Runtime mechanics are derived from declared intent | settled |
| [0031](0031-derived-overrides-with-reason.md) | A derived value is overridable with a reason; an assignment is not | settled |
| [0032](0032-reconcile-unit-derived.md) | The Reconcile Unit is derived from the dependency graph | settled |
| [0033](0033-assignments-published-back.md) | Assignments are published back to the owning repository | settled |
| [0034](0034-cluster-state-pinned-input.md) | ClusterState is a pinned, digested input | settled |
| [0035](0035-network-policy-default-deny.md) | Network policy is default-deny, derived from the edge set | settled |
| [0036](0036-cni-selection.md) | The CNI is chosen for a non-enforcing policy stage | open |

### Composition and versioning
| # | title | claim |
|---|---|---|
| [0037](0037-composition-oci-fragments.md) | Declarations compose from published OCI fragments | settled |
| [0038](0038-participants-list-staleness.md) | Participants are listed, bounded by seven days of staleness | settled |
| [0039](0039-artifact-schema-versioning.md) | The artifact schema is semver; composition accepts a range | settled |
| [0040](0040-renovate-ordering-gate.md) | Version bumps ride Renovate behind an ordering gate | settled |

### Adapters and rendering
| # | title | claim |
|---|---|---|
| [0052](0052-registered-adapters-are-v1.md) | The registered adapters are v1; the second generation is deleted | settled |
| [0053](0053-adapter-port-contract.md) | An adapter satisfies one typed port | settled |
| [0054](0054-adapter-attribution.md) | Every Deliverable is attributed to exactly one Adapter | settled |
| [0055](0055-bidirectional-ledgers.md) | Every accepted hole is a bidirectional ledger | settled |

### Platform facts
| # | title | claim |
|---|---|---|
| [0056](0056-node-facts-single-source.md) | Node facts are authored once; nix imports them | settled |
| [0057](0057-datastore-and-restore.md) | Datastore, server count, and restore are recorded platform facts | open |

### Release and programme
| # | title | claim |
|---|---|---|
| [0059](0059-v1-scope-stopping-rule.md) | v1 has a scope and a stopping rule | open |
| [0060](0060-release-unit.md) | Several Services switch as one Release Unit | open |
