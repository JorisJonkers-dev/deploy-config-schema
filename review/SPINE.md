# `docs/adr` rebuild — the spine

A proposal for the complete new decision surface. **No ADR file has been written.**
Approve or redraw the carving here first; the carving is the highest-risk choice
in this rebuild, because carving is what went wrong last time.

Inputs: `review/CONSOLIDATED.md` (9 Blockers, 14 root-cause clusters, 103
findings), all 19 existing ADRs read in full, `spec/v1` chapters 00–60 as cited,
and `workspace/docs/decisions/` (15 estate decisions, separate namespace).

---

## What was decided in the grilling

| # | Decision |
|---|---|
| 1 | ADRs **justify**; `spec/v1` holds normative detail. No field lists, error codes or YAML in an ADR. |
| 2 | **Rebuild**, not amend. Content in scope. The existing 19 are inputs, not baselines. |
| 3 | **Tiered**: tier-0 *premise* ADRs each stating one falsifiable claim; tier-1 *decision* ADRs at one-reversible-decision grain, each naming its premise. |
| 4 | **Template**: frontmatter + `Rests on` / `Why` / `Alternatives` (with cost) / `Reversibility` / `Consequences` (each naming who pays). |
| 5 | **Status**: `accepted` = normative text merged **and** claim settled or `accepted-untested` with a named owner. |
| 6 | **Untested premises** get a real decision plus `claim: open`, the settling test, and an owner. |
| 7 | **Citations** are qualified links. Bare `ADR-00NN` fails the lint. |
| 8 | **Shared with workspace**: frontmatter and citation rules, including `decided-in:` issue links. Bodies stay distinct. |
| 9 | **Open items** gain mandatory owner / settles / blocks. A decision *with* a direction becomes an ADR with `claim: open`; a decision with *no* direction stays an Open item. |
| 10 | **Lint in CI**: structure, register integrity, citation + anchor resolution, content-shape. Turns blocking as the last commit. |
| 11 | `spec/v1` **follows**. A chapter contradicting a new ADR is what changes. |

---

## The size of this, stated plainly before you read it

**9 premises + 50 decisions = 59 ADRs**, against 19 today.

That is the honest arithmetic of "one separately-reversible decision each" applied
to a system this size — ADR-0005 alone contains seven of them. It is also a real
cost: 59 files is a maintenance surface, and the review's own warning about
designing for an estate that does not exist applies to the decision record too.

Two things make it tolerable rather than absurd: most files are short (a
justification with no normative content is 30–50 lines), and **19 of the 50 are
v1-blocking** — the rest can be authored as the work reaches them. A merge list
that takes the set to ~41 is at the end, if you want the smaller surface.

---

## Numbering

Sequential from `0001`, single namespace, `tier: premise | decision` as a
frontmatter field — **not** encoded in the number range. Encoding tier in the
number would create exactly the trap we just spent a decision fixing: a range that
runs out, and a reader who infers meaning from a digit.

Premises are authored first, so they naturally occupy `0001`–`0009`. The `P`/`D`
labels below are working labels for this document only; real numbers are assigned
at authoring time.

---

# Tier 0 — Premises

Nine claims. Each is falsifiable, each is named in `Rests on` by the decisions
beneath it, and falsifying one tells you exactly which decisions fall.

Ordered outermost first: P1 constrains whether the design should exist at this
size, P2 whether the substrate is right, P3–P5 how the model works, P6–P9 the
specific claims the review found untested or false.

