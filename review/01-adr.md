# ADR integrity and decision quality — critique

Skills: `engineering:architecture` — **not installed** on this machine. No substitute was used; the lens was applied unaided.

Reviewed (read in full):

- `docs/adr/0001-blueprint-pack-distribution.md` … `docs/adr/0019-push-delivery-via-aggregators.md` (all 19 files, 1265 lines)
- `spec/v1/00-overview.md` (decision register + "Open items", lines 55–175)
- `spec/v1/10-service-intent.md` (grepped for env-file scoping and secret binding; lines 25–30, 263–331, 472, 498–500 read)
- `src/cluster-context/schema.ts` lines 60–95 (to check ADR-0013's citation)
- `src/deployment/render/networkpolicy.ts` lines 55–85 (to check ADR-0011's citation)
- `schemas/cluster-state.schema.json` lines 16–23 (to check ADR-0006's citation)
- `git log` for `docs/adr/`; directory listing of `spec/v1/examples/`

Not reviewed:

- `spec/v1/16-,20-,30-,40-,50-,60-*.md` in full — grepped only, for terms an ADR claim depended on. They are chapter prose, not ADRs; findings that would need them are marked below.
- `src/**` beyond the three files an ADR cites by path. Lens is ADR integrity, not implementation.
- Fixture and golden-output YAML. Out of lens.
- Referenced repositories (`fleet-infra`, `nix-config`, `homelab-inventory`, `workspace`, `flux-modules`, `deploy-harness`, `stack-integration-tests`). **Not available in this repo.** Every ADR's evidence base lives there, so all quantitative claims ("seven authoritative places", "fourteen PVCs", "342 files", "561 minutes") are unverifiable here and are treated as the authors' word, not checked.

## Findings

### ADR-001 — ADR-0003 is the root authority rule and three later ADRs plus the spec contradict it, unamended
Severity: Blocker
Confidence: Certain
Target: docs/adr/0003-contention-decides-authority.md:29-30
Evidence:
> `migration strategy, dependency lists, co-test sets and observability scrape`
> `paths are service-declared.`

Problem: ADR-0003 is the test every other ADR is supposed to apply — it decides, for every field in the model, which side declares it. Its own worked list is now wrong in at least three places. ADR-0014:8 says "A Service declares no co-test list", directly negating "co-test sets … are service-declared". ADR-0010:8-9 derives the "health endpoint" from exposure while ADR-0003:29 keeps "Health paths" service-declared — the two terms are never reconciled, so a field that exists once in the model has two owners. ADR-0008:34 derives rollout strategy from volumes while ADR-0003 leaves "migration strategy" service-declared, with no statement of whether those are the same concept. `spec/v1/00-overview.md:152` then adds a fourth: "Chapter 20 corrects ADR-0003 by separating *identity* … from *pool*, because not one live hostname is derivable from a Service Id" — the spec explicitly overrules the ADR's hostname assignment, and ADR-0003 still reads `hostnames … are platform-assigned` at line 27 with no amendment, no supersession note, and status `proposed`.

Consequence: an agent or engineer implementing from ADR-0003 — which is where the model tells them to start, and which `spec/v1/00-overview.md:21` names as the authority ("which layer is decided by the contention test in ADR-0003") — will put co-test lists, health paths and hostnames on the wrong side of the Intent/Resolved boundary. That is not a runtime bug; it is a schema shape, and schema shape is the one thing ADR-0013 makes expensive to change (a bump is "publish the new schema, republish the OCI context, then update `schema-version` in every consumer"). The correction lands after four service repositories have authored against the wrong shape.

Direction: ADR-0003's field list must be regenerated from the later ADRs and the spec, or deleted from ADR-0003 and held in exactly one place.

---

### ADR-002 — the sole mitigation for default-deny is "audit mode", which no Kubernetes NetworkPolicy stack provides, and no ADR picks a CNI
Severity: Blocker
Confidence: Likely
Target: docs/adr/0011-dependency-edges.md:34-35
Evidence:
> `- **Default-deny must ship in audit mode first.** Any connection that exists but`
> `  is not declared breaks the moment enforcement lands`

Problem: ADR-0011 acknowledges the failure mode precisely — "this cluster is known to contain undeclared paths" (line 36) — and then rests the entire mitigation on a capability it never establishes exists. Upstream Kubernetes `networking.k8s.io/v1` NetworkPolicy has no audit, dry-run, or log-only mode; policy-audit is a vendor extension (Cilium's policy audit mode, Calico's staged policies). Grepping this repo for `cilium|calico|kube-router|flannel` returns **zero** hits outside ADR-0011's own sentence and the spec's restatement of it. No ADR chooses a CNI, and the inventory records k3s as the distribution — whose bundled policy controller offers no audit mode. Assumption I cannot verify from this repo: the target cluster's CNI. If it is Cilium, this finding collapses to Minor (an unstated dependency); if it is the k3s default, the mitigation does not exist and the ADR's own worst case — "breaks the moment enforcement lands" — is what ships.

Consequence: a default-deny rollout across roughly thirty workloads with three declared policies (line 27-28) severs east-west traffic estate-wide at the moment of the first render, with no staging step available. `spec/v1/00-overview.md:162` records only that "The criterion for promoting to enforce is unstated" — which mistakes an unstated threshold for the actual gap, that there is nothing to promote *from*.

Direction: a CNI decision has to precede ADR-0011, or the mitigation has to be something the platform can actually run.

---

### ADR-003 — the only Accepted ADR rejects registry distribution on grounds ADR-0015 abandons, and was never revisited
Severity: Major
Confidence: Certain
Target: docs/adr/0001-blueprint-pack-distribution.md:18-20
Evidence:
> `Private GitHub Packages access has also caused friction for @jorisjonkers-dev`
> `packages, so adding a package-registry dependency would make pack resolution less reliable`

Problem: ADR-0001 rejects "Publish an npm or OCI artifact containing `packs/**`" (line 35) because a registry dependency is unreliable for consumers. ADR-0015:34 then makes GHCR OCI publication the backbone of the entire v1 model — "OCI publication is the pattern the estate already runs for exactly this purpose" — and every Service Intent, Secret Subtree, node fact and test project now travels that way. Either the registry-friction premise was wrong, or ADR-0015 inherits a reliability problem it never names. ADR-0001 carries `## Status\n\nAccepted` while all eighteen others use `status: proposed` frontmatter, so no tooling can see it as a set; and it is the **only** ADR absent from the decision register at `spec/v1/00-overview.md:63-82`.

Consequence: the one decision in this directory with binding status is invisible to the specification that supersedes its premise, and its `--blueprints-root` checkout mechanism sits unexamined beside an OCI-fragment model that solves the same problem differently. In six months a reader cannot tell whether pack distribution is intentionally the odd one out or was simply forgotten.

Direction: ADR-0001 needs either a supersession note pointing at ADR-0015 or an explicit statement of why packs are exempt from OCI.

---

### ADR-004 — ADR-0005 and ADR-0007 scope the env file to the Service; the spec scopes it to the Workload, and that is the join key for two security checks
Severity: Major
Confidence: Certain
Target: docs/adr/0005-credential-provisioning.md:11-12
Evidence:
> `names. An env-delivered secret appears in the Service's env file as a`
> `${secret:path#key}` placeholder`

Problem: ADR-0007's worked example agrees, at line 20: `# services/knowledge/platform/env/base.env` — one file per Service. `spec/v1/10-service-intent.md:268` states the opposite: "Env files are **per Workload**, because Workloads of one Service do not share an" environment, and line 25 gives the path as `platform/env/<workload>/base.env`. The examples directory confirms the spec (`knowledge-api.base.env` and `knowledge-ingest-worker.base.env` are separate files). This is not cosmetic: ADR-0005:132-133 defines two of its five validation rules — "dead grant" and "unauthorised reference" — as a join between the `secrets` list and the env file, and ADR-0005:156-157 asserts "There is no Workload-name join key" as the reason the design is safe. Under per-Workload env files there *is* a Workload-name join key, and under per-Service env files a Workload-level grant (which ADR-0005's own example at lines 28-37 shows) has no file scoped to hold its placeholder.

Consequence: the dead-grant and unauthorised-reference checks are the only things standing between a `secrets` list and a grant nobody uses or a reference nobody authorised. Implemented against the ADR's Service-scoped reading, a Workload-level `delivery: env` grant either fails spuriously or is silently exempted — and a silently-exempted grant is an unauthorised secret read that validates clean.

Direction: fix the scope in ADR-0005 and ADR-0007 rather than leaving the spec to carry the correction implicitly.

---

### ADR-005 — cross-repository ADR references collide with local ADR numbers and one drops the qualifier entirely
Severity: Major
Confidence: Certain
Target: docs/adr/0008-runtime-mechanics-derived-from-intent.md:64
Evidence:
> `irreplaceable data. ADR-0011 already used this vocabulary in prose: *"Valkey is`

Problem: ADR-0008 cites "ADR-0011 in the workspace" at line 43 for a claim about PVC snapshots, then at line 64 refers to "ADR-0011" bare. Local `docs/adr/0011-dependency-edges.md` is about network policy and dependency surfaces and says nothing about Valkey or durability. ADR-0014:27 and ADR-0019:22 do the same with "ADR-0010 in the workspace", which collides with local `docs/adr/0010-exposure-by-audience.md`. Two numbering spaces are in use with no prefix distinguishing them, and the qualifier that separates them is dropped at least once.

Consequence: this is the exact failure the lens asks about. An agent resolving "ADR-0011 already used this vocabulary" will open the local file, find nothing about durability, and either fabricate the missing rationale or silently drop the constraint. A human reader hits the same wall with no signal that the reference is external.

Direction: qualify every external reference with its repository, every time, or mirror the cited text.

---

### ADR-006 — ADR-0014's central argument rests on a rejection ADR-0005 does not contain
Severity: Major
Confidence: Certain
Target: docs/adr/0014-co-testing-by-relationship.md:21-22
Evidence:
> `require editing auth-api whenever any new consumer appears, which is the`
> `provider-enumerates-consumers shape already rejected in ADR-0005.`

Problem: ADR-0005 contains no such rejection. Its only rejected alternative is "A separate `SecretAccess` document … keyed by Workload name — a join key that can drift" (lines 120-123). That is a file-layout argument about join keys, not a principle about providers enumerating consumers. ADR-0014 is borrowing authority from a precedent that was never set, and it does so at the load-bearing step: the reason a `coTestWith` list cannot live on the Service.

Consequence: the strongest-looking sentence in ADR-0014 is unfalsifiable, because chasing the citation yields nothing to argue with. If the underlying reasoning is sound it is now undocumented; if it is not, nothing in the chain will catch it. ADR-0019 then builds the entire delivery model on ADR-0014's Aggregator.

Direction: state the argument in ADR-0014 or record it in ADR-0005; do not cite what is not there.

---

### ADR-007 — eighteen of nineteen ADRs are `proposed` while the specification they justify is being merged as normative
Severity: Major
Confidence: Certain
Target: docs/adr/0019-push-delivery-via-aggregators.md:2 (and 0002–0018:2)
Evidence:
> `status: proposed`

Problem: `git log docs/adr/` shows ADRs 0005, 0006, 0007, 0008, 0014, 0015 and 0019 all edited in `7ea3c4f docs: chapters 20-60, ADR-0019, and the worked example set (#64)` — later decisions retroactively editing earlier ones, which is legitimate only while they are proposals. But `spec/v1/00-overview.md:83-90` describes chapters landing "as its own pull request into `v1-pre-release`" and the register at lines 63-82 presents all eighteen as settled. Nothing in the directory records what acceptance would require, who grants it, or what the six "Open items" (`00-overview.md:150-175`) block. Two of those open items — secrets-at-rest and default-deny promotion — are prerequisites the ADRs treat as consequences.

Consequence: "proposed" is doing no work. It neither gates implementation nor signals instability, so the one signal a reader has for "is this settled" is inert, and the retroactive-edit pattern established during the proposal phase has no defined stopping point. In two years nobody can tell which of these was ever agreed.

Direction: either accept the set with the open items listed as conditions, or make `proposed` block something.

---

### ADR-008 — no ADR in the directory assesses reversibility, including the two that are effectively one-way
Severity: Major
Confidence: Certain
Target: docs/adr/0019-push-delivery-via-aggregators.md:74-76
Evidence:
> `## Consequences`
> `- **ADR-0015's rationale shifts.** A merge is now required to deploy`

Problem: Nineteen ADRs, zero statements of undo cost or the point past which undo becomes impossible. Two decisions need it most. ADR-0019 replaces Flux pull-reconciliation with `kubectl apply --server-side` plus a label-based pruning inventory (lines 53-57) and a per-aggregator CronJob (line 58); reverting means reconstructing Kustomization inventories for 364 objects that Flux no longer tracks, and the ADR never says so. ADR-0017 requires "write access to every participating repository" (line 37) and commits generated files into every service repo; reverting means those files become stale-but-authoritative, which ADR-0017:40-41 itself identifies as "worse than nothing". ADR-0009:61 deletes `nix-config/inventory/` outright.

Consequence: each of these becomes irreversible at a different, unstated moment — ADR-0019 when the first Flux Kustomization is torn down, ADR-0009 when the inventory directory is deleted, ADR-0017 when the first generated file merges. Nobody sequencing the migration knows which step is the door closing.

Direction: one paragraph per ADR: what undoing costs, and the commit after which it cannot be undone.

---

### ADR-009 — ADR-0005's access-tier × delivery matrix is defined only on the diagonal, and one tier renders nothing
Severity: Major
Confidence: Certain
Target: docs/adr/0005-credential-provisioning.md:56
Evidence:
> `| `self-renew` | **none** | no | none |`

Problem: The ADR defines four access tiers (lines 53-58) and three deliveries (lines 87-91) as independent fields on one entry, giving twelve combinations. Exactly one is ruled out (`delivery: env` with `rotation.tolerates: reload`, line 134). `self-renew` derives no privilege at all, and the delivery table does not say what a `self-renew` grant emits — a VSO sync it has no privilege to perform, or nothing. `custody` grants `create`/`update`/`delete` "under a prefix" over paths that "cannot be enumerated ahead of time" (line 82-83), which cannot coexist with `delivery: env` or `delivery: file` — both require known keys — yet neither combination is forbidden.

Consequence: this is the wrong-but-compliant case. An agent implementing ADR-0005 faithfully will emit *something* for `custody` + `env` and for `self-renew` + `env`, most plausibly a VSO sync against a prefix or an empty Secret, and the ADR gives no text that contradicts it. The result validates, renders, and fails at pod start or — worse for `custody` — mounts a Secret whose Vault policy permits writes.

Direction: the ADR needs the full 4×3 table with the illegal cells marked, not two independent lists.

---

### ADR-010 — four build-blocking thresholds are specified as adjectives
Severity: Major
Confidence: Certain
Target: docs/adr/0015-composition-by-oci-fragments.md:63-64
Evidence:
> `reconcile, and the render would look entirely valid. The participants list with`
> `a staleness bound is therefore not optional: E_PARTICIPANT_MISSING and E_PARTICIPANT_STALE`

Problem: `E_PARTICIPANT_STALE` is the error the ADR says "stand[s] between a missed publish and a deletion" — and its threshold is "a staleness bound", never a number. The same pattern recurs: ADR-0019:67 "Lag is measured instead" with no threshold and no alert; ADR-0010:61 and ADR-0016:41 require a "review date" on ledger entries with no cadence and no statement of what an expired one does; ADR-0016:48-49 says the adapter-totality gap "should be measured per adapter before committing to a schedule" while the ADR is being accepted without that measurement. Every one of these is an input to a build failure, so an unstated value is not a detail deferred to implementation — it is the implementer choosing the safety margin.

Consequence: ADR-0015's own worst case is a domain silently deleted from the cluster because Flux prunes. Whoever writes the check picks the window, and a generous default (say, seven days) makes the error unfireable in exactly the scenario it exists for. The ADR gives no way to tell a wrong choice from a right one.

Direction: put a number and a unit on each; a threshold nobody wrote down is a threshold nobody agreed.

---

### ADR-011 — ADR-0013's stated reason for choosing Renovate is contradicted by its own consequences
Severity: Major
Confidence: Certain
Target: docs/adr/0013-schema-version-lockstep.md:31-32
Evidence:
> `Renovate was chosen over bespoke orchestration because renovate.json is already`
> `present in every repository and there is nothing to build.`

Problem: The requirement is ordering — toolkit, then both OCI contexts, then consumers. One clause dismisses the alternative on the grounds that Renovate needs no building. The consequences section then concedes "Renovate cannot be sequenced" (line 36), which is the requirement, and mitigates it with a blocking CI ordering gate that must be built, plus two manual publish steps that remain "unverified by CI" (line 41). So the option was chosen for having nothing to build, and the decision as written requires a gate to be built plus a documented manual runbook. Line 44 admits "Without it this decision is the status quo" — the status quo being the live three-way skew at 0.16.0 / 0.20.0 / 0.22.0 (lines 27-28). The "bespoke orchestration" alternative was never costed against that.

Consequence: the ordering gate is the entire decision and it is the part treated as an afterthought. If it slips, the ADR's own text says nothing has changed — and the failure mode it names, "A routinely-red Renovate PR is the thing people learn to ignore" (line 38), is what four repositories at 0.16.0 already look like.

Direction: cost the sequenced alternative properly, or restate the decision as "build an ordering gate" with Renovate as an implementation detail.

---

### ADR-012 — four ADRs bundle decisions that must be reversible separately
Severity: Major
Confidence: Certain
Target: docs/adr/0019-push-delivery-via-aggregators.md:5
Evidence:
> `# Delivery is push, gated by relationship-scoped aggregators; Flux keeps the foundation`

Problem: The semicolon in that title is the tell, and it recurs. ADR-0019 decides four things: push delivery via `kubectl apply --server-side`; label-based pruning replacing Flux inventories; a per-aggregator in-cluster CronJob replacing continuous reconciliation; and an undefined break-glass path (line 99). ADR-0005 decides two-level declaration, a four-value access tier vocabulary, a three-value delivery vocabulary, and a five-rule validation set. ADR-0007's title already contains two decisions — "Configuration is env files with named placeholders; code is not configuration" — and the Asset boundary is a third. ADR-0008 bundles probe derivation, the `readiness`/`liveness` split, and the Durability Class replacement for `rollbackTargetRetention`.

Consequence: label-based pruning could fail on its own merits without push delivery being wrong, and the Durability Class could be right while probe derivation is wrong — but there is no unit of reversal smaller than the whole ADR. Revisiting one part means reopening a decision that four later ADRs cite as settled.

Direction: split on the semicolons; a decision that cannot be reversed alone was not one decision.

---

### ADR-013 — ADR-0005 makes two of its three deliveries conditional on work in a repository it does not control, with no owner and no ADR
Severity: Major
Confidence: Certain
Target: docs/adr/0005-credential-provisioning.md:145-147
Evidence:
> `- **delivery: env and delivery: file require Kubernetes secrets-at-rest`
> `encryption before they ship.** No --secrets-encryption configuration exists in nix-config`

Problem: This is a hard prerequisite recorded as a consequence bullet. It blocks the two deliveries every worked example uses, it depends on `nix-config` and a cluster bootstrap outside this repository, and the ADR closes it with "This is its own decision and its own work item" (line 150) — naming no owner, no ADR number, and no tracking. `spec/v1/00-overview.md:159-161` repeats it as open item 2 with the same absence. Meanwhile the ADR notes that "the agent-inject path being replaced never touches etcd" (line 149), so shipping ADR-0005 without the prerequisite is a **security regression** against what runs today, not merely an unmet goal.

Consequence: the ordinary path is to ship the schema, author the Services, and discover at cutover that plaintext base64 Secrets in etcd are now the delivery mechanism for every credential — having removed the agent-inject path that avoided them. Nothing in the ADR set fails a build over this.

Direction: it needs its own ADR with an owner, and a validation rule that refuses `delivery: env`/`file` until the cluster advertises encryption.

---

### ADR-014 — three load-bearing choices have no ADR at all
Severity: Major
Confidence: Likely
Target: docs/adr/0016-deliverables-and-ledgers.md:16-17
Evidence:
> `The adapter and fragment layer already exists and works — roughly twenty`
> `adapters, adapter-compat, parity checking with a behavioural profile`

Problem: ADR-0016 treats the adapter/fragment architecture as a given and only decides attribution and ledgers on top of it. That architecture — roughly twenty adapters, `adapter-compat`, the deterministic render hash, the artifact contract, and the one-fragment-per-adapter-per-service granularity — is the largest structural commitment in `src/` and no ADR records why it is shaped that way or what the alternatives were. Two more: ADR-0019 makes every deploy conditional on tests passing "against an ephemeral vcluster" (line 10) and ADR-0019:95 costs it at "roughly six suites run per service change, each provisioning a vcluster", yet vcluster-as-test-substrate is never decided anywhere. And the Zod-to-JSON-Schema generation pipeline (`scripts/generate-schemas.ts`, 24 emitted schemas) is the mechanism ADR-0013's whole lockstep model versions, with no ADR. Assumption: I searched only `docs/adr/` and `spec/v1/`; if these are recorded in the workspace repo, this reduces to the ADR-005 numbering problem.

Consequence: the parts of the system nobody wrote down are the parts nobody can challenge. ADR-0016's real content — "Each Adapter must become total for its target subsystem, and today none are" (line 46) — is an unbounded work item resting on an undocumented foundation.

Direction: three short ADRs, written retroactively, or an explicit note that they are recorded elsewhere and where.

---

### ADR-015 — ADR-0001's two rejected options are never costed
Severity: Minor
Confidence: Certain
Target: docs/adr/0001-blueprint-pack-distribution.md:35-36
Evidence:
> `1. Publish an npm or OCI artifact containing packs/**.`
> `2. Bundle a pinned snapshot of flux-modules packs in this package.`

Problem: Both options are listed and neither is mentioned again. The Rationale section (lines 40-48) argues only *for* option 3; option 2 in particular has an obvious cost — snapshot staleness — and an obvious benefit — zero consumer setup, works offline with no checkout — and neither appears. Option 1's dismissal rests entirely on the GitHub Packages friction sentence at line 18, which ADR-0015 later contradicts (see ADR-003 above).

Consequence: the ADR reads as a record of a conclusion rather than of a choice, so a reader who thinks bundling is better has nothing to argue against and will re-open it.

Direction: cost the rejected options or drop the section; a list that is never revisited is decoration.

---

### ADR-016 — ADR-0019 attributes a quotation to ADR-0015 that does not appear in it
Severity: Minor
Confidence: Likely
Target: docs/adr/0019-push-delivery-via-aggregators.md:76-77
Evidence:
> `- **ADR-0015's rationale shifts.** A merge is now required to deploy, which reads`
> `  against *"no centralized repo that needs to get pushed and merged for updates"*.`

Problem: `grep` across `docs/`, `spec/`, `README.md` and `CONTEXT.md` finds that string only at this line. ADR-0015's actual wording is "no repository needs a merge before a change takes effect" (line 38). The quotation marks assert a source; the source is not identified and, within this repo, does not exist. Assumption: it may quote a requirements document in the `workspace` repo, which I cannot read — but the sentence attributes it to ADR-0015's rationale.

Consequence: minor on its own, but this is the second instance (with ADR-006 above) of a citation that does not survive being followed, in a document set whose entire integrity model is cross-reference.

Direction: quote ADR-0015's own sentence, or name the document the quotation is from.

---

### ADR-017 — ADR-0006 declares a field removed while the schema that types it still requires it
Severity: Minor
Confidence: Certain
Target: docs/adr/0006-reconcile-unit-is-derived.md:9
Evidence:
> `the unit and its ordering from the Service's dependsOn list and its credential`
> `Claims. The platform.layer field is removed.`

Problem: The ADR's evidence checks out — `schemas/cluster-state.schema.json:20` does type `layer` as a bare `"type": "string"` with no enumeration, exactly as claimed. But line 16 of that same file lists `"layer"` in `required`, and `cluster-state` describes observed cluster objects rather than Service Intent. The ADR says "removed" without saying from which layer, so it is silent on whether the observed-state schema keeps a field the intent schema no longer produces, and on what a consumer of `cluster-state` does after the change.

Consequence: an implementer removes `layer` from the intent schema and either breaks `cluster-state` validation on live objects that still carry it, or leaves a required field nothing populates — and either way the ADR offers no answer.

Direction: name the layer the removal applies to, and state what `cluster-state.layer` becomes.

## Out of lens

- `docs/adr/` has no README or index; the only register lives in `spec/v1/00-overview.md` and omits ADR-0001.
- ADR-0009:29-31 records that live cluster node labels are namespaced under an archived repository (`personal-stack/*`) that rejects pushes — an operational exposure, not an ADR-quality one.
- ADR-0012:20-21 reports Gatus monitoring 41 endpoints with no `alerting` section — an unaddressed production gap.
- Two ADR file formats coexist (`## Status` heading in 0001, YAML frontmatter in 0002–0019); no template or lint enforces either.
- ADR-0019:99-101 defines a break-glass path in a consequence bullet with no procedure, no revert criteria and no runbook anywhere in the repo.
