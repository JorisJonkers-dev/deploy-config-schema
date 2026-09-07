# Consolidated review — v1 meta-model, ADRs 0001–0019, spec/v1

Consolidator's note on inputs. All six critiques were present and non-empty
(`review/01-adr.md` … `06-redteam.md`, 2,481 lines of findings). Nothing is
missing. Every quotation below was re-read against the source file before being
carried forward; findings whose evidence did not survive that are in **Rejected
findings**, and one reviewer's *framing premise* did not survive it, which
changes the standing of nine of its findings.

The skill this task named (`engineering:architecture`) is not installed on this
machine — the same gap five of the six reviewers reported. `ai-software-architect`
was loaded in its place and used only for the ADR-actions section. No ADR was
created or amended.

---

## Verdict

**Sound at the core, wrong at the premise in the delivery half.** The three-layer
meta-model, the contention rule for deciding authority, and the discipline of
deriving rather than declaring are good and worth keeping — they are the part of
this design that pays for itself, and most of the ADRs applying them are sound
with amendment. But the specification's single load-bearing property — "every
assignment is a pure function" (`spec/v1/20-resolved-deployment.md:11`) — is
falsified by chapter 20's own worked example twelve pages later, and the delivery
model bolted on in ADR-0019 rests on a stated justification that its own citation
contradicts and that an afternoon's work would settle. Fix the premise questions
first: roughly half the 103 findings below are defects *inside* a delivery
mechanism that has not been shown to be necessary, and repairing them before
answering that question is the expensive mistake available here.

---

## Blockers

Ranked across the whole set, not within any one lens. Each says what decision is
needed, not what code to write.

### B1 — ADR-0019's headline justification is falsifiable in an afternoon, and most of the delivery findings sit underneath it

Found by: 06-redteam (RED-001, and reinforced by RED-004, RED-006, RED-010).
Weighted separately per the red-team rule.

Evidence, verified. ADR-0019:18 gives as its first of two reasons: *"A tested
combination could not be the deployed combination."* Its own supporting quote,
carried into ADR-0014:30-32, says: *"CI compiles and lints all 32 classes on
every PR; only execution is missing, because `tasks.test` calls
`excludeTags("system")`. Two dedicated tasks and two reusable workflows already
exist… Both have zero runs, ever - the only missing piece is a caller."* A caller
is a workflow file. The response is push delivery via `kubectl apply
--server-side`, per-aggregator RBAC, prune-by-label-query, an in-cluster reapply
CronJob, lag measurement, expand/contract contraction checks, and a break-glass
path.

What is at stake. If writing the caller closes the gap, then the following
findings are fixes for a design that should not be built: DAT-003, DAT-005,
DAT-007, DAT-008, DAT-011, DAT-012, K3S-013, K3S-015, K3S-017, OPS-001 through
OPS-008, OPS-011, OPS-015, OPS-016, and the reversibility problem in ADR-008.
That is roughly a third of the total finding count.

What survives regardless. ADR-0019's *second* reason — "Relationships had no
owner", 12 of ~25 test classes exercising `auth-api` with its consumers — is
independent of the first and is not answered by writing a caller. So the ADR is
not falsified in whole. But its headline argument is the one every downstream
chapter cites, and it has not been tested.

**Decision needed:** run the existing suite against the existing pipeline, and
let that result decide whether ADR-0019 is still needed in its current scope, or
whether only its relationship-ownership half is.

---

### B2 — The purity rule is stated as load-bearing and is false in the same chapter

Found by: 06-redteam (RED-002), 03-data (DAT-006, DAT-007). Two lenses, opposite
angles.

Evidence, verified. `spec/v1/20-resolved-deployment.md:8-11` — *"Layer 2 has one
[rule], and it is the load-bearing property of the whole specification: **Every
assignment is a pure function of Service Intent, the pinned Cluster Context, and
the pinned locks.**"* Then at `:246-249`, inside the normative `ResolvedService`
example, under `assigned:`:

```
      observed:
        node: enschede-t1000-1
        because: knowledge-vault-clone PV is bound here
```

`inputDigests` is `{intent, imagesLock}` with `contextRef` alongside (`:216-217`);
the observed PV binding is in none of them and is read from the live cluster.
Chapter 20's own rule says such a value "may not stay in layer 2" and it stays in
layer 2.

Two framings, and the second reveals the cost. RED-002 frames it as the falsifiable
claim collapsing. DAT-006 frames it as the *diagnosis* misleading: property 1 says
"a mismatch means an input was not pinned — which is a defect in the lock, not in
the render", so a render that differs because a PV rebound after a node failure
will be reported as a lock defect. The hourly in-cluster CronJob re-renders from a
pinned lock and can legitimately produce a different tree from the merge deploy,
with every digest identical. Reproducibility fails precisely when it matters most.

A third instance is already flagged and unresolved in the documents themselves:
`spec/v1/10-service-intent.md:463` assigns `replicas` "from `minAvailable` and
capacity" while `20-resolved-deployment.md:266` says a `replicas` assignment
reading live capacity "would violate purity outright".

**Decision needed:** is layer 2 pure, or does it consume a pinned `ClusterState`
with its own digest? If the latter, the byte-identical reproducibility claim in
chapters 20 and 30 must be restated as conditional.

---

### B3 — `schemaVersion` is the npm package version, and composition asserts equality fail-closed over every fragment

Found by: 03-data (DAT-001), 02-patterns (PAT-010), 06-redteam (RED-003). Three
independent reviewers.

Evidence, verified in code and in the spec. `src/cluster-context/schema.ts:75-79`:

```ts
  const installed = getPackageVersion();
  if (ctx.spec.schemaVersion !== installed) {
    throw new Error(`E_SCHEMA_VERSION_MISMATCH: expected ${installed}, got …`);
```

`getPackageVersion()` reads `package.json`'s `version`. `spec/v1/40-composition.md:105`
puts `assert schemaVersion == installed toolkit` in the resolve stage, and
`:128-129` routes any failure to *"no ComposedIntent. Nothing renders."*

The amplification is the finding, and no ADR names it. Under v2 each consumer
rendered alone, so skew was local — ADR-0013:26-28 records live skew of `0.16.0`
in four repos, `0.20.0` in one, `0.22.0` in the contexts, and the estate still
functions. Under composition, one stale participant blocks every aggregator,
including the one shipping the fix. `dormant: true` exempts a participant from
`maxAge` but not from the version assert. `CHANGELOG.md` shows 26 releases in ten
weeks; each one, post-v1, opens ~10 Renovate PRs that must all merge before
anything renders. ADR-0013 was written about per-repo skew and never revisited
for the union.

Two artefacts already contradict the rule as written: `spec/v1/40-composition.md:237`
and `spec/v1/10-service-intent.md:36` both write `schemaVersion: 1.0.0`, satisfiable
only while the npm package sits at exactly `1.0.0`.

**Decision needed:** what versions the data model, if not `package.json`, and does
composition accept a compatibility range per fragment rather than equality?

---

### B4 — The delete path can destroy irreplaceable data, and nothing can restore it

Found by: 03-data (DAT-003), 05-ops (OPS-001), 04-k3s (K3S-015, K3S-016, K3S-001).
Three lenses, five findings, four separate mechanisms that compound.

Evidence, all verified.