| P | Premise | The claim, stated falsifiably | Status | Settled by |
|---|---|---|---|---|
| **P1** | **Estate scale and ownership** | One maintainer, one cluster, ~30 Services, ~10 repositories — and this holds for v1's horizon. | `claim: open` | `git shortlog --all` across the estate; a stated horizon. RED-006 already shows one human across three identities plus bots. |
| **P2** | **Kubernetes is the substrate, and two properties justify it** | The API server is a real authorisation boundary, and server-side-apply field ownership is a real drift mechanism. | **`claim: open` — currently FALSE as built** | `kubectl auth can-i --as=<deployer SA> -n <foreign ns> delete deployments`; and whether the two appliers share a field-manager name. B9 says both fail today. |
| **P3** | **Three layers, the middle one a contract** | Every field belongs to exactly one layer, and the boundary is decidable without a residue. | `claim: settled` | The v2 evidence: three rival schemas all claiming one apiVersion. This is the part the review calls sound. |
| **P4** | **Contention decides authority** | A value is platform-assigned iff it must be unique estate-wide or draws on a shared finite resource; every other value is Service-declared. | `claim: open` | Whether the rule partitions every field without argument. The field table it produced has drifted four times, which is evidence it under-determines. |
| **P5** | **Derivation from intent is total** | Every hand-tuned value in the live estate is reachable from a value only the Service could know. | **`claim: open` — currently FALSE** | Grep the estate's manifests for values with no layer-1 input. `securityContext` and resource requests have **zero** vocabulary today (B6): 0 hits across `src/` and `schemas/`. |
| **P6** | **Layer 2 is pure** | Every assignment is a pure function of Service Intent, the pinned Cluster Context and the pinned locks. | **`claim: open` — currently FALSE** | `spec/v1/20-resolved-deployment.md:11` states it; `:246` breaks it with an observed PV binding; `10-service-intent.md:463` breaks it again with `replicas` from live capacity. The decision is *pure* or *consumes a pinned `ClusterState` with its own digest* — not whether the current text is consistent, which it is not. |
| **P7** | **The data model's version is separable from the package's** | The artefact schema version need not equal `package.json`'s, and composition can accept a range per fragment without losing determinism. | `claim: open` | `src/cluster-context/schema.ts:75-79` asserts equality against `getPackageVersion()`. Under composition that is fail-closed over the union: one stale participant blocks every aggregator including the one shipping the fix. 26 releases in ten weeks. |
| **P8** | **A tested combination cannot be the deployed combination under pull** | Flux reconciles the rendered tree; the system tests run elsewhere; the two cannot be made the same thing without the deployer being the test runner. | **`claim: open` — falsifiable in an afternoon** | **workspace#45**, OPEN, P2, last touched 2026-08-27. Write the caller for the two existing reusable workflows and observe whether the gap persists. Owner: unassigned — assign it. |
| **P9** | **A Vault KV-v2 `read` grant is per-path, not per-key** | One `read` on `secret/data/platform/postgres` returns every key in that document. | **`claim: open` — ADR-0005's own argument says TRUE** | `vault kv get` as a test role. ADR-0005:76-79 chose `patch` over `update` precisely *because* a read/modify/write "would need `read` on the Discord webhook and Grafana client secret too" — which is this claim, asserted, then contradicted by `16-dependencies.md:287`. |

**Three of nine are currently false as built** (P2, P5, P6) and one is
contradicted by its own document (P9). That is the real headline of this rebuild:
the premises were never written down, so nothing checked them.

---

# Tier 1 — Decisions

`†` = **v1-blocking** (19 of 50). `NEW` = no ADR exists today.

### A — Identity and authorship

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D01 † | One flat Service Id; a divergence is an `alias` carrying its reason | P4 | From 0004. Uniqueness is a check, not structural — state that as the accepted cost. |
| D02 † | Configuration is env files with named placeholders, **per Workload**; a derived value written as a literal is a build error | P5 | From 0007. **The per-Workload scope goes in the decision statement** — 0005 and 0007 both say per Service, `10-service-intent.md:25` says per Workload, and the examples agree with the spec. This is where the drift was. |
| D03 | File-shaped configuration is an Asset; executable code is not | P5 | From 0007. Separately reversible from D02 — you could keep env files and bake Assets into images. |
| D04 | Blueprint packs are obtained by pinned checkout, never a registry artefact | P1 | From 0001, the only `Accepted` ADR and the only one missing from the register. Its rejection of registry distribution rests on a premise 0015 abandons — resolve that here or state why packs are exempt. |

