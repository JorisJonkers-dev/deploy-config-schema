# Devil's advocate — critique
Skills: none loaded (lens block: SKILLS: NONE).
Reviewed (in full): `docs/adr/0001`–`0019` (all 19 files); `spec/v1/00-overview.md`,
`10-service-intent.md`, `16-dependencies.md`, `20-resolved-deployment.md`,
`30-deliverables.md`, `40-composition.md`, `50-lifecycle.md`, `60-setup.md`;
`CONTEXT.md`; `README.md`; `CLAUDE.md`; `CHANGELOG.md` (release cadence only);
`package.json`. Source read only to test stated premises:
`src/adapters/registry.ts`, `src/adapters/kubernetes.ts`,
`src/cluster-context/schema.ts`, `src/deployment/render/` (file list, plus
`servicemonitor.ts`, `workloads.ts` greps), `.github/CODEOWNERS`, `git shortlog`.
Not reviewed: `spec/v1/examples/**` (workflow and service YAML — the lens is
premises, not artefacts; several findings would sharpen if I had read them, and I
say so where it matters); `fixtures/**`, `test/**`, `schemas/**` (fixture and
golden material, outside the lens); `docs/adapters.md`,
`docs/deployment-parity-report.md` (v0 operational prose, not v1 premises).

## Findings

### RED-001 — The stated cause of the untested-deploy problem was "no caller", and the answer is a new delivery model
Severity: Blocker
Confidence: Certain
Target: docs/adr/0019:18; docs/adr/0014:31
Evidence:
> `exist… Both have zero runs, ever - the only missing piece is a caller."*` (0014:31)
> `**A tested combination could not be the deployed combination.**` (0019:18)
Problem: ADR-0019's first justification is that tests and delivery were separate.
Its own supporting quote says the tests compile and lint on every PR, two tasks
and two reusable workflows already exist, and the only missing piece is a caller.
A caller is a workflow file. The response is to replace pull-based delivery with
push delivery, per-aggregator RBAC, prune-by-label-query, an in-cluster reapply
CronJob, lag measurement, expand/contract contraction checks and a break-glass
path. None of that is required to make the 147 existing tests run before a
deploy; a gate workflow on the existing render is.
Consequence: the estate acquires an entire bespoke delivery mechanism, and its
load-bearing justification can be falsified in an afternoon by writing the caller
and observing whether the gap closes. If it does close, every consequence listed
in ADR-0019's "What is given up" section was paid for nothing.
Direction: run the existing suite against the existing pipeline first, and let
that result decide whether ADR-0019 is still needed.

### RED-002 — The purity rule, the specification's load-bearing property, is already false in its own text
Severity: Blocker
Confidence: Certain
Target: spec/v1/20-resolved-deployment.md:11; spec/v1/40-composition.md:190
Evidence:
> `> **Every assignment is a pure function of Service Intent, the pinned Cluster` (20:11)
> `| every live object is attributable or ledgered (chapter 30) | `E_UNATTRIBUTED_OBJECT` |` (40:190)
Problem: three separate places break the rule. `E_UNATTRIBUTED_OBJECT` and
`E_CONTRACT_TOO_EARLY` (40:195) are composition invariants that can only be
evaluated by reading the live cluster, yet chapter 40 asserts that re-composing
from a recorded lock "must yield the identical `composedDigest`" (40:256).
Chapter 20 introduces an `observed:` block for the `local-path` node binding —
"existing cluster state — observed, not decided" (20:161-162) — which chapter 16
feeds into the Deployment via `r_node --> k_dep`. And chapter 10 lists `replicas`
as "assigned from `minAvailable` and capacity" (10:463) while chapter 20 says a
replicas assignment reading live capacity "would violate purity outright"
(20:266). The falsifiable claim is: *every assignment can be computed without
reading the cluster.* It is already known false for at least node binding, and
the design's own reproducibility guarantee ("re-rendering from the recorded
digests yields a byte-identical Deliverable Set", 20:173-176) is therefore
conditional in a way no chapter states.
Consequence: `renderHash` stops meaning what chapter 30 says it means. A render
that differs because a PV moved is indistinguishable from a render that differs
because an input was not pinned — which is precisely the diagnosis chapter 20
tells you to make when hashes disagree. Publish-back PRs then churn on cluster
events rather than on decisions, and the "attributable change" property (20:177)
is gone.
Direction: decide whether layer 2 is pure or whether it consumes ClusterState,
and if the latter, stop claiming byte-identical reproducibility.

