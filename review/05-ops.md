# Day-2 operations, failure, recovery, observability — critique

Skills: `engineering:deploy-checklist` — not installed. `engineering:incident-response` — not installed. Proceeded without them.

Reviewed:

- `docs/adr/0001` through `docs/adr/0019` (all 19 files, in full)
- `spec/v1/00-overview.md`, `10-service-intent.md`, `16-dependencies.md`,
  `20-resolved-deployment.md`, `30-deliverables.md`, `40-composition.md`,
  `50-lifecycle.md`, `60-setup.md`
- `spec/v1/examples/aggregator.yml`, `renovate.json`
- `spec/v1/examples/workflows/aggregator-deploy.yml`, `aggregator-gate.yml`,
  `compose.yml`, `service-publish-fragment.yml`
- `spec/v1/examples/rendered/deployer-rbac.yaml`, `reapply-cronjob.yaml`
- `spec/v1/examples/knowledge.service.yml`, `auth-api.service.yml`,
  `platform-postgres.service.yml`
- `spec/v1/examples/negative/duplicate-service-id/README.md`
- `CONTEXT.md`, `README.md`, `docs/adapters.md`, `docs/deployment-parity-report.md`
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.npmrc`, `package.json`
- Repo-wide grep for `backup|restore|rpo|rto|etcd|disaster|runbook` across all prose

Not reviewed:

- `src/**`, `schemas/**`, `fixtures/**`, `test/**`. `spec/v1/00-overview.md:3-5`
  states this branch holds the specification only and touches none of them, so
  they cannot corroborate or contradict a v1 claim. Where a finding depends on
  unimplemented behaviour I have said so.
- `spec/v1/examples/*.base.env`. Env-file contents bear on config correctness,
  not on failure or recovery.
- `deploy-harness/**` (`prepare-candidate.mjs`, `rerun-policy.mjs`,
  `quarantine.mjs`, `wait-runtime-healthy.mjs`, …). These live in
  `tests/stack-integration-tests` in another repository and are not present here.
  Findings that depend on their behaviour are marked.

## Findings

### OPS-001 — The delete pass can delete a PersistentVolumeClaim, and no restore exists for what was in it

Severity: Blocker
Confidence: Certain
Target: `spec/v1/examples/rendered/deployer-rbac.yaml:29-30`, `spec/v1/50-lifecycle.md:108`

Evidence:

```
    resources: [services, serviceaccounts, configmaps, persistentvolumeclaims]
    verbs: [get, list, create, patch, update, delete]
```

Problem: the prune pass is `for obj in (prev - curr): kubectl delete` over
everything carrying the deployer label, and the generated Role grants `delete`
on `persistentvolumeclaims`. Any cause that drops an object from a render — a
fragment that fails to publish, an adapter regression, a coverage gap, a bad
merge to `service.yml` — therefore deletes the claim, and `local-path` PVs are
deleted with their claim. `docs/adr/0008-runtime-mechanics-derived-from-intent.md:42-43`
records that snapshots are impossible on this storage, and no restore procedure
exists anywhere in the tree. Nothing in the delete pass distinguishes
`durability: irreplaceable` (declared on `knowledge-vault-clone`) from a
ConfigMap.

Consequence: at 03:00 a render omission is unrecoverable rather than
re-appliable. The very field the model introduces to say "this data cannot be
replaced" has no effect on the one code path that can destroy it.

Direction: the delete pass needs a class-aware refusal for claims backing
non-`reconstructible` volumes, and deletion of stateful objects should be a
separate, confirmed operation from deletion of derived ones.

### OPS-002 — Renovate maintains the pin in one file; both workflows read it from another, and the deploy trigger watches the wrong one

Severity: Blocker
Confidence: Certain
Target: `spec/v1/examples/renovate.json:8`, `spec/v1/examples/workflows/aggregator-deploy.yml:20`

Evidence:

```
      "managerFilePatterns": ["/^aggregator\\.yml$/"],
```

Problem: the custom manager rewrites `composedLock:` inside `aggregator.yml`
(and `spec/v1/60-setup.md:60` confirms `aggregator.yml` carries the pin), while
`aggregator-gate.yml:38` and `aggregator-deploy.yml:61` both read
`yq -r '.pins.composedLock' pins.yml`, the gate's `paths` filter is
`['pins.yml', 'system-tests/**', '.github/workflows/gate.yml']`, and the deploy
trigger is `paths: ['pins.yml']`. As written, a Renovate bump touches a file no
workflow reads, triggers no gate, and on merge triggers no deploy. The three
normative worked examples the specification points at as "the work is rewiring,
not writing" do not agree on where the pin lives.

Consequence: built as specified, the pipeline is silently inert — PRs merge
green having tested nothing, and production stays at whatever lock it last
received. The failure presents as "the estate stopped moving", with every
individual workflow reporting success.

Direction: one file, named once, referenced by the manager, both `paths`
filters, and both `yq` reads.

### OPS-003 — Backups are rendered; restore is defined nowhere, and no RPO or RTO is implied

Severity: Major
Confidence: Certain
Target: `spec/v1/20-resolved-deployment.md:151`, `spec/v1/60-setup.md:156`

Evidence:

```
| backup job and retention | `volumes[].durability` | `reconstructible` renders none |
```

Problem: `durability` renders a backup job, a retention sweep and an off-cluster
copy. Nothing in the ADRs, the spec or the glossary states how a restore is
performed, who may perform it, how long it takes, or how much data is lost. A
repo-wide grep for `restore`, `RPO` and `RTO` returns only `spec.prune: true`
being restored during adoption. The pre-flight checklist rehearses exactly one
procedure — `a break-glass rollback has been rehearsed, not just written` — and
restore is not on it. `docs/adr/0008:54-57` explicitly withdrew the previous
90-day retention attestation for being unverifiable, and then did not replace it
with a stated recovery objective.

Consequence: the first real restore is attempted during the incident that needs
it, against backups nobody has read back, for data the model has already
labelled irreplaceable.

Direction: a Durability Class should commit to a restore procedure and an RPO,
and the pre-flight checklist should rehearse restore alongside break-glass.

### OPS-004 — The post-apply verification timeout is half the startup budget of the services it verifies

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/workflows/aggregator-deploy.yml:118`, `spec/v1/examples/auth-api.service.yml:83`

Evidence:

```
            --slice slice/ --deployer auth-federation --timeout 300s
```

Problem: `auth-api` and `knowledge-api` both declare `startupBudget: 600s`
(measured JVM cold start ~250–300s per `knowledge.service.yml:70`), from which
layer 2 derives `progressDeadlineSeconds: 1800`. `apply verify` waits 300s for
observed digests and Ready conditions. A healthy rollout of either service will
therefore routinely exceed the verification window, failing the deploy job while
the rollout is still legitimately in progress. The one number that decides
whether a deploy is declared good is hard-coded in the workflow rather than
derived from the same `startupBudget` everything else derives from.

Consequence: a red deploy job that means nothing, on the services with the
highest Alert Class. Once operators learn the failure is spurious, a genuinely
stuck rollout looks identical to the noise — the same pathology
`docs/adr/0013:38` names about routinely-red Renovate PRs.

Direction: derive the verify timeout from the maximum startup budget across the
slice, as `resolveHealthTimeout` already does for the health timeout class.

### OPS-005 — A failed apply leaves the slice split across two locks, and nothing defines what the drift job then re-applies

Severity: Major
Confidence: Likely
Target: `spec/v1/examples/rendered/reapply-cronjob.yaml:42-43`, `spec/v1/50-lifecycle.md:165-166`

Evidence:

```
                  LOCK="$(deploy-config-schema apply applied-lock \
                            --deployer auth-federation)"
```

Problem: objects are applied in DAG order and annotated with the new lock as
they go, so a failure part-way — a 403, a conflict, a timeout, the 20-minute job
timeout — leaves earlier layers annotated with lock N and later layers still at
N−1. `applied-lock` is then a query over a set with two answers, and the
specification defines only the *lag* reading ("the minimum lock annotation
across an aggregator's objects"). The CronJob will re-apply whichever the query
returns, which either half-rolls-forward or half-rolls-back a partially-applied
deploy, hourly, unattended. No compensating action, no transaction boundary and
no "abort and restore the previous lock" path is specified.

Consequence: an interrupted deploy converges to a state nobody chose, and the
cluster reports Ready throughout. Assumption stated: `apply applied-lock` is
unimplemented, so its behaviour on a mixed set is inferred from the spec rather
than observed.

Direction: define `applied-lock` over a mixed set explicitly, and make a partial
apply a named state with a documented exit.

### OPS-006 — A break-glass rollback writes nothing to the pin, so the next Renovate bump re-applies the lock that was rolled back

Severity: Major
Confidence: Likely
Target: `spec/v1/examples/workflows/aggregator-deploy.yml:21-31`, `spec/v1/50-lifecycle.md:184-187`

Evidence:

```
  workflow_dispatch:
    inputs:
      lock:
```

Problem: break-glass is a `workflow_dispatch` input. It applies an older lock and
records it in cluster annotations, which is what makes the rollback stick against
the CronJob — but `pins.yml`/`aggregator.yml` still holds the newer, bad pin.
Renovate's next bump raises a PR from that pin to a newer one; the gate runs
against a vcluster and, since the vcluster did not reproduce whatever broke
production, goes green; merge re-applies the forward path. The rollback is undone
by the normal pipeline with no human ever deciding to override it, and the
`--break-glass` lag report only fires inside the break-glass run itself.

Consequence: the fix that stopped the outage is reverted hours later by a routine
dependency PR, and the second outage looks unrelated to the first.

Direction: break-glass should leave a durable, blocking marker in the aggregator
repository that the gate refuses to merge past until it is cleared.

### OPS-007 — Lag is measured only on the deploy path, so an aggregator that has stopped deploying never reports

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/workflows/aggregator-deploy.yml:127`, `spec/v1/examples/rendered/reapply-cronjob.yaml:55-61`

Evidence:

```
          npx deploy-config-schema apply lag --deployer auth-federation \
```

Problem: `apply lag` runs as a step of the deploy job. The hourly reapply
CronJob — the only thing that runs unattended — calls `applied-lock`, `render`,
`apply` and `apply verify`, and never `lag`. So lag is computed exactly when a
deploy has just succeeded, and never when an aggregator's gate has been red for
a week, its runner is offline, or its Renovate PR was closed. The failure mode
the lag measurement exists to detect is the only one during which it does not
run.

Consequence: a slice can sit weeks behind the composed estate with every
dashboard green, and the divergence is discovered by a cross-slice contraction
failure or an incident rather than by the mechanism designed to catch it.

Direction: lag belongs in the in-cluster job or in a cluster-side query over
annotations, not in the workflow that only runs on success.

### OPS-008 — `report` names no recipient: the drift job and the delivery pipeline have no Alert Class, no owner and no notifier

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/rendered/reapply-cronjob.yaml:58`, `spec/v1/examples/aggregator.yml:46`

Evidence:

```
                    --on-conflict report
```

Problem: field-ownership conflicts, lag beyond the bound, and break-glass state
are all "reported". `docs/adr/0012:9` derives notifier routing from Alert Class
and owner — both of which are fields of a *Service*. The reapply CronJob, the
composition workflow, the gate and the deploy job are not Services: they have no
`alertClass`, no `owner`, and therefore no derived notifier route. Their only
failure signal is a red GitHub Actions run, in repositories whose own ADR
(`docs/adr/0013:38`) records that a routinely-red PR is the thing people learn to
ignore. `failedJobsHistoryLimit: 3` on the CronJob means the fourth consecutive
failure erases the evidence of the first.

Consequence: drift correction can be dead for days with no page, no email and no
dashboard; a human edit that took field ownership of a production Deployment is
"reported" into a log nobody reads.

Direction: the delivery machinery needs to be a first-class monitored subject
with its own Alert Class, not an unowned by-product of the model it delivers.

### OPS-009 — Composition is estate-wide fail-closed with no per-participant bypass

Severity: Major
Confidence: Certain
Target: `spec/v1/40-composition.md:128`, `spec/v1/40-composition.md:105`

Evidence:

```
    ASSERT -.->|"any failure"| X["no ComposedIntent.<br/>Nothing renders."]
```

Problem: composition pulls every participant, asserts `schemaVersion == installed
toolkit` per fragment, and any one of 26 invariants failing produces no
`ComposedIntent`. One repository publishing a bad or version-skewed fragment
therefore blocks every aggregator in the estate from receiving a new lock —
including a hotfix for an unrelated service. The only listed escape,
`dormant: true`, exempts a participant from the staleness bound, not from the
union, and `E_PARTICIPANT_MISSING` fires precisely when you remove one. The
combination with ADR-0013's exact-match lockstep makes this routine rather than
exceptional: `docs/adr/0013:26-28` records live skew of `0.16.0`, `0.20.0` and
`0.22.0` across the estate today.

Consequence: a typo merged in `intent-media` at 02:00 stops `auth-api` shipping a
fix at 03:00, and the only remaining lever is break-glass with an older lock.

Direction: an explicit, ledgered "compose without participant X" path with an
owner and an expiry, so the escape is visible rather than absent.

### OPS-010 — Alert Class supplies urgency but no predicate, so generated rules can only alert on causes

Severity: Major
Confidence: Certain
Target: `docs/adr/0012-observability-by-class.md:8-9`, `spec/v1/20-resolved-deployment.md:149`

Evidence:

```
| ServiceMonitor, PrometheusRule | `scrape`, `alertClass` | the rule always carries `release: metrics-stack` |
```

Problem: the only inputs to a derived `PrometheusRule` are the scrape surface and
a four-value urgency enum. Nothing in the model states *what* the rule tests, at
what threshold, over what window, or with what `for` duration. From urgency plus
a scrape path, the only derivable predicates are cause-shaped — target down,
absent metric, restart count — because nothing declares a service-level
objective. The chapter that establishes the derivation map treats "notifier
route" as the reachable artefact and never asks what fires it.

Consequence: `alertClass: page` on `platform-postgres` pages on a pod restart
during a `Recreate` rollout, and stays silent when Postgres is up and rejecting
connections. Thresholds arrive with no baseline because there is no field in
which a baseline could be expressed.

Direction: either derive rules from a declared objective (latency, error rate,
freshness) or state plainly that generated rules are liveness-only and that
symptom alerts remain hand-authored in a ledger.

### OPS-011 — The adoption procedure flips `prune` off by hand and nothing verifies it was turned back on

Severity: Major
Confidence: Certain
Target: `spec/v1/60-setup.md:96-97`, `spec/v1/60-setup.md:77-78`

Evidence:

```
6. Restore `spec.prune: true` on the Flux Kustomization.
   Its inventory no longer contains the Service, so there is nothing to prune.
```

Problem: adopting each of ~30 live Services requires disabling pruning on a Flux
Kustomization, performing three steps, and re-enabling it — a flag flip in a
hand-run procedure, repeated thirty times, whose un-flip has no check anywhere in
the model. A Kustomization left at `prune: false` fails silently and permanently:
class B objects stop being reaped, orphans accumulate, and the only mechanism
that would notice is the coverage assertion, which the same chapter says will be
growing with orphans throughout adoption. The chapter's own warning — "Getting
steps 2 and 4 the wrong way round deletes production" — is prose, with no
tooling, no precondition assertion, and no dry-run.

Consequence: six months on, one Kustomization is still unpruned, nobody knows
which, and the deletion safety property the class B path depends on is quietly
absent for that slice.

Direction: make adoption a command with asserted preconditions and a
post-condition that fails while any Kustomization is left at `prune: false`.

### OPS-012 — There is no deploy path from outside the cluster, and rebuilding from an empty cluster is unwritten

Severity: Major
Confidence: Certain
Target: `spec/v1/50-lifecycle.md:197-198`, `spec/v1/60-setup.md:6-25`

Evidence:

```
The apply runs on a self-hosted runner **inside** the cluster, under a
ServiceAccount per aggregator. No cluster credential exists outside the cluster.
```

Problem: every class A apply, and the drift CronJob, run inside the cluster they
manage. If the cluster is down, degraded, or has lost `deploy-system`, there is
by design no credential with which to deploy the fix. The bootstrap order in
chapter 60 begins at "node declarations in YAML" and reaches "first Aggregator
adopts its Services" at step 8 — it assumes a running cluster with Flux, GHCR
reachability, Vault, VSO and a registered self-hosted runner already present.
Nothing describes how those come to exist, and the class B foundation that
delivers Vault and VSO is itself reconciled by a Flux installation the coverage
count explicitly excludes as "not rendered from anything".

Consequence: the disaster-recovery question — empty hardware plus backups, how
long to serving traffic — has no answer in the design, and the answer is
currently one person with node-level access improvising.

Direction: name the out-of-band path explicitly (who holds admin, where, how it
is audited) and write bootstrap from bare metal as a procedure, not as a
precondition.

### OPS-013 — No runbook exists; every operational procedure is prose inside a versioned specification chapter

Severity: Major
Confidence: Certain
Target: repository root — no `runbooks/`, `ops/`, or operational procedure file exists; `spec/v1/50-lifecycle.md:179-193`

Evidence:

```
**Break-glass:** a `workflow_dispatch` applies a named older lock directly,
skipping tests.
```

Problem: the four procedures an operator needs at 03:00 — break-glass rollback,
adoption, un-wedging a field-ownership conflict, and recovering from a failed
partial apply — exist only as paragraphs inside chapters 50 and 60, interleaved
with rationale, ADR cross-references and mermaid diagrams. They carry no
preconditions, no expected output at each step, no verification, and no
"if this fails, do that". Conflict resolution in particular is stated only as a
prohibition (`--force-conflicts` is never passed automatically) with no
description of what a human does instead.

Consequence: the on-call action is to read a design document and infer the
commands. The steps are performable only by their author, which is the definition
of a single point of human knowledge.

Direction: extract the procedures into standalone runbooks with commands,
expected output and failure branches; the chapters can keep the rationale.

### OPS-014 — Third-party images are pinned by mutable tag, outside the images lock, under stateful volumes

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/platform-postgres.service.yml:34-35`

Evidence:

```
    # Third-party, so pinned upstream rather than resolved through our lock.
    image: pgvector/pgvector:pg17
```

Problem: `spec/v1/10-service-intent.md:458-478` forbids an image tag or digest in
layer 1, and `spec/v1/30-deliverables.md:224` forbids a floating tag in a
Deliverable (`E_FLOATING_IMAGE`; digests only). The worked example for the
database that eight Services depend on carries a mutable upstream tag with an
explicit note that it bypasses the lock, and no `imagePullPolicy` is derived
anywhere in the assignment catalogue. `pg17` moves on every upstream build. The
workload is `Recreate` on a `local-path` RWO volume, so any reschedule is a fresh
pull.

Consequence: an unattended node reboot restarts Postgres on a binary nobody
chose, against a data directory nobody snapshotted, and the render hash is
unchanged so the change is attributable to nothing.

Direction: third-party images need the same digest resolution as first-party
ones, with Renovate raising the digest bump; "third-party" is not a reason to
exempt the most stateful workload in the estate.

### OPS-015 — The production apply resolves its own toolchain at run time

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/workflows/aggregator-deploy.yml:77-78`

Evidence:

```
          npx deploy-config-schema render \
            --composed candidate/ \
```

Problem: the in-cluster deploy job invokes `npx deploy-config-schema` for
`render`, `apply prune`, `apply`, `apply verify` and `apply lag`, and
`compose.yml` does the same for `compose pull`, `compose union`, `compose lock`
and `compose verify`. `npx` with no version specifier resolves from the registry
at invocation time. Meanwhile `service-publish-fragment.yml:55-57` goes to
deliberate trouble to install an exact version read from the document itself, and
ADR-0013 makes exact-match `schemaVersion` the central determinism guarantee.
The two paths that actually touch production are the two that do not pin.

Consequence: two identical deploys of the same lock can render different trees,
which breaks the reproducibility property chapter 20 and chapter 30 both depend
on, and makes the render hash unattributable. A bad toolkit publish reaches
production without any pin bump, gate or review.

Direction: the apply path must pin the toolkit to the same version the composed
lock was produced with, and read it back before rendering.

### OPS-016 — Every aggregator gate applies the whole composed estate, with no stated capacity assumption and no cross-aggregator limit

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/workflows/aggregator-gate.yml:64-65`, `aggregator-gate.yml:19-21`

Evidence:

```
          # The WHOLE estate, not just this Aggregator's slice: the suite
          # exercises a relationship, and a relationship needs its peers.
```

Problem: each gate provisions a vcluster and applies all ~450 objects, including
the 18 HelmReleases of the class B foundation via Flux, on a self-hosted runner
(`runs-on: [self-hosted, k3s-t2]`) inside the same seven-node homelab. The
concurrency group is `gate-${{ github.ref }}` — per-branch, per-repository — so
nothing bounds how many aggregators provision estates simultaneously. Chapter 50
already accepts ~6 suites per service change; a burst (a schema bump, a Renovate
run touching several repos, a re-composition storm) multiplies that with no
queue and no admission control. No load assumption is stated anywhere: not
services, not objects, not concurrent gates, not compose duration against the
15-minute timeout.

Consequence: the gate saturates the cluster it is protecting, and the first
symptom is production latency caused by CI. At 10x services the compose timeout
and the vcluster provisioning time are the first things to break, and neither has
a stated headroom.

Direction: a cluster-wide concurrency group for vcluster provisioning, and a
written load assumption with the numbers the timeouts were chosen against.

### OPS-017 — Default-deny "audit mode" names a mode the NetworkPolicy API does not have, and promotion has no criterion

Severity: Major
Confidence: Likely
Target: `docs/adr/0011-dependency-edges.md:34-35`, `spec/v1/00-overview.md:162-163`

Evidence:

```
- **Default-deny must ship in audit mode first.** Any connection that exists but
  is not declared breaks the moment enforcement lands
```

Problem: upstream `networking.k8s.io/NetworkPolicy` has no audit or dry-run mode;
policy-audit is a CNI-specific feature (Cilium, Calico) and no CNI is named in
this repository — `platform` fixtures declare only `kind: k3s`. The safety
mechanism that the largest security change in the specification depends on may
not be available on the target, and the ADR gives no fallback. Compounding it,
`00-overview.md:162-163` records that the criterion for promoting audit to
enforce is unstated, so this is a flag with no removal plan guarding a change
whose own ADR says the cluster is known to contain undeclared paths.

Consequence: either default-deny ships without the audit stage — and the first
enforcement reconcile severs undeclared east-west paths across ~30 workloads at
once — or it sits in a permanent "audit" state that never advances because no one
defined done. Assumption stated: I could not determine the CNI from this
repository; if it is Cilium or Calico the mechanism exists and only the
promotion criterion is missing.

Direction: name the CNI and the audit mechanism in the ADR, or replace the audit
stage with staged enforcement per namespace and a stated observation window.

### OPS-018 — The rendered reapply CronJob carries a mutable image tag, which the same specification forbids in a Deliverable

Severity: Minor
Confidence: Certain
Target: `spec/v1/examples/rendered/reapply-cronjob.yaml:34`

Evidence:

```
              image: ghcr.io/jorisjonkers-dev/deploy-config-schema:1.0.0
```

Problem: `spec/v1/30-deliverables.md:224` lists "a floating image tag" as
forbidden in a Deliverable with `E_FLOATING_IMAGE` and "digests only", and this
file is a rendered Deliverable produced by the `rbac`/availability path. A
`1.0.0` tag on GHCR is mutable. The container it launches holds the deploy
ServiceAccount and re-applies production hourly.

Consequence: a republished `1.0.0` silently changes what re-applies production,
with no lock, no digest and no pin bump — and the guard that exists to catch
exactly this does not run over the specification's own examples.

Direction: render the digest, and add the rendered examples to whatever check
enforces `E_FLOATING_IMAGE`.

### OPS-019 — Staleness bounds and the lag bound are numbers with no baseline

Severity: Minor
Confidence: Certain
Target: `spec/v1/40-composition.md:209`, `spec/v1/examples/aggregator.yml:49`

Evidence:

```
  intent-media:         {maxAge: 180d}
```

Problem: `maxAge` values of 30d/90d/180d and `maxLocksBehind: 3` are presented
without any statement of observed publish cadence or lock rate. A 180-day bound
means the media domain's publishing pipeline can be broken for half a year before
`E_PARTICIPANT_STALE` fires — and `E_PARTICIPANT_STALE` is the mechanism
protecting against a domain being deleted because it silently stopped publishing.
Chapter 50 lists the lag bound as still open while the worked example already
picks 3.

Consequence: the thresholds will be tuned by the first incident they fail to
catch.

Direction: derive the bounds from measured publish intervals, and say which
measurement they came from.

### OPS-020 — Unpinned third-party code executes on the runner that holds production deploy credentials

Severity: Minor
Confidence: Certain
Target: `spec/v1/examples/workflows/aggregator-deploy.yml:50-51`

Evidence:

```
      - uses: actions/checkout@v4
      - uses: oras-project/setup-oras@v1
```

Problem: both actions are floating major-version tags, executing on a
self-hosted runner inside the production cluster under a ServiceAccount that can
delete Deployments, PVCs and IngressRoutes across the namespaces it deploys. A
moved tag is code execution in that context. This repository's own CI is worse in
kind — `.github/workflows/ci.yml:51` pipes a script fetched from a third-party
repository's `main` branch straight into bash — in the pipeline that builds and
publishes the toolkit those runners then execute.

Consequence: the supply chain for production applies is a tag another
organisation controls, on a runner deliberately placed where no other credential
exists.

Direction: pin actions by commit SHA on any workflow that runs in-cluster, and
pin the actionlint downloader to a release.

### OPS-021 — The retry and quarantine machinery can remove a relationship gate, and nothing announces it

Severity: Minor
Confidence: Speculative
Target: `spec/v1/50-lifecycle.md:268`

Evidence:

```
| `run-gradle-suite.mjs`, `rerun-policy.mjs`, `failure-classification.mjs`, `quarantine.mjs` | sharded execution, retry, transient classification, an owner-approved quarantine registry |
```

Problem: the specification adopts an existing retry policy, transient-failure
classifier and quarantine registry as-is, and states none of their parameters:
how many reruns, with what backoff, what counts as transient, what happens when
reruns are exhausted, and how long a quarantine entry lives. A quarantined class
in the auth federation suite removes part of the gate for the 12 relationship
tests that are the entire justification for aggregator-gated delivery, and
`docs/adr/0014:61` already records the analogous hole — "A relationship with no
Aggregator has no gate, and nothing announces that". A quarantine registry is
also not one of the three Bidirectional Ledgers, so it does not fail when an
entry outlives its cause.

Consequence: the gate reports green while exercising less than it did last
month, and the erosion is invisible.

Direction: make the quarantine registry a Bidirectional Ledger with an owner, a
reason and a review date, and state the rerun counts. I would need
`deploy-harness/rerun-policy.mjs` and `quarantine.mjs` from
`tests/stack-integration-tests` to confirm the current behaviour.

## Out of lens

- `spec/v1/examples/rendered/deployer-rbac.yaml` renders a Role only in
  `auth-system`, though `deploys: [auth-api, auth-ui]` and its own header says
  the namespaces are `auth-system, app-system`.
- `auth-api.service.yml:39` grants `keys: ['*']`, which defeats the
  named-key least-privilege derivation ADR-0005 argues for at length.
- ADR-0005's dependency on Kubernetes secrets-at-rest encryption is a security
  precondition and is graded elsewhere.
- The v1 specification and the shipped `schemas/`, `src/` and CLI surface are
  entirely unreconciled; `README.md` still describes the v0.22 command set.
- `docs/adr/0001` is the only ADR with `Status: Accepted`; the other eighteen are
  `proposed`, and nothing states what promotes one.
- `package.json` ships `fixtures/` and `docs/` in the published tarball.