### B — Workload-declared runtime intent

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D05 | Probes are sibling declarations, each carrying its own path; `probes: none` is explicit | P5 | From 0008. The liveness-probes-readiness fallback turns a dependency outage into a crash-loop. |
| D06 † | A volume declares a Durability Class: `reconstructible` / `recoverable` / `irreplaceable` | P5 | From 0008. **Today it renders nothing** — 0 grep hits across `src/` and `schemas/` — so it currently meets 0008's own definition of the inert attestation it replaced. |
| D07 † NEW | Pod hardening and resource class are layer-1 vocabulary | P5 | **B6.** Zero `securityContext` / `runAsNonRoot` / `readOnlyRootFilesystem` hits across *both* renderer generations. `size` is `<<proposed>>` and ungraded. Layer 1 is hand-authored in ~30 repositories, so this gets strictly more expensive every week — the only finding in the set with that property. |
| D08 | Placement is capability `requires` and weighted `prefers`, never label selectors | P5 | From 0009. An unsatisfiable `prefers` is a build error, because the scheduler discards it in silence — the `gpu-model-gtx960m` failure. |

### C — Exposure, dependencies, observability

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D09 | Exposure is declared by Audience; one closed vocabulary shared by Services and route tiers | P4 | From 0010. Three disjoint vocabularies today; `E_ROUTE_AUTH_MODE_NOT_IN_TIER` was implemented and vacuous exactly where it mattered. |
| D10 | Un-deployed hostnames are Registered Unmanaged Surfaces; the render asserts set equality | P4 | From 0010. Separately reversible from D09. |
| D11 | A dependency edge carries the provider, the surface used, and whether it is required | P5 | From 0011. Drives four derivations. |
| D12 | Observability is a scrape surface plus an Alert Class | P5 | From 0012. Gatus monitors 41 endpoints and notifies nobody. |

### D — Secrets

Seven decisions out of one 162-line ADR. This is the clearest case for the split:
B7 names three of them as separately-needed decisions, and the review found four
lenses converging here.

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D13 | Grants live on the Service document, not a separate `SecretAccess` file | P9 | From 0005. The rejection of the separate document is sound and survives. |
| D14 † NEW | **The grant unit**: is it the path (making `keys:` documentation, stated as such) or does the Secret Subtree split one path per grantable key set? | P9 | **B7.** Three worked examples grant different key subsets of one document; on P9 every one of those readers holds `read` on all of them. `knowledge`'s pod can read `auth-api`'s database password. |
| D15 † NEW | **Identity granularity**: ServiceAccount per Service, or per Workload? | P9 | **B7.** `src/adapters/kubernetes.ts:665-669` returns one SA per Service. So the two-level declaration is a documentation boundary, not an access boundary — two Workloads authenticate as one principal and get the union. |
| D16 | Access tiers (`read` / `self-renew` / `self-roll` / `custody`) derive the Vault policy | P9 | From 0005. Four tiers × three deliveries is twelve cells; the illegal ones need marking. |
| D17 | Delivery is `env`, `file` or `self` | P9 | From 0005. `self` is the only one achieving zero-downtime rotation. |
| D18 † NEW | The join key between a grant path and a `${secret:…}` placeholder | P9 | Grants are written `secret/data/platform/postgres`, placeholders `${secret:platform/postgres#kb.user}`. The transform is stated nowhere and does not generalise — `auth-api.service.yml:50` grants `transit/keys/auth-api-jwt`, which has no `data/` segment. `E_UNAUTHORISED_SECRET_REFERENCE` can be satisfied by the wrong grant. |
| D19 † NEW | **Secrets-at-rest**: who owns enabling it, by when, and what refuses `delivery: env`/`file` until the cluster advertises it | P9 | **B7.** ADR-0005 calls this "its own decision and its own work item" and names nobody; Open item 2 repeats the absence. Until it lands, `delivery: env` is a *regression* against the agent-inject path it replaces, which never touches etcd — and `env` is what every worked example except `auth-api` uses. |