### RED-003 — Version lockstep, harmless per-repo, becomes an estate-wide freeze once composition unions every fragment
Severity: Major
Confidence: Likely
Target: docs/adr/0013:27-28; spec/v1/40-composition.md:116
Evidence:
> ``this decision is `0.16.0` in four service repos, `0.20.0` in`` (0013:27)
> `    p4["assert schemaVersion == installed toolkit"]` (40:116)
Problem: today skew is local — a repo pinned at 0.16.0 renders with 0.16.0 and
nobody else notices; ADR-0013 records three-way skew as the *current* state.
Under composition, every fragment is asserted against one installed toolkit in
one process, so any single stale participant produces no `ComposedIntent` and
nothing anywhere renders. `CHANGELOG.md` shows 26 releases between 2026-06-09 and
2026-08-20, three of them on two consecutive days. With ~10 participants, each
toolkit release opens ~10 Renovate PRs that must all merge before the estate can
render again.
Consequence: the normal state of the estate becomes "composition red, waiting on
the last repo", exactly the routinely-red condition ADR-0013 itself warns people
learn to ignore (0013:38). Assumption I cannot verify: that release cadence
continues post-v1 and that participant count is around ten.
Direction: either the lockstep constraint or the release cadence has to give;
compatibility ranges are the usual answer and the abandoned
`feat/unversioned-contract` branch was the previous attempt at it.

### RED-004 — The boring version — one declarations directory — was never written down, and the only argument against it has been conceded
Severity: Major
Confidence: Certain
Target: docs/adr/0015 (Considered options); docs/adr/0019:76-77
Evidence:
> `- **ADR-0015's rationale shifts.** A merge is now required to deploy, which reads` (0019:76)
> `  against *"no centralized repo that needs to get pushed and merged for updates"*.` (0019:77)
Problem: ADR-0015 considers exactly two alternatives — git submodules and live
topic discovery — and rejects both because they require a central merge. It never
considers the simplest option: one repository holding every Service Intent as a
directory, rendered by one job. That option removes OCI publication, `oras
resolve`, the composition lock, `lockChain`, `participants.yml`, `maxAge`,
`dormant`, `E_PARTICIPANT_MISSING`, `E_PARTICIPANT_STALE`, and the entire class of
"a domain silently failed to publish and Flux deleted it" (0015:60-61) — because
a directory cannot silently fail to publish. Chapter 40's claim that seven
properties "cannot be evaluated against one repository in isolation" (40:9-10) is
true of *service* repositories and false of a declarations repository. The stated
cost is duplication: intent lives beside code today. That is one `service.yml`
per service moving one directory over, for ~30 services, once. And ADR-0019 has
already given up the property that justified the split.
Consequence: the estate carries a distributed-systems artefact-resolution problem
— staleness bounds, digest chains, missing-publisher deletion risk — to avoid a
merge it now performs anyway, six times per change.
Direction: write the central-declarations option down and reject it on its
merits, or concede that nothing rules it out.

### RED-005 — Every aggregator PR applies the whole composed estate to a vcluster, ~6× per change, on the same hardware as production
Severity: Major
Confidence: Likely
Target: spec/v1/50-lifecycle.md:245; docs/adr/0019:93-94
Evidence:
> `    Agg->>VC: provision, apply whole composed estate` (50:245)
> `- **CI cost grows.** A change anywhere invalidates every aggregator's pin, so` (0019:93)
Problem: the gate provisions a vcluster and applies the entire composed estate —
405+ objects, and if chapter 50's open item 2 resolves to "yes", Flux plus 18
HelmReleases including Vault, VSO, Prometheus, Loki, Tempo, Pyroscope, Grafana
and Alloy. One service change invalidates every aggregator's pin, so roughly six
of these run per change. The runner is in-cluster (50:197-198), and the same
`local-path` storage and 7-node capacity that chapter 20 treats as a finite
contended pool is what the vclusters draw on. No chapter states a measured wall
time, a memory figure, or a concurrency limit for this.
Consequence: the gate becomes slow enough to route around, or test load evicts
production workloads on the nodes whose scarcity the whole placement model
exists to arbitrate. Assumption I cannot verify: that the vclusters run on the
production k3s cluster rather than separate hardware — chapter 50 places the
runner inside the cluster but does not say where vclusters land.
Direction: time one full-estate apply into one vcluster before anything else in
chapter 50 is built; that single number decides whether the gate is viable.