1. **Order.** `spec/v1/examples/workflows/aggregator-deploy.yml` runs "Prune what
   left the render" (step 5) *before* "Server-side apply in DAG order" (step 6).
   Flux applies then prunes; this inverts it. A rename, a claim moving between
   Workloads, or a Service reassigned between Aggregators presents as
   delete-then-create — and if the apply then fails (a field-ownership conflict
   "fails this step" by design, or the 20-minute job timeout expires) the old
   object is gone and the new one was never written.
2. **Scope.** `spec/v1/examples/rendered/deployer-rbac.yaml:29-30` grants
   `delete` on `persistentvolumeclaims` with no `resourceNames`. `--confirm-deletions`
   is a non-interactive CI flag, not a confirmation.
3. **No durability gate.** `grep -rniE 'durability|reconstructible|irreplaceable'
   src/ schemas/` returns **0 hits**. The field ADR-0008 introduced specifically
   to replace an "inert attestation" is, today, exactly as inert as the
   `rollbackTargetRetention` it condemned. Nothing makes `durability` gate a delete.
4. **Nothing restores.** ADR-0008:41-43 records `local-path` with no CSI snapshot
   support; every fixture has exactly one `k3s-control-plane` host; a repo-wide
   grep for `restore`, `RPO`, `RTO` finds nothing; `spec/v1/60-setup.md`'s
   pre-flight checklist has seven items and rehearses only a break-glass *rollback*,
   which re-applies a lock and restores no data.
5. **The inventory misses the dangerous kinds.** `spec/v1/50-lifecycle.md:105`
   shows the previous set as a bare `kubectl get -l deployer=<agg>`, which returns
   the default resource set and enumerates no CRDs and no PVCs. So `IngressRoute`
   and `VaultStaticSecret` are never pruned (a withdrawn hostname stays served),
   while PVCs *are* deletable by the Role. The inventory is wrong in both directions.

The worked example that ties it together: `knowledge-vault-clone` is declared
`durability: irreplaceable` on `local-path`, and it is a personal knowledge vault.

**Decision needed:** apply before prune or not; what refuses to cross a durability
class; whether the inventory enumerates the kinds the adapters render; and what
the rehearsed restore is, with an RPO, before the first production apply of an
`irreplaceable` volume.

---

### B5 — Two complete renderer generations coexist, and the adoption schedule is costed against neither

Found by: 02-patterns (PAT-002, PAT-003), 06-redteam (RED-009). Independently
confirmed by me, and it invalidates a third reviewer's framing (see Contradictions).

Evidence, verified directly.

- `grep -rn "render/" src/` outside `src/deployment/render/` returns **nothing**.
  The entire 14-module, ~1,967-line tree is imported by no `src/` file and is
  reachable from neither `src/index.ts` nor `src/cli.ts`. Only test files import it.
- `package.json:50` runs `c8 --all --include "dist/src/**/*.js" --check-coverage
  --lines 90`, so those unreachable lines count toward the 90% bar gating every PR.
  Dead code is satisfying the quality gate.
- The registered generation is worse-typed: `src/adapters/kubernetes.ts:1` is
  `// @ts-nocheck`, and 10 files across `src/` carry `@ts-nocheck` while
  `tsconfig.json` sets `"strict": true` and `eslint.config.js` sets
  `ban-ts-comment: "off"`.
- **The coverage table is wrong.** `spec/v1/30-deliverables.md:85` records
  `PodDisruptionBudget` 6 objects as *"no adapter, no renderer"* and ServiceMonitor
  11 as *"exists but is not a registered adapter"*. But the registered `kubernetes`
  adapter (`src/adapters/registry.ts:94`) emits `pdb.yaml`, `servicemonitor.yaml`
  and `podmonitor.yaml` (`src/adapters/kubernetes.ts:44-62`) and builds a PDB at
  `:380-388`. Both rows are false.

Consequence. `spec/v1/00-overview.md` open item 8 and `spec/v1/60-setup.md` step 6
sequence v1 adoption off "36 objects, 22 need writing, 14 need only registering".
That arithmetic does not match the registry. And the "cheaper half" — registering
`prometheus` and `networking` — is not cheaper: those renderers consume
`ProjectModel` while the registry hands adapters an `AdapterContext` carrying raw
artifact documents, so registering them is a port across the seam, i.e. the same
work as writing `rbac` from scratch. The first act of the new `availability` and
`prometheus` adapters would be to collide with the incumbent on `pdb.yaml` and
`servicemonitor.yaml` — the path collision chapter 30 makes a build error and
which `grep -rn E_PATH_COLLISION src/` shows is implemented nowhere.

**Decision needed:** which generation is v1. Delete the other. Then re-derive the
coverage table from the registry rather than from the cluster tree, and re-sequence
chapter 60 against the corrected number.

---

### B6 — No securityContext and no resource requests are rendered by either generation, and layer 1 has no vocabulary to add them

Found by: 04-k3s (K3S-003). One reviewer only — promoted to Blocker because it is
the one class of defect that cannot be corrected from the platform side later.

Evidence, verified. `grep -rniE 'securityContext|runAsNonRoot|readOnlyRootFilesystem|
allowPrivilegeEscalation|seccompProfile' src/ schemas/` returns **0 hits**. This
grep spans *both* renderer generations, so B5 does not rescue it. `resources` is
emitted only when the model already carries it, and `size` — the field that would
supply it — is `<<proposed>>` and ungraded (`spec/v1/00-overview.md` open item 7).

Why it is a Blocker and not a Major. On a single node the k3s server process, the
datastore, the in-cluster deploy runner and every application pod share one kernel
with no reservation between them; the standing QoS class for the estate is
BestEffort. The security half is worse to fix late: a hardening class is a layer-1
field, layer 1 is authored by hand in ~30 separate repositories, and retrofitting
is thirty pull requests plus a coordinated image rebuild. Every week this is
deferred it gets more expensive, and it is the only finding in this set with that
property.

**Decision needed:** grade `size` and add a pod-hardening class to layer 1 before
the first production apply, or state explicitly that the estate accepts BestEffort
and root-by-default and record it as an accepted risk with an owner.

---

### B7 — v1 makes secret handling worse than v0 until an unowned prerequisite lands, and the blast-radius model it ships cannot be enforced by the store

Found by: 06-redteam (RED-007), 01-adr (ADR-013, ADR-004, ADR-009), 03-data
(DAT-002, DAT-004, DAT-009, DAT-010). Four lenses.

Evidence, all verified.

- **The regression.** ADR-0005:145-149 — `delivery: env` and `delivery: file`
  *"require Kubernetes secrets-at-rest encryption before they ship. No
  `--secrets-encryption` configuration exists in `nix-config` or the bootstrap
  tree"* — and, in the same bullet, *"the agent-inject path being replaced never
  touches etcd"*. So shipping ADR-0005 without the prerequisite is a security
  regression against what runs today, not merely an unmet goal. The ADR closes
  the item with *"This is its own decision and its own work item"* — naming no
  owner, no ADR number, no date. `00-overview.md:158-161` repeats it as open item
  2 with the same absence. `delivery: env` is what chapter 10 and every worked
  example except `auth-api` use.