### E — Layer 2: derivation and assignment

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D20 | The Resolved Deployment is a versioned, reviewable CI artefact | P3 | From 0002. Separately reversible from P3 — 0002 itself considered "three layers, middle documented but unversioned" and rejected it. |
| D21 | Runtime mechanics are derived from declared intent; none may be authored | P5 | From 0008. |
| D22 | A derived value is overridable inline with a reason; an assignment is not | P5 | From 0018. The accepted cost — overrides cannot be enumerated — disables chapter 16's out-degree-zero property on the surface most likely to accumulate dead declarations. |
| D23 | The Reconcile Unit is derived from the dependency graph; `platform.layer` is removed | P5 | From 0006. Note `cluster-state.schema.json` still lists `layer` in `required`. |
| D24 † | Assignments are published back into the owning repository as a generated file with a drift check | P4 | From 0017. Two decisions (0003, 0010) depend on it. Without the drift check it is worse than nothing: a stale file that looks authoritative. |
| D25 † NEW | **`ClusterState`**: what it contains, how it is pinned, and what digest it carries | P6 | Only needed if P6 resolves to "not pure". If P6 resolves to "pure", this ADR is not written and instead `replicas` and observed placement move out of layer 2. |
| D26 | Network policy is default-deny, derived from the edge set | P5, P2 | From 0011. |
| D27 † NEW | **CNI selection and the policy enforcement path** | P2 | **C10.** `networking.k8s.io/v1` has no audit mode and no ADR picks a CNI — repo-wide grep for `cilium\|calico\|kube-router\|flannel` returns zero. `60-setup.md:153` makes audit mode a hard precondition for the first production apply, so today the checklist contains an item that can never be ticked. Must precede D26. |

### F — Composition and versioning

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D28 | Declarations compose from published OCI fragments; the lock is an output | P1, P5 | From 0015. The submodule and topic-discovery rejections are well-evidenced and survive. |
| D29 | A versioned participants list with a staleness bound and an explicit dormancy exemption | P1 | From 0015. **"A staleness bound" needs a number and a unit** — it is the error standing between a missed publish and a deletion. |
| D30 † NEW | **What versions the data model**, and the per-fragment compatibility range at composition | P7 | **B3.** Three reviewers independently. Two artefacts already violate the current rule: `40-composition.md:237` and `10-service-intent.md:36` both write `schemaVersion: 1.0.0`, satisfiable only while the package sits at exactly `1.0.0`. |
| D31 | Version bumps are Renovate-driven behind a blocking ordering gate | P7 | From 0013. Its stated rationale — "chosen because there is nothing to build" — is contradicted three lines later by a gate that must be built plus two manual steps. |

### G — Delivery

Eight decisions out of one ADR. **All eight are conditional on P8**: if writing the
caller closes the tested≠deployed gap, D31's scope shrinks to the
relationship-ownership half and D32–D35 may not need to exist at all.

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D32 † | Class A is push-applied by aggregators; class B stays Flux | P8 | From 0019. The class-B-cannot-move argument (18 HelmReleases including Vault and VSO) is concrete and survives independently of P8. |
| D33 † NEW | **The prune inventory and apply/prune ordering** | P8 | **B4.** `aggregator-deploy.yml` prunes (step 5) *before* applying (step 6) — the inverse of Flux. And `50-lifecycle.md:105` enumerates the previous set with a bare `kubectl get -l`, which returns the default resource set: no CRDs, no PVCs. So `IngressRoute` and `VaultStaticSecret` are never pruned while PVCs are deletable. |
| D34 † NEW | **Delete authority and the durability refusal** | P8, D06 | **B4.** `deployer-rbac.yaml:29-30` grants `delete` on `persistentvolumeclaims` with no `resourceNames`; `--confirm-deletions` is a CI flag, not a confirmation; `durability` gates nothing; nothing restores. The worked example is `knowledge-vault-clone`, declared `irreplaceable`, on `local-path`, and it is a personal knowledge vault. |
| D35 | Continuous reconciliation is an in-cluster CronJob per aggregator re-applying its own lock | P8 | From 0019. The GitHub-Actions-schedule rejection is well-measured. |
| D36 | Break-glass: applying an older lock without tests, and how that state is reported | P8 | From 0019. "An unreported break-glass state becomes the silent status quo" — so the reporting is the decision, not the escape hatch. |
| D37 † NEW | **Field managers and serialisation between the two appliers** | P2 | **B9.** The merge deploy and the hourly CronJob deliberately share the field-manager name `auth-federation`, so SSA cannot report a conflict between the two writers most likely to collide. `Forbid` serialises the CronJob against itself; the workflow `concurrency` group serialises the deploy against itself; nothing serialises the two against each other. |
| D38 † NEW | **Deploy authority**: namespace-per-deployer, or admission control | P2 | **B9.** The generated Role is namespace-scoped with `create/patch/delete` on every kind and no `resourceNames`, and `aliases.namespace` exists specifically to let two Services share a namespace. `create`/`patch` on `deployments` is sufficient to read every Secret in the namespace, so withholding `secrets` verbs reads as a control and is not one. |
| D39 † NEW | **Class B pinning discipline** | P8 | **B8.** `src/adapters/flux-utils.ts` defaults chart version to `"*"` for cert-manager, external-dns, both Traefiks, MetalLB, VSO, RabbitMQ and observability — resolving to newest on every 1h reconcile, on the foundation the aggregator gate deliberately excludes. Plus `traefik-public` at `replicas: 1, maxSurge: 0, hostPort: 80/443` — a structural outage window on every chart bump, on the one component fronting all public TLS. **This is a live defect today, independent of every v1 decision.** |