### RED-006 — The design assumes an organisation; the repository shows one person
Severity: Major
Confidence: Likely
Target: docs/adr/0003:34-35; spec/v1/60-setup.md:76-77
Evidence:
> `- A service owner cannot read their own service's URL out of their own` (0003:34)
> `The order below is the safe one. Getting steps 2 and 4 the wrong way round` (60:76)
Problem: `git shortlog --all` shows one human across three identities (35
commits) plus bot accounts; CODEOWNERS points at a team whose membership I cannot
see. The model is built for separated authority: `owner` fields, `alertClass:
page`, notifier routing, publish-back pull requests into "the owning repository",
ledgers with an owner and a review date, `deploys` RBAC so "a workflow applying a
Service it does not own gets a 403" (0014:48), and one Aggregator repository per
relationship. If one person is every owner, then every publish-back PR is a
self-review, every ledger review date is a note to self, and the 403 protects the
author from the author. Meanwhile the operational load — a 26-invariant
composition service, ~6 aggregator repositories, an in-cluster runner, a
publish-back bot with write access to every repository, and an adoption procedure
where step order decides whether production is deleted — lands on that one person.
Consequence: the controls that cost the most to build are the ones that deliver
least at this headcount, and the procedures that must be executed correctly under
pressure have no second pair of eyes. Six months on, the ledgers are stale
entries reviewed by nobody and the aggregator PRs are rubber-stamped.
Direction: separate the invariants that catch *your own* mistakes from the ones
that arbitrate between people, and build only the first set until there is a
second person.

### RED-007 — v1 makes secret handling strictly worse until an unscheduled prerequisite lands, and the default delivery is the affected one
Severity: Major
Confidence: Certain
Target: docs/adr/0005:145-147; spec/v1/60-setup.md:145-147
Evidence:
> `- **`delivery: env` and `delivery: file` require Kubernetes secrets-at-rest` (0005:145)
> `  encryption before they ship.** No `--secrets-encryption` configuration exists in` (0005:146)
Problem: ADR-0005 states that the mechanism being replaced — Vault Agent
Injector annotations — never touches etcd, while `delivery: env` and `file`
write plaintext base64 Secrets into etcd. Both are blocked on a k3s
secrets-at-rest configuration that exists nowhere in the tree and is designed in
no chapter. Chapter 10 and every worked example except `auth-api` use `delivery:
env`. So the majority of the estate's secrets cannot migrate, and the checklist
item that blocks them (60:145) sits alongside six others with no owner or date.
Consequence: either v1 ships with secrets in a weaker posture than v0, or v1 does
not ship for most services. The prerequisite is a node-level k3s reconfiguration
plus re-encryption of existing Secrets, which is not a small unlisted task and is
not in the bootstrap order (60:11-25).
Direction: put secrets-at-rest into the bootstrap order as step 0 with its own
design, or drop `delivery: env` from v1 and keep the injector path.

### RED-008 — There is no fast forward path; break-glass only goes backwards
Severity: Major
Confidence: Certain
Target: spec/v1/50-lifecycle.md:184-185
Evidence:
> `**Break-glass:** a `workflow_dispatch` applies a named older lock directly,` (50:184)
> `skipping tests. Because the applied lock is read from the cluster's annotations,` (50:185)
Problem: a one-line urgent fix must traverse: merge to the service repo → publish
fragment → composition with all 26 invariants and every participant fresh →
Renovate raises the pin → aggregator PR → provision vcluster → apply the whole
estate → run the relationship suite → merge → apply. Every step in that chain is
a place it can stop, and three of them (composition freshness, Renovate timing,
suite flake) are outside the person making the fix. The only documented escape
applies an *older* lock. There is no rehearsed way to push a *new* value fast.
Consequence: under incident pressure the actual behaviour will be `kubectl edit`,
which server-side apply then surfaces as a field-ownership conflict on the next
CronJob run (50:151-153) — a conflict the design says is "reported, never
resolved with `--force-conflicts`", so the fix stays live, unreconciled and
unrecorded, which is the silent status quo the same chapter warns about.
Direction: design the forward break-glass path explicitly, or accept that
`kubectl edit` is it and make the conflict report the audit trail.