- **The key scoping cannot be enforced.** `spec/v1/16-dependencies.md:287` claims
  the derived policy grants *"`read` on the granted path and keys only"*.
  ADR-0005:76-79 establishes the opposite in its own `self-roll` argument:
  *"`-method=patch` … allows [it] without read access to the other keys in this
  document. A read/modify/write fallback would need `read` on the Discord webhook
  and Grafana client secret too."* KV-v2 `read` is per-path, over the whole
  document — which is exactly why `patch` was chosen. Three worked examples grant
  different key subsets of `secret/data/platform/postgres`; every one of those
  readers holds `read` on all of them. `knowledge`'s pod can read `auth-api`'s
  database password, and `E_ROLL_AFFECTS_OTHER_READERS` under-reports by the
  difference between the declared key set and the document.
- **The two-level model is a documentation boundary, not an access boundary.**
  `spec/v1/16-dependencies.md:122` derives the ServiceAccount from `id` — a Service
  field. I verified the implementation agrees: `src/adapters/kubernetes.ts:665-669`
  returns `serviceName`, one SA per Service. Two Workloads of one Service therefore
  authenticate as the same Vault principal and receive the union of both policies,
  regardless of which level the grant was declared at. (This upgrades DAT-004 from
  *Likely* to *Certain* — the reviewer flagged this as the assumption they could
  not check.)
- **The join key is unspecified.** Grants are written `secret/data/platform/postgres`;
  placeholders are written `${secret:platform/postgres#kb.user}`. The transform is
  stated nowhere, and it does not generalise — `auth-api.service.yml:50` grants
  `transit/keys/auth-api-jwt`, which has no `data/` segment. `E_UNAUTHORISED_SECRET_REFERENCE`
  can therefore be satisfied by the wrong grant.
- **A wildcard is in the normative example.** `spec/v1/examples/auth-api.service.yml:38-39`
  carries `keys: ['*']`, which appears in no field table and no invariant, and makes
  the reader set undecidable without reading live Vault contents — which the purity
  rule forbids.
- **Transport.** Two different default Vault addresses exist in the tree
  (`vault.vault-system` and `vault.data-system`), both `http`.

**Decision needed:** who owns secrets-at-rest and by when; whether the grant unit
is the path (making `keys:` documentation, stated as such) or the Secret Subtree
splits one path per grantable key set; and whether the second declaration level is
an access boundary — in which case the identity must be per Workload too.

---

### B8 — The class A / class B boundary is described as a safety property while class B has no pinning discipline at all

Found by: 04-k3s (K3S-002, K3S-008), 05-ops (OPS-014, OPS-015, OPS-018, OPS-020).

Evidence, verified. `src/adapters/flux-utils.ts` sets `"*"` as the chart version
default for **cert-manager, external-dns, both Traefiks, MetalLB, VSO, RabbitMQ
and the observability stack** (lines 615, 624, 640, 662, 677, 689, 769, 825, 836,
854 …). A Flux `HelmRelease` with `version: "*"` resolves to the newest chart on
each reconcile, at a `1h` interval. This is the foundation
`spec/v1/50-lifecycle.md:41-47` deliberately excludes from the aggregator gate,
so nothing tests it. Alongside:

- `traefik-public/release.yaml` renders `replicas: 1` with `maxSurge: 0` and
  `hostPort: 80/443` — a structural outage window on every chart bump, on the
  single component fronting all public TLS, while ADR-0008 documents `maxSurge: 1,
  maxUnavailable: 0` as the estate's hard-won zero-downtime pattern for everything
  behind it.
- `spec/v1/examples/platform-postgres.service.yml:34-35` pins the database eight
  Services depend on to `pgvector/pgvector:pg17`, a mutable tag, with a comment
  saying it bypasses the lock — while `30-deliverables.md:224` makes a floating tag
  `E_FLOATING_IMAGE`.
- `spec/v1/examples/rendered/reapply-cronjob.yaml:34` renders
  `deploy-config-schema:1.0.0`, a mutable tag, into a Deliverable — the same
  violation, in an example of the guard's own output.
- Both production-touching workflows invoke bare `npx deploy-config-schema`, which
  resolves from the registry at invocation time, while `service-publish-fragment.yml`
  goes to deliberate trouble to install an exact version. The two paths that touch
  production are the two that do not pin.
- The in-cluster runner holding the deploy ServiceAccount runs `actions/checkout@v4`
  and `oras-project/setup-oras@v1`, floating tags. This repository's own CI
  (`.github/workflows/ci.yml:51`) pipes a script from a third-party repo's `main`
  branch into `bash`.

**Decision needed:** either class B gets the same pinning discipline as class A, or
the class A/class B split stops being described as a safety property. Separately,
the chart pinning is a live defect today, independent of every v1 decision.

---

### B9 — Both stated justifications for using Kubernetes at all fail as designed

Found by: 04-k3s (the framing section, plus K3S-013), 03-data (DAT-008, DAT-005).
No single reviewer could see this; it emerges from combining them.

04-k3s does the most valuable thing in the whole set: it argues the estate uses
none of Kubernetes's properties (no rescheduling — `local-path` pins every stateful
workload to a node by construction; no HA — one control-plane host in every fixture;
no horizontal scale — `auth-api`'s two replicas are documented as a capacity
decision on one node), and then names the exactly two things that *do* justify it:

1. the API server as the authorisation boundary — *"a workflow that tries to apply
   a Service it does not own receives a 403"* (`50-lifecycle.md:200`);
2. server-side apply field ownership as the drift mechanism (`:151`).

Two other reviewers then independently show both fail.

- **(1) fails.** The generated Role is namespace-scoped with `create/patch/delete`
  on every kind and no `resourceNames`. `aliases.namespace` exists specifically to
  let two Services share a namespace, and chapter 20's own catalogue puts
  `home-portal` in `app-system` — which `deployer-rbac.yaml`'s header lists as a
  namespace this Aggregator gets a Role in. `E_MULTIPLE_DEPLOYERS` is a per-Service
  CI check and does not see this. Worse, `create`/`patch` on `deployments` and on
  `vaultstaticsecrets` are each sufficient to read every Secret in the namespace,
  so withholding `secrets` verbs reads as a control and is not one.
- **(2) fails between the two writers most likely to collide.** The merge deploy
  and the hourly CronJob deliberately share the field-manager name
  `auth-federation` (`aggregator-deploy.yml:103`, `reapply-cronjob.yaml:52`), so
  server-side apply cannot report a conflict between them. `concurrencyPolicy:
  Forbid` serialises the CronJob against itself and the workflow `concurrency`
  group serialises the deploy against itself; nothing serialises the two against
  each other.

**Decision needed:** if deploy authority is the reason for Kubernetes, it needs
one namespace per deployer or admission control rather than RBAC alone; and the
two appliers need distinct field managers plus a lease, or the drift property is
not the one being claimed.

---

## Contradictions

Where two reviewers reach opposite conclusions. Where the evidence settles it, I
say so; where it does not, the tiebreaker is named.

### X1 — Is `src/deployment/render/` the live renderer, or dead code? **Settled: dead.**

- **04-k3s** states as a methodological premise: *"`src/adapters/kubernetes.ts`
  (26 KB) — read only the four regions grep flagged, because `src/deployment/render/`
  is the live renderer path."* Eleven of its twenty-two findings target files in
  that tree.
- **02-patterns (PAT-002)** states: *"A reachability walk from `src/index.ts` and
  `src/cli.ts` shows the **entire** `src/deployment/render/` tree — 14 modules,
  1,967 lines — is reachable from neither entry point."*