### H — Testing

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D40 | System tests are owned by Aggregators; a Service declares no co-test list | P1 | From 0014. The provider-never-knows-its-consumers argument is the strongest in the set and is independent of P8. **Note:** 0014 cites this shape as "already rejected in ADR-0005" — ADR-0005 contains no such rejection. State the argument or drop the citation. |
| D41 | `exercises` is many-to-many, `deploys` is one-to-one; every domain has a default Aggregator | P1 | From 0014. Many gates, one applier. |
| D42 NEW | **vcluster as test substrate**: where they run, and the measured wall time and memory of one full-estate apply | P8 | ADR-0019 makes every deploy conditional on this and it is decided nowhere. One number decides whether the gate is viable. |

### I — Adapters and rendering

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D43 † NEW | **Which renderer generation is v1** — the 16 registered adapters, or the 14 unreachable modules under `src/deployment/render/`. The other is deleted. | P3 | **B5, the most consequential finding in the review.** `grep -rn "render/" src/` outside that directory returns nothing: 1,967 lines reachable from neither entry point, imported only by tests — and counted by the `--lines 90` coverage gate that guards every PR. Dead code is satisfying the quality bar. |
| D44 † NEW | **The adapter port**: the typed contract an adapter satisfies | P3 | Registering `prometheus` and `networking` is not the "cheaper half": those renderers consume `ProjectModel` while the registry hands adapters an `AdapterContext` of raw artifact documents. Porting across that seam is the same work as writing `rbac` from scratch. |
| D45 | Every Deliverable is produced by exactly one Adapter; one Fragment per Adapter per Service | P3 | From 0016. |
| D46 | Every hole is a bidirectional ledger with an owner, a reason and a review date | P3 | From 0016. The best-designed artefact in the estate (`accepted-fragment-drift.yml`) generalised. Applies to D10, D29 and D22. |

### J — Platform facts and operations

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D47 | Node facts are authored once in YAML; nix imports them rather than authoring labels | P5 | From 0009. Each node declared three times by hand today; live labels are named after an **archived** repository that rejects pushes. |
| D48 † NEW | **Datastore, control-plane count, and the rehearsed restore** with a stated RPO and RTO | P2 | **B4/B9.** None of the three is expressible in any schema in this repository. k3s server flags are load-bearing platform facts with no home in `platform.schema.json`. `workspace ADR-0011` confirms: no VolumeSnapshot CRDs, `local-path` has no CSI snapshot support, one off-cluster copy. |
| D49 NEW | **The delivery machinery's own observability**: Alert Class and owner for the CronJob, the gate, composition and the deploy job | P8 | ADR-0012 derives routing from fields only Services carry, so the machinery that deploys everything is the one thing nothing watches. Its failure mode is silence. |

### K — Programme