### RED-009 — Coverage claims that the adoption plan depends on do not match what is built
Severity: Major
Confidence: Certain
Target: spec/v1/30-deliverables.md:85; src/adapters/kubernetes.ts:384
Evidence:
> `| `PodDisruptionBudget` | 6 | no adapter, no renderer |` (30:85)
> `    kind: "PodDisruptionBudget",` (src/adapters/kubernetes.ts:384)
Problem: the registered `kubernetes` adapter already emits `pdb.yaml`,
`servicemonitor.yaml` and `podmonitor.yaml` (`src/adapters/kubernetes.ts:48-62`),
and renders PDB and ServiceMonitor/PodMonitor manifests inline (`:384`, `:448`).
There is a second PDB renderer at `src/deployment/render/workloads.ts:298` and a
second ServiceMonitor renderer at `src/deployment/render/servicemonitor.ts` —
i.e. two more duplicated pairs beyond the four chapter 30 names. So the "36
objects, 22 need writing" measurement, and chapter 60's bootstrap step 6 which
declares `rbac` and `availability` blocking for adoption (60:27-31), rest on a
count that does not match the registry. Separately, chapter 30's normative
adapter set gives `PodDisruptionBudget` to `availability` and ServiceMonitor to
`prometheus` while `kubernetes` already writes both files — which is the path
collision the same chapter makes a build error (30:140-141).
Consequence: the adoption schedule is sequenced off a wrong number, and the first
thing the new `availability` and `prometheus` adapters will do is collide with
the incumbent.
Direction: re-derive the coverage table from the registry rather than from the
cluster tree, and decide what `kubernetes` gives up before writing its
replacements.

### RED-010 — The design's evidence is uniformly of defects detected, never of defects that cost anything
Severity: Major
Confidence: Likely
Target: docs/adr/0003:19-21; docs/adr/0010:18-22
Evidence:
> `conformance tests exist for no purpose other than detecting when those seven` (0003:19)
> `disagree. The guard was cheaper to write than the fix, which is how the estate` (0003:20)
Problem: this is the uncomfortable question the specification avoids. Every
motivating example — `kb.jorisjonkers.dev` in seven places, `rollbackTargetRetention`
inert, `platform.layer` wrong in 7 of 7, 60 duplicated `OTEL_*` lines,
`gpu-model-gtx960m` — is described as *discovered by reading*, guarded by a test,
or harmlessly wrong. Not one ADR cites an outage, a failed deploy, a lost hour or
a user-visible symptom caused by any of them. The falsifiable claim underneath
the whole design is: *duplication in this estate has a cost that exceeds the cost
of eliminating it.* The cheap test is available now: check whether either
conformance test ever failed on a real divergence, and check the incident history
for anything traceable to a duplicated declaration.
Consequence: if the answer is no, then the design is spending a large build
against an aesthetic complaint, and the genuinely operational holes it also names
— 41 Gatus checks notifying nobody, one PrometheusRule for ~30 workloads, three
NetworkPolicies — are each a day's work that does not need a meta-model.
Direction: fix the three operational holes directly first and see what the
remaining pain actually is.

### RED-011 — Requirements that are predictions, and what deferring them costs
Severity: Minor
Confidence: Certain
Target: spec/v1/00-overview.md:198-199; spec/v1/40-composition.md:210-211
Evidence:
> `11. **Whether the union may span clusters** (chapter 40). The lock is keyed by` (00:198)
> `  intent-observability: {maxAge: 90d, dormant: true,` (40:210)
Problem: several structures are shaped by futures that may not arrive. The
composition lock is keyed by cluster and Service Ids are estate-wide "invisible
with one cluster" — there is one cluster, `production`, and `CONTEXT.md` says so
outright. `domain` as the publication unit anticipates repository splits that
chapter 40 then declares unnecessary. `maxAge`/`dormant` staleness bounds exist
only because publication can silently fail, which is itself a consequence of
RED-004. `alertClass: page` and notifier routing anticipate an on-call rotation.
Deferring each of these costs approximately nothing — one cluster stays one
cluster, one repository stays one repository — while being wrong about them costs
a schema version and a migration.
Consequence: the v1 schema carries fields whose only consumer is a hypothetical
second cluster or second person, and those fields are then load-bearing for
invariants that must be maintained forever.
Direction: mark the multi-cluster and multi-repo affordances as explicitly
deferred rather than designing around them now.