Differing assumption: 04-k3s assumed presence under `src/` implies participation in
the render path; 02-patterns built an import graph.

**The evidence settles it in 02-patterns' favour.** I ran it:
`grep -rn "render/" src/` outside that directory returns nothing at all, and
`src/adapters/registry.ts` registers 16 adapters, none from that tree.

Consequence, and it is not "discard those findings". Chapter 30 explicitly plans to
register `networking` and `prometheus` *from this tree*. So K3S-005 (every egress
policy blocks DNS), K3S-006 (ingress admits the edge namespace but not Prometheus),
K3S-010 (`maxUnavailable` means both "roll with no gap" and "never drain"), K3S-011
(the RWO→`Recreate` derivation is authored, not derived), K3S-012 (progress deadline
equals the startup budget), K3S-014 (hook Jobs immutable, `backoffLimit: 0`, no TTL),
K3S-018 (sidecars lose ports, mounts, probes), K3S-020 (`ScheduleAnyway`), K3S-021
(HPA fighting `spec.replicas`) are all **verified as written** and are all defects
in code the plan intends to promote. They are *not* statements about current
production behaviour, and their severities drop from "the estate is doing this" to
"this is what registering these adapters would ship". They become blocking again
the moment B5 resolves toward this tree.

Two survive at full strength: **K3S-003** (the securityContext/resources grep spans
both generations — 0 hits either way) and the `flux-utils.ts` half of **K3S-009**
(a registered adapter).

### X2 — Is the coverage gap 36 objects? **Settled: no.**

- **spec/v1/30-deliverables.md:85** (the design): `PodDisruptionBudget` 6 —
  *"no adapter, no renderer"*; ServiceMonitor 11 — *"exists but is not a registered
  adapter"*.
- **06-redteam (RED-009)**: the registered `kubernetes` adapter already emits both.

Verified: `src/adapters/kubernetes.ts:44-62` pushes `pdb.yaml`,
`servicemonitor.yaml`, `podmonitor.yaml`; `:380-388` builds the PDB. Chapter 30's
table is wrong on two of its four rows, and chapter 60's bootstrap step 6 is
sequenced off it.

Cheapest check: `adapterContract()` is already exported and already enumerates the
registry. Diff its output against chapter 30's table.

### X3 — Severity of the default-deny audit-mode gap: Blocker or Major?

- **01-adr (ADR-002)**: Blocker — the entire mitigation for the largest security
  change rests on a capability the ADR never establishes exists.
- **04-k3s (K3S-004)** and **05-ops (OPS-017)**: Major — one workstream blocked.

The *evidence* is identical and I verified it: `networking.k8s.io/v1` NetworkPolicy
has no audit mode; a repo-wide grep for `cilium|calico|kube-router|flannel` returns
zero hits outside the reviewers' own files; no ADR picks a CNI.

Differing assumption: whether an unsatisfiable item on the pre-flight checklist
blocks v1 or blocks one feature. `spec/v1/60-setup.md:153` makes
*"default-deny NetworkPolicy is in **audit** mode, not enforce"* a hard precondition
for the first production apply. On that reading 01-adr is right: the checklist
contains an item that can never be ticked, so either it is quietly ignored — and
default-deny lands as enforce across ~30 workloads on a cluster the ADR itself says
"is known to contain undeclared paths" — or nothing ships.

Tiebreaker, one command: `kubectl get ds -n kube-system -o name | grep -Ei 'cilium|calico'`.
Empty confirms no audit mode exists on the stack, and the finding is a Blocker on
`60-setup.md`. Non-empty collapses it to an unstated dependency (Minor).

### X4 — Is the env file per Service or per Workload? **Settled by the documents; the enforcement question is not.**

- **ADR-0005:11-12** and **ADR-0007:20** (`# services/knowledge/platform/env/base.env`):
  per Service.
- **spec/v1/10-service-intent.md:25 and :268** (*"Env files are **per Workload**"*)
  and the example set (`knowledge-api.base.env`, `knowledge-ingest-worker.base.env`):
  per Workload.

Both verified. The ADRs are wrong and the spec carries the correction implicitly.

The reviewers approach it from opposite ends and both are right, which is why this
matters more than a documentation fix. **01-adr (ADR-004)** points out the ADRs'
scoping breaks the dead-grant and unauthorised-reference joins — the only two checks
standing between a `secrets` list and an unauthorised read. **03-data (DAT-004)**
points out that even the spec's per-Workload declaration is unenforceable, because
the ServiceAccount is per Service. So the design has a Workload-level declaration,
a Service-level identity, and two documents disagreeing about which file holds the
binding. Not settled, and the tiebreaker is a render: emit a Service with two
Workloads holding different grants and inspect how many ServiceAccounts and how
many Vault roles come out.

### X5 — Where does the composed-lock pin live? The design contradicts itself.

No reviewer disagreement, but the *sources* disagree, and 05-ops (OPS-002) caught it:

- `spec/v1/examples/renovate.json:8` — `"managerFilePatterns": ["/^aggregator\\.yml$/"]`
- `spec/v1/60-setup.md:60` — `aggregator.yml` carries "the composed-lock pin"
- `aggregator-gate.yml:38` and `aggregator-deploy.yml:61` — both read
  `yq -r '.pins.composedLock' pins.yml`
- `aggregator-gate.yml:15` paths filter — `['pins.yml', …]`;
  `aggregator-deploy.yml:20` trigger — `paths: ['pins.yml']`

All verified. Built as specified, a Renovate bump touches a file no workflow reads,
triggers no gate, and on merge triggers no deploy. Every workflow reports success and
the estate stops moving. This is one edit, but it is the third instance (with
DAT-013 and K3S-022) of the same root cause: **nothing in this repository executes or
validates the specification's own worked examples.**

### X6 — Does the red team moot the ops and data findings?

- **06-redteam** implies the delivery model may be unnecessary (RED-001) and the
  distributed artefact-resolution problem self-inflicted (RED-004: one declarations
  directory removes OCI publication, `lockChain`, `participants.yml`, `maxAge`,
  `dormant`, `E_PARTICIPANT_MISSING`, `E_PARTICIPANT_STALE` and the
  silently-failed-publish deletion class outright, because a directory cannot fail
  to publish).
- **03-data and 05-ops** treat both as given and detail ~25 defects inside them.

Differing assumption: whether the estate is heading toward multiple repositories,
owners and clusters, or is and will remain one person, one cluster, ~30 services.
RED-006 checks the second half — `git shortlog --all` shows one human across three
identities plus bots.

Not settled, and it should not be settled by me. The tiebreaker is the author's, and
it is a scope question, not a technical one. But **B1's experiment is the cheap part
of it**: writing one caller and timing one full-estate vcluster apply (RED-005) costs
an afternoon and a measurement, and it constrains the answer either way.

---

## Root-cause clusters

103 findings (01: 17, 02: 15, 03: 15, 04: 22, 05: 21, 06: 13) collapse into **14
clusters**. Collapse ratio **7.4 : 1**; roughly 96% of findings sit in a cluster with
at least one other finding, with only three or four genuine singletons.