| D | Decision | Rests on | Notes |
|---|---|---|---|
| D50 † NEW | **v1 scope and the stopping rule**: which third of this is independently useful if the rest never lands | P1 | No ADR and no chapter states one. The review's read: *"the most likely failure here is not collapse but partial completion with both delivery models live."* |

---

## The template

```markdown
---
tier: premise | decision
status: proposed | accepted | superseded-by: 0041
claim: settled | accepted-untested | open
owner: <required when claim is accepted-untested or open>
date: 2026-08-31
normative: spec/v1/10-service-intent.md#secrets
decided-in: JorisJonkers-dev/workspace#45     # optional
rests-on: [0004, 0007]                        # decisions only; premises omit
---

# <The decision, as one declarative sentence>

## Rests on
<The claim, stated so it could be false.>
False if: <the observation that would falsify it>.
Settled by: <the exact command, experiment, or measurement>.

## Why
Two or three paragraphs of evidence. No field lists, no error codes, no YAML —
those live in the file named by `normative:`.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|

## Reversibility
Undo cost today: <concrete — files, hours, blast radius>.
Becomes irreversible once: <the event past which undo is not available>.

## Consequences
- <cost or effect> — paid by <who>
```

**Premise ADRs** use the same template with `rests-on` omitted and `## Alternatives`
listing the rival premises rather than rival implementations.

Four properties this enforces that no current ADR has: a falsifiable claim, a
costed alternative, an undo cost with an expiry, and a consequence with a payer.

---

## The lint

A new `adr` job in `.github/workflows/ci.yml`. **Turns blocking as the last commit
of the rebuild**, or CI is red across the whole directory while it is in progress.

**1 — Structure.** Frontmatter validates against a schema: `tier` and `status` in
range; `status: superseded-by` names an ADR that exists; `date` parses; `normative`
present; `claim` in range; `owner` present whenever `claim` is `accepted-untested`
or `open`; `rests-on` present on every decision and naming only premises. All five
body sections present. One file format across the directory.

**2 — Register integrity.** Every file in `docs/adr/` has a row in the register,
and every register row points at a file that exists. Requires `docs/adr/README.md`
as the index — which the directory has never had.

**3 — Citation and anchor resolution.** No bare `ADR-00NN` anywhere in prose:
every reference is a link with a repo qualifier. The `normative:` target file
exists **and** the heading anchor exists. This is the drift detector — it is what
would have caught ADR-0005 and ADR-0007 describing a per-Service env file after
the spec moved to per-Workload.

**4 — Content shape.** No fenced YAML block over ~10 lines in an ADR — the
mechanical enforcement of "ADRs justify, the spec is normative". A non-empty
`## Alternatives` table with a populated cost column. Every `## Open items` entry
in `00-overview.md` carries owner, what-settles-it, and what-it-blocks.

Check 4 fails ADR-0005 today until its tier table, delivery table, validation
table and 20-line YAML example move into `spec/v1/10-service-intent.md`.

---

## Disposition of the existing 19

Files are **deleted**, not tombstoned; git history is the archive.
`docs/adr/README.md` records the rebuild and the git ref of the last old-set commit.

| Old | Becomes |
|---|---|
| 0001 blueprint-pack-distribution | D04 |
| 0002 three-layer-meta-model | **P3** + D20 |
| 0003 contention-decides-authority | **P4**; the field table moves to `spec/v1` and is held in one place |
| 0004 flat-service-identity | D01 |
| 0005 credential-provisioning | **P9** + D13, D14, D15, D16, D17, D18 (+ D19 new) |
| 0006 reconcile-unit-is-derived | D23 |
| 0007 configuration-and-assets | D02, D03 |
| 0008 runtime-mechanics-derived | **P5** + D05, D06, D21 |
| 0009 node-facts-and-placement | D08, D47 |
| 0010 exposure-by-audience | D09, D10 |
| 0011 dependency-edges | D11, D26 (+ D27 new) |
| 0012 observability-by-class | D12 |
| 0013 schema-version-lockstep | **P7** + D30, D31 |
| 0014 co-testing-by-relationship | D40, D41 |
| 0015 composition-by-oci-fragments | D28, D29 |
| 0016 deliverables-and-ledgers | D45, D46 (+ D43, D44 new) |
| 0017 resolved-deployment-publish-back | D24 |
| 0018 derived-value-overrides | D22 |
| 0019 push-delivery-via-aggregators | **P8** + D32, D35, D36 (+ D33, D34, D37, D38, D39 new) |