### RED-012 — The escape hatch reintroduces the exact defect class the design exists to eliminate, and this is accepted rather than resolved
Severity: Minor
Confidence: Certain
Target: docs/adr/0018:32-33; spec/v1/16-dependencies.md:231
Evidence:
> `- Overrides cannot be enumerated estate-wide, so a dead override looks identical` (0018:32)
> `  to a load-bearing one and both persist. This is an accepted cost.` (0018:33)
Problem: chapter 16's property 3 — "no declaration has out-degree zero" — is
presented as the check that would have caught `rollbackTargetRetention` and
`platform.layer`. An `override` is a declaration. ADR-0018 concedes overrides
cannot be enumerated, so property 3 cannot run over them. The one place the model
permits arbitrary hand-tuning is the one place the model's own dead-declaration
check is switched off. ADR-0018 notes recovery is "later available" (0018:34-36),
which is a plan, not a check.
Consequence: overrides accumulate as the residue of every derivation rule that
was slightly wrong, and in three years they are the real configuration, unaudited
by the property built to audit exactly this.
Direction: if composition reads every fragment anyway, make the override register
part of v1 rather than a later read.

### RED-013 — No cost is stated anywhere; my estimate, against the value delivered
Severity: Minor
Confidence: Speculative
Target: docs/adr/0016:46-47
Evidence:
> `- **Each Adapter must become total for its target subsystem, and today none are.**` (0016:46)
> `  342 files exist under `fleet-infra/cluster` and only some are attributable. The` (0016:47)
Problem: nineteen ADRs and eight chapters contain no build estimate, no budget
and no schedule. Assembling the work they name: a composition service with 26
invariants and (per 60:151-152) one negative fixture each; two new adapters plus
six pair-collapses; a publish-back bot with write access to every repository;
~10 fragment-publish workflows; ~6 aggregator repositories each with gate,
deploy, a custom Renovate manager and a decomposed suite; an in-cluster runner
with per-aggregator RBAC; decomposing 147 tests across 31 classes; four images to
build; k3s secrets-at-rest with re-encryption; node-YAML-to-nix migration and
relabelling live nodes; rewriting ~30 service repositories into `service.yml`
plus per-workload env files; and retiring three auth vocabularies across every
routed service. **My estimate, not the document's: 400–900 hours of one person's
evenings, i.e. 6–12 months, plus recurring CI spend the design itself measures at
five times real compute (0019:95-96).** The value delivered is a 30-service,
7-node, one-cluster, one-user homelab that currently runs.
Consequence: the most likely outcome is not failure but partial completion —
composition and fragments built, aggregators and coverage not, leaving an estate
with both delivery models live and the prune semantics of neither.
Direction: state a budget and a stopping rule, and order the chapters so the
first third is independently useful if the rest never lands.

## Out of lens
- Chapter 50's prune pseudo-code does not enumerate which resource kinds the `-l deployer=` query covers; an unlisted kind can never be pruned.
- Chapter 30 open item 4: the allocator's `platform/cluster/flux` root disagrees with `fleet-infra`'s `cluster/flux`.
- `src/adapters/kubernetes.ts:65-67` emits a `raw.yaml` passthrough, which sits awkwardly with "layer 3 contains no decisions".
- Chapter 16's CORS predicate is explicitly unresolved and blocks the `auth-api` inbound derivation.
- ADR-0001's `--blueprints-root` remains a filesystem path contract while everything else in v1 moves to OCI digests.
- Chapter 20's `E_NO_TIER_FOR_AUDIENCE` and the `lan`/`internal` audiences are unexercised by any example I read.
- `spec/v1/examples/**` unread: the four workflows and three service YAMLs may already answer or contradict RED-005 and RED-009.