> **This is well over three quarters, so the flag the brief asked for applies: the
> six lenses overlap heavily and the prompt set needs redrawing.** Lenses 3 (data),
> 4 (k3s) and 5 (ops) converged on the same delivery-mechanism surface from three
> directions and produced ~30 near-duplicate findings; lens 1 (ADR) and lens 6
> (red team) were the only two that reached distinct conclusions the others could
> not. A redraw should keep the ADR-integrity and adversarial lenses, merge
> data/ops/k3s into one delivery lens, and add the one lens nobody had: an
> implementation-versus-specification reconciliation lens, which is where the
> single most consequential finding (B5) came from by accident.

| # | Underlying decision | Findings it explains | One change closes all? |
|---|---|---|---|
| C1 | One version number means both the data model and the package build, and composition asserts equality fail-closed | DAT-001, PAT-010, RED-003, ADR-011, DAT-013 | **Yes** — separate the artefact schema version from the package version and make the per-fragment check a range. OPS-009 (no per-participant bypass) is adjacent but separate. |
| C2 | Delivery is push with a label-query inventory and prune-before-apply | DAT-003, OPS-001, K3S-015, DAT-008, K3S-013, OPS-011, ADR-008 (reversibility), PAT-005, PAT-007 | No — three changes: apply-before-prune, an inventory over rendered kinds, and a durability refusal. All three are moot if B1 resolves against ADR-0019. |
| C3 | Layer 2 is declared pure and reads observed cluster state | RED-002, DAT-006, DAT-007, PAT-015, ch10:463 vs ch20:266 | **Yes** — one decision (pure, or consumes a pinned ClusterState) settles all of them. |
| C4 | Invariants are asserted at boundaries the data model does not cross, or with thresholds written as adjectives | PAT-011, PAT-005, PAT-006, K3S-016, ADR-010, OPS-019, RED-012 | No — but a single rule ("if an invariant reads a property, that property is a field of the artefact, with a number on it") would catch the whole class. |
| C5 | Two renderer generations were never reconciled, and the spec measures the wrong one | PAT-002, PAT-003, RED-009, PAT-014, and the premise of 9 K3S findings | **Yes** — pick one, delete the other, re-derive the tables from the registry. |
| C6 | Secrets are modelled per key over a per-document store, with a two-level declaration over a one-level identity | DAT-002, DAT-004, DAT-009, DAT-010, ADR-004, ADR-009, ADR-013, RED-007, K3S-019 | No — three decisions: grant unit, identity granularity, secrets-at-rest ownership. |
| C7 | Class B is exempted from every discipline class A gets, and called a safety boundary | K3S-002, K3S-008, OPS-014, OPS-015, OPS-018, OPS-020, K3S-017 | **Nearly** — applying class A's pinning rule to class B closes six of seven. |
| C8 | ADRs were written as a growing draft with no acceptance criterion, no reversibility section, and two colliding numbering spaces | ADR-001, 003, 005, 006, 007, 008, 012, 014, 015, 016, 017 | No — but one template plus one lint closes the recurrence. |
| C9 | The delivery machinery is not a first-class monitored subject, so its failure mode is silence | OPS-003, 005, 006, 007, 008, 012, 013, DAT-005, DAT-014, K3S-001, K3S-017 | No — it needs an owner, an Alert Class, a restore, and runbooks. Largely moot if B1 resolves against ADR-0019. |
| C10 | Default-deny was decided before the CNI | ADR-002, K3S-004, OPS-017 | **Yes** — one CNI decision. |
| C11 | The design is scaled for an organisation and an estate that do not exist | RED-001, 004, 005, 006, 010, 011, 013, OPS-016, and 04-k3s's framing section | No — this is a scope decision, not a change. |
| C12 | No module boundary is expressed anywhere, so the toolkit's seams erode freely | PAT-001, 004, 007, 008, 009, 012, 013 | **Nearly** — one acyclicity + reachability check in CI, plus splitting the adapter port, closes most. |
| C13 | Manifest rendering has never been validated against an API server | K3S-003, 005, 006, 009, 010, 011, 012, 014, 018, 020, 021, 022 | **Yes, for detection** — a `kubeconform` + `--dry-run=server` + `kube-score` gate catches this entire class permanently. |
| C14 | Nothing executes or validates the specification's own worked examples | OPS-002, DAT-011, DAT-012, DAT-013, K3S-022 | **Yes, for detection** — lint the examples the way the toolkit's output is linted. |

Singletons not in a cluster: ADR-017 (`cluster-state.layer` left required),
OPS-021 (quarantine registry, speculative), K3S-007 (ServiceLB, unresolvable here).

---

## Rejected findings

Each with the specific reason the evidence failed.

**R1 — 04-k3s's framing premise, and the current-behaviour claim in nine of its
findings.** The review states *"`src/deployment/render/` is the live renderer path"*
and reasons throughout as if the rendered manifests it describes are what the estate
runs. Verified false: `grep -rn "render/" src/` outside that directory returns
nothing; the tree is imported only by tests. The *defects* are real and verified
individually (I re-checked `workloads.ts:56`, `:291-302`, `:434-443`, `:364-371`,
`hooks.ts:37-59`, `networkpolicy.ts:40-105` — every quotation is accurate). What is
rejected is the claim that they describe shipped behaviour, and the severities that
followed from it. They are latent defects in code chapter 30 proposes to register.

**R2 — K3S-013's and DAT-008's evidence that "this very file shows two Services
resolving to a shared namespace."** `spec/v1/examples/rendered/deployer-rbac.yaml`
renders a Role in `auth-system` only. The two-namespace claim rests on a header
*comment* (`deploys: [auth-api, auth-ui] -> namespaces auth-system, app-system`)
plus chapter 20's alias catalogue, not on a rendered second Role. The design
conclusion survives on those two sources — but the cited file does not show what
both reviewers say it shows. Separately, neither reviewer noticed that the example
is *itself* inconsistent: it declares two namespaces and renders one Role, which is
a defect in the worked example that belongs in cluster C14.

**R3 — RED-013's cost estimate (400–900 hours, 6–12 months).** The *finding* —
"nineteen ADRs and eight chapters contain no build estimate, no budget and no
schedule" — is verified and stands. The number is the reviewer's own arithmetic,
self-marked Speculative, and nothing in the repository corroborates it. Rejected as
a finding; retained as Open Question 10.

**R4 — DAT-014 (nothing retains superseded composed locks).** Self-marked
Speculative and explicitly conditional on GHCR package settings that are not in this
repository. Neither confirmable nor refutable here. Moved to **Verify with tools**.

**R5 — OPS-021 (quarantine can silently remove a relationship gate).** Self-marked
Speculative; depends entirely on `deploy-harness/rerun-policy.mjs` and
`quarantine.mjs` in `tests/stack-integration-tests`, which is not present. Moved to
Open Questions.

**R6 — K3S-007's conclusion (ServiceLB/klipper collides with MetalLB and Traefik's
hostPort).** The repo-level half is verified: nothing here disables ServiceLB, and
there is no k3s server configuration in this repository at all. But the conclusion
turns on flags in `nix-config`, which is unreadable from here. Rejected as an
asserted defect. What survives, and is the better finding: **k3s server flags are
load-bearing platform facts with no home in `platform.schema.json`** — the same gap
as the datastore and the server count.