All eleven ADRs the review said were missing are placed: D27 (CNI), D19
(secrets-at-rest), D30 (version model), D25 (ClusterState), D43/D44 (renderer and
port), D33/D34 (delete authority), D48 (datastore and restore), D07 (pod security),
D42 (vcluster), D49 (delivery observability), D50 (scope and stopping rule).

---

## `spec/v1` chapters that must follow

Not touched in this pass. This is the list the rebuild hands to the next one.

| Chapter | What changes | Driven by |
|---|---|---|
| `00-overview.md` | Decision register rewritten to the new set — every current link points at a path that will not exist. `## Open items` gains owner / settles / blocks on all eight existing entries. | all |
| `20-resolved-deployment.md` | The purity rule at `:11` and the observed-PV example at `:246`. Every reproducibility claim in 20, 30 and 40 restated if purity is conditional. | P6, D25 |
| `10-service-intent.md` | `replicas` from live capacity at `:463`. New layer-1 vocabulary for hardening and resource class. Absorbs ADR-0005's tier, delivery and validation tables. | P6, D07, D14–D19 |
| `30-deliverables.md` | The coverage table at `:85` is wrong on two of four rows — the registered `kubernetes` adapter already emits `pdb.yaml` and `servicemonitor.yaml`. Re-derive from `adapterContract()`. | D43 |
| `60-setup.md` | Step 6's adoption schedule, costed against a count matching neither generation. `:153`'s audit-mode precondition, currently unsatisfiable. | D43, D27 |
| `40-composition.md` | The `schemaVersion == installed` assert at `:105`; the literal `1.0.0` at `:237`. | D30 |
| `16-dependencies.md` | The "read on granted keys only" claim at `:287`; ServiceAccount from `id` at `:122`. | D14, D15 |
| `50-lifecycle.md` | The bare `kubectl get -l` inventory at `:105`. | D33 |

---

## Authoring order

1. **P1–P9**, all nine premises. Nothing below can name a `rests-on` until they exist.
2. **The template, `docs/adr/README.md`, and the lint in warn mode.** Prove check 3 (anchor resolution into `spec/v1`) is actually satisfiable before 50 files depend on it.
3. **The 19 v1-blocking decisions**, in dependency order: D43/D44 (which renderer) → D07 → D30 → D33/D34 → D14/D15/D18/D19 → D27 → D37/D38 → D39 → the rest.
4. **The remaining 31**, as the work reaches them.
5. **Lint to blocking**, register rewritten, old files deleted, in one commit.

D39 (class B pinning) is a live defect today and waits on nothing — it can be
fixed in parallel with step 1, ahead of its own ADR.

---

## If you want a smaller set

Nine merges take 59 → 50, at the cost of the reversibility property on each:

D02+D03 (config and Assets) · D09+D10 (audience and unmanaged surfaces) ·
D16+D17 (tiers and delivery) · D28+D29 (fragments and participants) ·
D33+D34 (prune order and delete authority) · D35+D36 (CronJob and break-glass) ·
D40+D41 (aggregator ownership and the two lists) · D45+D46 (attribution and
ledgers) · D21+D22 (derivation and overrides).

I would not merge D33+D34: B4 is the finding with the worst outcome in the review,
and apply-ordering and delete-authority genuinely fail independently.

---

## What I need from you before authoring

1. **Tier 0** — nine premises, right ones? P1 (estate scale) and P2 (why Kubernetes) are the two most likely to be wrong or unwanted.
2. **59 files** — accept, or take the merge list to 50?
3. **P6's direction** — pure, or a pinned `ClusterState`? D25 exists only under the second.
4. **P8's owner** — workspace#45 is open at P2 and unassigned. Who, and by when?
5. **The v1-blocking set** — 19 marked. Wrong count in either direction?