**R7 — 01-adr's ADR-014 (three load-bearing choices have no ADR), rated Major.**
The reviewer states the caveat themselves: *"if these are recorded in the workspace
repo, this reduces to the ADR-005 numbering problem."* I cannot read that repository
either. Downgraded to Minor pending one check of the workspace ADR index — but note
that the inability to check it *is* ADR-005's finding, so this reduces to that one
rather than disappearing.

**R8 — the severity spread on default-deny (Blocker in 01-adr, Major in 04-k3s and
05-ops).** Rejecting the spread, not the finding. See X3; on the evidence it is
Blocker-for-`60-setup.md`, and one command decides it.

**Not rejected, despite a process flag.** `review/00-inventory.md` records that lens
2 substituted `codebase-design` after its named skills were unavailable, against
instruction, and asks that its output be weighed accordingly. I checked PAT-001,
PAT-002, PAT-005, PAT-006, PAT-009, PAT-010 and PAT-013 against source individually:
every quotation is exact and every conclusion holds. PAT-002 is the single most
consequential finding in the entire set. No discount applied.

---

## ADR actions

Naming what needs work; writing none of it.

### Amend — with the section

| ADR | Section | What must change |
|---|---|---|
| **0003** | *"Under this rule"* field list (lines 27-30) | It is contradicted in four places by later documents: co-test sets (ADR-0014:8), health paths (ADR-0010:8-11), migration strategy vs rollout derivation (ADR-0008:33-34), and hostnames (`00-overview.md` open item 1: *"Chapter 20 corrects ADR-0003"*). This is the rule every other ADR applies; regenerate the list from the later decisions or delete it and hold it in one place. |
| **0005** | Opening statement; the tier table; Consequences bullet 4 | (a) The env file is per Workload, not "the Service's env file"; (b) four tiers × three deliveries is twelve cells and only a rotation constraint is ruled out — the illegal cells (`custody`+`env`, `custody`+`file`, `self-renew`+`env`) need marking; (c) *"There is no Workload-name join key"* is false under per-Workload env files, and it is the sentence the safety argument rests on. |
| **0007** | The worked example path (line 20) | `# services/knowledge/platform/env/base.env` must carry the `<workload>` segment the spec and the examples use. |
| **0008** | Storage paragraph; Durability Class paragraph | (a) The two `ADR-0011` references — one qualified "in the workspace", one bare at line 64 — resolve to a local ADR about network policy; (b) the Durability derivation renders nothing (0 grep hits across `src/` and `schemas/`), so it currently meets the ADR's own definition of the inert attestation it replaced. Say it is proposed. |
| **0011** | Consequences bullet 1 | Audit mode is not a capability of `networking.k8s.io/v1` or of k3s's bundled controller, and no CNI is chosen anywhere. State the dependency or replace the mitigation. |
| **0013** | Rationale (lines 31-32) and Consequences | "Chosen because there is nothing to build" is contradicted three lines later by a gate that must be built plus two manual steps; and the ADR reasons about per-repo skew while chapter 40 turns that skew into estate-wide unavailability — an amplification the ADR never names. |
| **0014** | *Why*, the sentence citing ADR-0005 | ADR-0005 contains no provider-enumerates-consumers rejection; its only rejected alternative is a `SecretAccess` document keyed by Workload name. State the argument or drop the citation. |
| **0015** | Consequences, the `E_PARTICIPANT_STALE` bullet | "A staleness bound" needs a number and a unit. It is the error standing between a missed publish and a deletion. |
| **0016** | Consequences | The adapter-totality gap is counted from the cluster tree and does not match the registry (see B5/X2). Re-derive it from `adapterContract()`. |
| **0019** | Consequences | The quotation attributed to ADR-0015's rationale does not appear in ADR-0015 (its wording is *"no repository needs a merge before a change takes effect"*). And the ADR needs a reversibility paragraph: the point past which reconstructing Flux Kustomization inventories for 364 objects is the undo cost. |
| **0001** | Status / a new supersession note | It is the only `Accepted` ADR, the only one absent from the register at `00-overview.md:63-82`, and it rejects registry distribution on a premise ADR-0015 abandons. Either a supersession pointer or an explicit statement of why packs are exempt from OCI. |
| **0006** | The removal sentence | Name the layer `platform.layer` is removed from, and state what `cluster-state.layer` becomes — `schemas/cluster-state.schema.json` still lists it in `required`. |
| **0018** | Consequences | The accepted cost (overrides cannot be enumerated) disables chapter 16's out-degree-zero property on the one surface most likely to accumulate dead declarations. |
| **all 0002–0019** | Frontmatter | Nothing records what acceptance requires, who grants it, or what `proposed` blocks. Today it is inert, while the spec it justifies is merging as normative. |

### Supersede rather than amend

- **ADR-0003** if the field list is the decision rather than an illustration. An
  authority *rule* and an authority *table* have different lifetimes; the table has
  already drifted four times.
- **ADR-0019** — it decides four separately-reversible things (push delivery;
  label-based pruning; the in-cluster CronJob; break-glass). Label-based pruning can
  fail on its own merits without push delivery being wrong, and today there is no
  unit of reversal smaller than the whole ADR, which four later documents cite as
  settled. Split it.
- **ADR-0005** — same shape: two-level declaration, a tier vocabulary, a delivery
  vocabulary, and a five-rule validation set, bundled.

### New ADRs — working title and the single question each must answer

1. **"CNI selection and the network-policy enforcement path"** — *Which CNI does
   this cluster run, and does it offer a non-enforcing policy stage?* Must precede
   ADR-0011 and unblocks `60-setup.md:153`.
2. **"Kubernetes secrets-at-rest encryption"** — *Who owns enabling it, by when, and
   what refuses `delivery: env`/`file` until the cluster advertises it?* ADR-0005
   calls this "its own decision and its own work item" and names nobody.
3. **"The artefact schema version is not the package version"** — *What versions the
   data model, and what compatibility range does composition accept per fragment?*
4. **"Layer 2 and observed cluster state"** — *Is `ResolvedDeployment` pure, or does
   it consume a pinned `ClusterState` with its own digest?*
5. **"The adapter port and the render seam"** — *Which of the two renderer
   generations is v1, and what typed contract does an adapter satisfy?*
6. **"Delete authority and durability"** — *What refuses to delete a claim backing
   non-`reconstructible` data, and in which order do apply and prune run?*
7. **"Datastore, control-plane count, and restore"** — *What is the datastore, how
   many servers, and what is the rehearsed restore with a stated RPO?* None of the
   three is expressible in any schema today.
8. **"Pod security and resource class"** — *What layer-1 vocabulary carries
   `securityContext` and requests/limits, and when does it become mandatory?*
9. **"vcluster as test substrate"** — *Where do vclusters run, and what is the
   measured wall time and memory of one full-estate apply?* ADR-0019 makes every
   deploy conditional on this and it is decided nowhere.
10. **"The delivery machinery's own observability"** — *What Alert Class and owner do
    the CronJob, the gate, composition and the deploy job have?* ADR-0012 derives
    routing from fields only Services carry.
11. **"v1 scope, budget and stopping rule"** — *Which third of this is independently
    useful if the rest never lands?*

Also undecided anywhere, and named by 01-adr as structural: the adapter/fragment
architecture itself (treated as given by ADR-0016) and the Zod-to-JSON-Schema
generation pipeline (the mechanism ADR-0013's lockstep versions). If these live in
the `workspace` repo, `docs/adr/` needs an index saying so — which it also lacks,
along with a single file format (0001 uses a `## Status` heading; 0002–0019 use
frontmatter).

---

## Verify with tools

Carried from agent 4 intact, plus additions. Agent 4's reasoning about apiVersions,
schemas and policy compliance is explicitly **not treated as settled** — note in
particular its own honest finding that *"the API versions in use are all current and
none is deprecated… there is no API-drift finding to report and I am not inventing
one."* That restraint is worth keeping.

### From agent 4 (verbatim intent, one command per finding)

| finding | invocation |
|---|---|
| K3S-001 | `kubectl get nodes -l node-role.kubernetes.io/control-plane -o name \| wc -l`; on the server host `sudo ls -la /var/lib/rancher/k3s/server/db/` — `state.db` versus `etcd/` settles the datastore; then `sudo k3s etcd-snapshot ls` (errors on SQLite). |
| K3S-002 | `flux get helmreleases -A -o wide` and `helm ls -A -o json \| jq -r '.[] \| "\(.name) \(.chart)"'`; plus `grep -rn 'CHART_VERSION' src/adapters/flux-utils.ts \| grep '"\*"' \| wc -l`. |
| K3S-003 | `npx deploy-config-schema render … --out /tmp/r && kube-score score /tmp/r/**/*.yaml`; then `kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.qosClass}{"\n"}{end}' \| sort -k2 \| uniq -c -f1`. |
| K3S-004 | `kubectl get daemonset -n kube-system -o name \| grep -Ei 'cilium\|calico'`; `k3s server --help \| grep -i 'disable-network-policy'`. |
| K3S-005 | `kubectl exec <pod> -- getent hosts kubernetes.default.svc.cluster.local` after applying the policy; statically, a `conftest` rule asserting every NetworkPolicy with `Egress` in `policyTypes` also matches UDP/53. |
| K3S-006 | `kubectl get --raw '/api/v1/namespaces/monitoring/services/prometheus:9090/proxy/api/v1/targets' \| jq '.data.activeTargets[] \| select(.health!="up") \| {scrapeUrl,lastError}'`. |
| K3S-007 | `kubectl get pods -n kube-system -l svccontroller.k3s.cattle.io/svcname -o wide`; `kubectl get svc -A --field-selector spec.type=LoadBalancer -o wide`; `cat /etc/rancher/k3s/config.yaml` for `disable:`. |
| K3S-008 | `helm template traefik traefik/traefik -f <pack values> \| kubeconform -strict -`, then read `.spec.strategy` and `.spec.replicas`. |
| K3S-009 | `kubectl get nodes --show-labels` versus `grep -rn 'personal-stack/\|platform.jorisjonkers.dev/' /tmp/r`; then `kubectl get pv -o custom-columns='NAME:.metadata.name,NODE:.spec.nodeAffinity…'`. |
| K3S-010 | `kubectl get pdb -A -o jsonpath='…{.spec.maxUnavailable}…'`, then `kubectl drain <node> --dry-run=server --ignore-daemonsets`. |
| K3S-011 | Render a workload with an RWO volume and no `strategy`, then `yq '.spec.strategy.type'`. A unit test is the durable form. |
| K3S-012 | `yq '.spec.progressDeadlineSeconds, .spec.template.spec.containers[0].startupProbe'` — compare `periodSeconds × failureThreshold` against the deadline. |
| K3S-013 | `kubectl auth can-i --as=system:serviceaccount:deploy-system:deployer-auth-federation -n app-system delete deployments` and `… create vaultstaticsecrets`. Both `yes` for a Service the aggregator does not deploy settles it. |
| K3S-014 | `kubectl apply --server-side --dry-run=server -f …pre-deploy-jobs.yaml` twice with the image changed between runs. |
| K3S-015 | `kubectl get ingressroutes,vaultstaticsecrets,servicemonitors,networkpolicies,pvc -A -l deploy.jorisjonkers.dev/deployer=<agg>` against the bare `kubectl get -l …` the spec shows. |
| K3S-016 | `grep -rniE 'durability\|reconstructible\|irreplaceable\|backup' src/ schemas/ \| wc -l` — zero settles it. **(Run: it is zero.)** |
| K3S-017 | `kubectl get cronjob -n deploy-system -o jsonpath='{.items[*].status.lastScheduleTime}'` against `date`; `yq '.spec.startingDeadlineSeconds'`. |
| K3S-018 | Render a workload with a sidecar declaring ports and mounts, then `yq '.spec.template.spec.containers[1]'`. |
| K3S-019 | `kubectl get svc -A \| grep -w vault` against both defaults; `kubectl get vaultconnection -A -o yaml \| yq '.items[].spec.address'`. |
| K3S-020/021/022 | One pass: `kubeconform -strict -summary -kubernetes-version <target> -schema-location default -schema-location '…CRDs-catalog…' fixtures/deployment/golden/ /tmp/r/`; then `kubectl apply --dry-run=server -R -f fixtures/deployment/golden/`; then `kube-score score /tmp/r/**/*.yaml`. |

### Added by this consolidation

| question | invocation | status |
|---|---|---|
| Is `src/deployment/render/` dead? | `grep -rn "render/" src/ \| grep -v '^src/deployment/render/'` | **Run — empty. Confirmed dead.** |
| Does the registry already emit PDB/ServiceMonitor? | `node -e "import('./dist/src/index.js').then(m=>console.log(JSON.stringify(m.adapterContract(),null,2)))"`, diffed against `spec/v1/30-deliverables.md:80-90` | **Partially run via source — chapter 30's table is wrong on 2 of 4 rows.** |
| Is the coverage gate satisfied by dead code? | `c8 report --reporter=text` and check which `dist/src/deployment/render/*` files carry coverage from tests only | Not run |
| Does the pin file disagree? | `grep -n 'pins.yml\|aggregator.yml' spec/v1/examples/workflows/*.yml spec/v1/examples/renovate.json spec/v1/60-setup.md` | **Run — it disagrees.** |
| Are the spec's own rendered examples applyable? | `kubeconform -strict spec/v1/examples/rendered/ && kubectl apply --dry-run=server -R -f spec/v1/examples/rendered/` | Not run |
| Does anything read the golden tree? | `grep -rn 'deployment/golden' test/ scripts/ .github/ package.json` | **Run — nothing does.** |
| Are there import cycles? | `npx madge --circular --extensions ts src/` | Not run (02-patterns reports four at directory level) |
| Are superseded composed locks retained? (DAT-014) | `gh api /user/packages/container/composed/versions --paginate \| jq '[.[] \| select(.metadata.container.tags==[])] \| length'` plus the org's package cleanup policy | Not run — this is the only way to settle it |
| Did the conformance tests ever catch a real divergence? (RED-010's cheap test) | `gh run list --workflow=<conformance> --status=failure --limit 100` across the estate, and a scan of incident history for anything traceable to a duplicated declaration | Not run — **this is the single highest-value check in the list**, because it tests the premise the whole design rests on |
| What does one full-estate vcluster apply cost? (RED-005) | Provision one vcluster, apply the composed estate, record wall time and peak memory | Not run — one number decides whether the gate is viable |
| Does writing the caller close the gap? (RED-001) | Add the missing workflow calling the two existing reusable workflows; observe whether tested ≠ deployed persists | Not run — **the B1 experiment** |

---

## Ordered plan

Sequenced by dependency, not by severity. Items 0 and 1 are independent of every
other decision and should start immediately.

**0. Run the two premise experiments.** Write the caller and run the 147 existing
tests against the existing pipeline (RED-001). Time one full-estate apply into one
vcluster (RED-005). Check whether either conformance test ever failed on a real
divergence (RED-010). *Why first:* costs an afternoon plus one measurement, and
constrains the scope of everything below. *Unblocks:* the decision on whether
ADR-0019's scope is justified, which determines whether ~35 findings need fixing
at all.

**1. In parallel, fix the two live defects that no v1 decision touches.** Pin every
`*_CHART_VERSION` (B8), and pin the actions and the `curl | bash` in this repo's own
CI (OPS-020). *Why here:* both are shipping today on the node that terminates all
public TLS and on the runner that publishes the toolkit. Neither waits on anything.

**2. Decide which renderer generation is v1 (B5), and delete the other.** *Why at
position 2:* attribution, `E_PATH_COLLISION`, the coverage table, chapter 30's
normative adapter set, chapter 60's step 6, and the standing of nine agent-4
findings all depend on it. *Unblocks:* 3, 8, and the whole of cluster C13.

**3. Re-derive the coverage table from `adapterContract()` (X2).** *Why here:*
needs 2. *Unblocks:* chapter 60's sequencing, which is currently costed against a
number matching neither generation.

**4. Decide the version model (B3).** *Why here:* independent of 0–3 and blocks
composition, the negative fixtures, Renovate, and every lock in the chain. Late
enough that the scope from 0 is known; early enough that nothing is authored against
the wrong shape.

**5. Decide purity (B2).** *Why here:* it is a one-sentence decision with wide
consequences, and every claim in chapters 20, 30 and 40 that mentions
reproducibility must be restated once it lands. Doing this after any of them are
implemented means rewriting them.

**6. Decide the delete path (B4) — order, durability gate, inventory kinds — plus
the restore and datastore facts.** *Why here:* only meaningful if 0 resolves in
favour of push delivery. The restore half is unconditional and should not wait.

**7. Secrets (B7):** an owner and date for secrets-at-rest; the grant-unit decision
(path or key); the identity-granularity decision; and the env-file scope fix in
ADR-0005 and ADR-0007. *Why here:* it gates `delivery: env`, which every worked
example uses, so nothing authored before this is safe to ship.

**8. Pod security and resource class (B6).** *Why here:* needs 2 (which renderer
carries it) but must land before the first production apply, because it is a layer-1
change across ~30 hand-authored repositories and gets strictly more expensive.

**9. The CNI decision (C10).** *Why here:* it blocks ADR-0011 and makes
`60-setup.md`'s checklist satisfiable. It can run in parallel from step 0 if someone
else owns it.

**10. ADR hygiene sweep (C8).** The 0003 field list, the four unresolvable citations,
the two numbering spaces, an acceptance criterion, reversibility paragraphs, an
index, one file format. *Why last among the decisions:* several of these amendments
are dictated by the outcomes of 2–9, and doing them first means doing them twice.

**11. Fix the worked examples (C14):** the pin file, `INPUTS_SHA`, the mutable
composition `vars`, the negative fixture's assertion, the golden tree. *Why last:*
cheap, but they will be rewritten by 2, 4 and 6 if done earlier.

### Checks worth automating, so CI catches this class next time

Ordered by how many findings each retires.

1. **Manifest validation over every rendered tree and every `spec/v1/examples/rendered/**`:**
   `kubeconform -strict` + `kubectl apply --dry-run=server` + `kube-score`, with
   `runAsNonRoot`, `readOnlyRootFilesystem` and missing requests/limits as errors.
   Retires cluster C13 (12 findings) as a class, permanently.
2. **Import-graph gate:** `madge --circular` plus an assertion that no module under
   `src/` is unreachable from an entry point. Would have caught B5 — the most
   consequential finding here — the day the second generation appeared, and retires
   most of C12.
3. **Lint the specification's own examples the way the toolkit's output is linted:**
   every file named by a workflow `paths:` filter must be a file some step reads;
   every rendered example passes `E_FLOATING_IMAGE`; every negative fixture asserts
   an *error code*, never a non-zero exit; fixture `schemaVersion` is generated, not
   literal. Retires cluster C14 (5 findings).
4. **Derive `adapter-compat` from `listAdapters()` and fail when they disagree.**
   Today a hardcoded literal's SHA-256 is a pinned input to `computeRenderHash`, and
   nothing keeps it honest (PAT-006). Also fail when `docs/adapters.md` or `README`
   names a command or adapter the CLI does not dispatch (PAT-014).
5. **A supply-chain gate:** no `"*"` chart version, no image reference without a
   digest in any rendered tree, no unpinned action in a workflow that runs
   in-cluster, no `curl | bash`. Retires most of C7.
6. **A `@ts-nocheck` budget that ratchets down and cannot increase** (10 files,
   4,944 lines today, including `cli.ts`, `validator.ts` and four registered
   adapters, under `"strict": true`).
7. **An ADR lint:** one file format; a citation resolver that fails on any
   cross-repository ADR reference lacking a repo qualifier; a required
   *Reversibility* section; and a required entry in the decision register.

---

## Open questions for the author

1. Has anyone written the caller and run the 147 existing tests against the existing
   Flux pipeline? If that closes the "tested combination ≠ deployed combination" gap,
   what does ADR-0019's remaining scope buy that its relationship-ownership half does
   not?
2. Which renderer generation is v1 — the 16 registered adapters, or the 14 unreachable
   modules under `src/deployment/render/`? Chapter 60's schedule is costed against a
   count that matches neither, and the registered `kubernetes` adapter already emits
   two of the four kinds chapter 30 lists as missing.
3. Is layer 2 pure, or does it consume `ClusterState`? Chapter 20 states the rule at
   line 11 and breaks it in its own worked example at line 246. If it consumes
   observed state, which claims in chapters 20, 30 and 40 need restating?
4. What versions the data model, if not `package.json`? And is composition's
   per-fragment check equality or a range — because equality plus a fail-closed union
   means one stale participant stops every deploy including its own fix.
5. What is the datastore, how many k3s servers are there, and has a restore of a
   `local-path` PV ever been rehearsed? None of the three is expressible in any schema
   in this repository.
6. Which CNI does the cluster run? If it has no audit mode, what replaces
   `60-setup.md:153`, which is a hard precondition that can never be ticked?
7. Who owns k3s secrets-at-rest, and by when? Until it lands, is shipping
   `delivery: env` — which replaces a path ADR-0005 says never touches etcd — a
   regression you are choosing to accept, and where is that recorded?
8. On your KV-v2 mount, is a `read` grant per-path or per-key? ADR-0005's own
   `patch`-over-`update` argument says per-path. If so, what does `keys:` mean, and
   what does `E_ROLL_AFFECTS_OTHER_READERS` actually compute?
9. Does prune run before or after apply, and what stands between a render omission
   and the deletion of the `irreplaceable` knowledge vault? Today: nothing —
   `durability` has zero references in `src/` or `schemas/`.
10. What is the stopping rule for v1? Which third of this is independently useful if
    the rest never lands, and what is the budget past which you stop? No ADR and no
    chapter states one, and the most likely failure here is not collapse but partial
    completion with both delivery models live.
