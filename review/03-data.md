# Data model, state, migrations, isolation — critique

Skills: `engineering:system-design` — **not installed**; `engineering:code-review` — **not installed**. Both names were attempted verbatim and rejected by the Skill tool; no substitute was loaded, and the review proceeded without them.

Reviewed (read in full unless noted):

- `docs/adr/0001` … `docs/adr/0019` — all 19 ADR files (the inventory says 20; there are 19)
- `spec/v1/00-overview.md`, `10-service-intent.md`, `16-dependencies.md`, `20-resolved-deployment.md`, `30-deliverables.md`, `40-composition.md`, `50-lifecycle.md`, `60-setup.md`
- `spec/v1/examples/knowledge.service.yml`, `auth-api.service.yml`, `platform-postgres.service.yml`
- `spec/v1/examples/knowledge-api.base.env`, `knowledge-ingest-worker.base.env`, `auth-api.base.env`, `platform-postgres.base.env`
- `spec/v1/examples/aggregator.yml`, `renovate.json`
- `spec/v1/examples/rendered/deployer-rbac.yaml`, `rendered/reapply-cronjob.yaml`
- `spec/v1/examples/workflows/service-publish-fragment.yml`, `compose.yml`, `aggregator-gate.yml`, `aggregator-deploy.yml`
- `spec/v1/examples/negative/duplicate-service-id/{README.md,intent-a/service.yml,intent-b/service.yml}`
- `CONTEXT.md`
- `src/cluster-context/schema.ts` lines 60–95 (the live `schemaVersion` enforcement ADR-0013 cites)
- `schemas/cluster-composition-lock.schema.json` lines 1–80 (partial — the lock shape chapter 40 generalises)

Not reviewed, and why:

- The other 23 files under `schemas/` and all of `src/`. `spec/v1/00-overview.md:3` states nothing under `schemas/`, `src/` or `fixtures/` is touched on this branch, so they describe the superseded v2 model, not the design under review. The one exception was `src/cluster-context/schema.ts`, which ADR-0013 cites as the enforcement being *retained*.
- `fixtures/**`, `test/fixtures/**` — v2-era golden output and blueprint packs; the v1 data model has no fixtures yet.
- `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `docs/adapters.md`, `docs/deployment-parity-report.md` — outside the data/state/migration lens.
- `review/00-inventory.md` was supplied inline by the orchestrator rather than read from disk.

**Standing assumption for this lens.** There is no database. The stores this critique treats as the data layer are: the OCI registry (Intent Fragments, ComposedIntent, CompositionLock), the Kubernetes API server (applied objects, and the labels/annotations that serve as the inventory), Vault (the Secret Store), and the git repositories holding authored intent plus the generated `resolved.yml`. "A missing constraint the database would let you violate" therefore reads as "a constraint enforced only in the renderer that the API server, the registry or Vault would let you violate".

## Findings

### DAT-001 — `schemaVersion` is the npm package version, and composition fails closed on it, so any toolkit release stops the entire estate

Severity: Blocker
Confidence: Certain
Target: `spec/v1/40-composition.md:105`; `src/cluster-context/schema.ts:76-79`; ADR-0013

Evidence:

```
p4["assert schemaVersion == installed toolkit"]
```

```ts
if (ctx.spec.schemaVersion !== installed) {
    throw new Error(`E_SCHEMA_VERSION_MISMATCH: expected ${installed}, got ${ctx.spec.schemaVersion}`);
```

Problem: `installed` is `package.json`'s `version` (`getPackageVersion`), so the document version and the software version are one field. Composition asserts that equality over **every** fragment in the union and produces no `ComposedIntent` on any failure (`spec/v1/40-composition.md:128`, `140`). The moment the toolkit publishes 1.0.1, every fragment in the estate is invalid until its repository merges a Renovate bump and republishes — and ADR-0013 already records that "Renovate cannot be sequenced". This is a migration that cannot run while old readers exist: it is not expand/contract, it is a simultaneous cutover across N repositories with a fail-closed gate in the middle. Under v2 each consumer rendered alone, so skew was localised (`0.16.0` in four repos, `0.22.0` in the contexts, and the estate still functioned); v1 converts that same skew into total unavailability of the render path, and ADR-0013 does not mention the amplification. A `dormant: true` participant (`spec/v1/40-composition.md:210`) makes it worse: dormancy exempts a fragment from `maxAge` but not from the version assert, so a domain nobody is touching by definition blocks every composition until someone opens a PR against it.

Consequence: the first patch release after v1 ships takes the estate to zero deploys — including the deploy that would fix it — and the window closes only when the last of ~8 repositories has merged. Six months in, this is the pressure that makes people stop upgrading the toolkit at all.

Direction: separate the data-model version from the package version, and make composition's per-fragment check a compatibility range rather than an equality.

### DAT-002 — `keys:` does not constrain read access; the model computes a blast radius the Secret Store cannot enforce

Severity: Blocker
Confidence: Certain
Target: `spec/v1/16-dependencies.md:287`; `docs/adr/0005-credential-provisioning.md:73-78`

Evidence:

```
| Vault policy + Kubernetes auth role | `read` on the granted path and keys only |
```

ADR-0005, arguing why `self-roll` derives `patch`:

```
> *"`-method=patch` forces the HTTP PATCH path, which the `patch` capability allows without read access to the other keys in this document. A read/modify/write fallback would need `read` on the Discord webhook and Grafana client secret too."*
```

Problem: The ADR's own argument establishes that a KV-v2 `read` capability is granted per **path**, over the whole document — that is precisely why `patch` is preferred. Chapter 16 then claims the derived policy is scoped to "the granted path **and keys**", which Vault cannot express for `read`. The examples make this live rather than theoretical: `secret/data/platform/postgres` is granted by `knowledge` for `[kb.user, kb.password]` (`knowledge.service.yml:26-27`), by `auth-api` for `[auth.user, auth.password]` (`auth-api.service.yml:30-31`), and by `platform-postgres` for `[exporter.datasource]` (`platform-postgres.service.yml:111-112`), and chapter 16 notes the same document also holds `agents.*` and `n8n.*`. Every one of those readers holds `read` on all of them. `E_ROLL_AFFECTS_OTHER_READERS`, the "who breaks if I rotate this" derivation, and the rotation blast radius in `spec/v1/16-dependencies.md:49` are all computed over `keys`, so they under-report by exactly the difference between the declared key set and the document.

Consequence: `knowledge`'s pod can read `auth-api`'s database password, and the estate's answer to "who can read this key" — the thing composition exists to make computable — is wrong in the direction that hides a compromise. A per-key model over a per-document store also means the first real rotation incident finds a reader nobody enumerated.

Direction: either the grant unit becomes the path (and `keys` is documentation only, stated as such), or the Secret Subtree splits one path per grantable key set before v1 renders a policy.

### DAT-003 — the delete pass runs before the apply, and it can hard-delete a PVC holding `irreplaceable` data

Severity: Blocker
Confidence: Certain
Target: `spec/v1/examples/workflows/aggregator-deploy.yml:82-106`; `spec/v1/examples/rendered/deployer-rbac.yaml:29-30`

Evidence:

```yaml
      - name: Prune what left the render
        …
          npx deploy-config-schema apply prune \
```

```yaml
    resources: [services, serviceaccounts, configmaps, persistentvolumeclaims]
    verbs: [get, list, create, patch, update, delete]
```

Problem: Two defects compound. First, ordering: prune is step one and the server-side apply is step two, so anything in `prev − curr` is destroyed before anything in `curr` exists. A rename, a claim moving between Workloads, or a Service handed from one Aggregator's `deploys` list to another all present as delete-then-create; if the apply then fails — a field-ownership conflict "fails this step" by design (`aggregator-deploy.yml:107-109`), or the 20-minute timeout expires — the old object is gone and the new one was never written, with no rollback and no journal. Flux applies then prunes; this inverts that. Second, scope: the render is the only thing standing between a PVC and a `delete`, and the Role grants `delete` on `persistentvolumeclaims` with no per-name restriction. `knowledge-vault-clone` is declared `durability: irreplaceable` on `local-path` storage where ADR-0008 records that snapshots are impossible; nothing in chapter 10, chapter 30 or the delete pass makes `durability` gate deletion. `--confirm-deletions` (`aggregator-deploy.yml:95`) is a non-interactive flag in CI, not a confirmation.

Consequence: one edit that drops a `volumes` entry, or one Service moved between Aggregators in the wrong order, permanently destroys the only copy of the knowledge vault, and the run that does it looks like a normal green deploy.

Direction: apply before prune, and make `irreplaceable`/`recoverable` render a retain policy that the delete pass must refuse to cross without an explicit named override.

### DAT-004 — one ServiceAccount per Service makes Workload-level secret grants unenforceable

Severity: Major
Confidence: Likely
Target: `spec/v1/16-dependencies.md:122`; `spec/v1/20-resolved-deployment.md:99-102`

Evidence:

```
    d_id --> k_sa
```

```
own, and layer 2 flattens that before deriving policies, so a shared grant
produces one policy statement per Workload that holds it rather than one per
```

Problem: The derivation map derives `ServiceAccount` from `id` — one identity per Service — while chapter 20 flattens grants and derives policy *per Workload*. A Vault Kubernetes auth role binds to a ServiceAccount, so two Workloads of one Service authenticate as the same principal and receive the union of both policies regardless of which level the grant was declared at. The `knowledge` example is exactly this shape: `knowledge-ingest-worker` holds a Workload-level `delivery: file` grant on `vault-deploy-key`, and `knowledge-api` does not — but both run under the same Service identity in the same namespace, and for `delivery: env` grants the VSO-projected Secret is a namespace object readable by any pod there. The assumption I cannot verify from the spec is whether the `kubernetes` adapter emits one SA per Service or per Workload; the derivation map says `id`, and `id` is a Service field.

Consequence: ADR-0005's two-level model reads as an access boundary and is only a documentation boundary. The SSH deploy key that "only the worker pushes with" is reachable from the API pod, and the estate believes otherwise.

Direction: if grants are Workload-scoped, the identity must be too — derive the ServiceAccount from Service + Workload, or state plainly that the second level is organisational only.

### DAT-005 — the re-apply CronJob and the merge deploy share a field manager and have no mutual exclusion

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/rendered/reapply-cronjob.yaml:42-57`; `spec/v1/examples/workflows/aggregator-deploy.yml:103`

Evidence:

```
                  LOCK="$(deploy-config-schema apply applied-lock \
                            --deployer auth-federation)"
```

```yaml
            --field-manager auth-federation \
```

Problem: Two writers write the same objects. `concurrencyPolicy: Forbid` serialises the CronJob against itself and the workflow `concurrency: group: deploy-auth-federation` serialises the deploy against itself, but nothing serialises the two against each other. They deliberately share the field-manager name, so server-side apply cannot report the conflict — the one protection chapter 50 claims this model gains over continuous reconciliation is disabled precisely between the two processes most likely to collide. The CronJob's input is also ambiguous: `apply applied-lock` reads the lock from object annotations, and chapter 50 acknowledges the annotation set is heterogeneous by defining lag as "the **minimum** lock annotation across an aggregator's objects" (`spec/v1/50-lifecycle.md:165`). Concurrent sequence: the deploy applies 200 of 364 objects at lock N and fails on a conflict; the CronJob fires at :23, reads an annotation set containing both N−1 and N, picks one, re-renders, and applies it over the other half.

Consequence: a partially-applied slice is silently rolled forward or backward by a scheduled job, on an hourly cadence, with no record of which lock won — and the operator debugging it is reading annotations that the CronJob is concurrently rewriting.

Direction: an in-cluster lease held by whichever process is applying, distinct field-manager names so a collision surfaces as a conflict, and a defined answer for `applied-lock` over a mixed set.

### DAT-006 — `ResolvedDeployment` embeds observed cluster state, so the purity and reproducibility properties are false as stated

Severity: Major
Confidence: Certain
Target: `spec/v1/20-resolved-deployment.md:246-249`, `:175-177`, `:217`

Evidence:

```yaml
      observed:
        node: enschede-t1000-1
```

```
   byte-identical Deliverable Set and the same `renderHash`. A mismatch means an
   input was not pinned — which is a defect in the lock, not in the render.
```

Problem: `inputDigests` is `{intent, imagesLock, context}` (`:217`); the observed PV binding is in none of them and is read from the live cluster, which chapter 20 itself classifies as impure and insists must stay a separate document (`:194-199`). The purity rule says a value that cannot be a pure function must move up into layer 1 or sideways into the Cluster Context and "may not stay in layer 2" — and this one stays in layer 2. The consequences are concrete: `renderHash` becomes a function of unpinned mutable state, so property 2 ("if `renderHash` changes, at least one `inputDigests` entry changed. There is no third possibility") is wrong; and the diagnosis attached to property 1 actively misleads, because a mismatch caused by a rebound PV will be reported as a defect in the lock. The hourly CronJob re-renders in-cluster from a pinned lock, so it can legitimately produce a different tree from the one the merge deploy applied, with every digest identical.

Consequence: the chain from published fragment to rendered file — the property chapter 40 calls "one unbroken chain" — is broken at exactly the point where a node fails and a PV rebinds, which is when reproducibility matters most.

Direction: observed bindings belong in `ClusterState` and must enter the render, if at all, as a pinned input with its own digest.

### DAT-007 — `E_CONTRACT_TOO_EARLY` requires knowing what each slice has applied, which composition cannot read without breaking purity

Severity: Major
Confidence: Likely
Target: `spec/v1/50-lifecycle.md:168-177`; `spec/v1/40-composition.md:195`

Evidence:

```
expand/contract, and composition can enforce it because it sees both sides of
every inbound derivation.
```

Problem: The stated failure case is "`auth-api` at lock N stops allowing an origin **still live** at N−1". "Still live" is a fact about the cluster — which lock each Aggregator's slice actually sits at — and composition's inputs are Intent Fragments, the Cluster Context and the participants list. Seeing both sides of a derivation tells you what the *current union* implies; it does not tell you what is deployed, and chapter 50 is explicit that the cluster is a patchwork with "no single answer to what lock production is at". So either composition reads cluster state (violating the purity chain and coupling the render to a live API server), or the contraction check compares the new union against the previous *lock* and silently assumes every slice has caught up — which is the assumption partial rollout exists to deny.

Consequence: the one mechanism protecting cross-slice removals is either impure or vacuous, and the failure it is meant to catch — a CORS origin or a NetworkPolicy allow removed before the consuming slice has moved — presents as an intermittent production outage attributed to the consumer.

Direction: decide whether contraction is checked against the deployed set (an impure, explicitly-provenanced input) or against a declared minimum supported lock per Aggregator, and say which.

### DAT-008 — deploy isolation is a mutable label plus a namespace-wide Role, and the spec's own example puts two deployers in one namespace

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/rendered/deployer-rbac.yaml:5-8`; `spec/v1/20-resolved-deployment.md:131`

Evidence:

```
# This is what turns "deploy authority is exactly one" from a CI convention
# into an API-server control. … deploys: [auth-api, auth-ui]  ->  namespaces auth-system, app-system
```

```
| `namespace` | `id`, or `aliases.namespace` | `app-system` for `home-portal` is an alias with a recorded reason |
```

Problem: The generated Role is namespace-scoped with `create/patch/delete` on every listed kind, and carries no `resourceNames` restriction. `app-system` is `home-portal`'s namespace by chapter 20's own catalogue, and `home-portal` appears in this Aggregator's `exercises` but not its `deploys` — so it is deployed by a different Aggregator whose Role lands in the same namespace. `E_MULTIPLE_DEPLOYERS` is a per-Service invariant and does not see this. The claimed API-server enforcement therefore does not hold whenever two Services share a namespace, which `aliases.namespace` exists specifically to permit. What is left is the `deploy.jorisjonkers.dev/deployer` label — the same label the prune pass queries. Chapter 50 already names the residual risk ("a label that drifts … orphans silently") but only in the benign direction; the malign direction is a label applied to another Aggregator's object, after which the wrong prune pass deletes it, with RBAC permitting it.

Consequence: isolation between deployers is a query-time convention over a shared namespace, not a structural guarantee, and the one place the design claims structure is the place it is weakest.

Direction: either namespaces are one-per-deployer (which makes `aliases.namespace` a composition-time collision check), or the Role is scoped by `resourceNames` to the rendered object set.

### DAT-009 — the join key between an env-file placeholder and a grant is an unspecified path normalisation

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/knowledge.service.yml:26` vs `knowledge-api.base.env:22`; `spec/v1/40-composition.md:171-174`

Evidence:

```yaml
  - path: secret/data/platform/postgres
```

```
DB_USER=${secret:platform/postgres#kb.user}
```

Problem: `E_UNBOUND_SECRET_GRANT` and `E_UNAUTHORISED_SECRET_REFERENCE` are a bidirectional join between two files, and the key on one side is `secret/data/platform/postgres` while the key on the other is `platform/postgres`. The transform is never stated. `CONTEXT.md`'s **Claim** entry says a claim is "written as the full KV-v2 data path", which the placeholders in every example contradict. Stripping a fixed `secret/data/` prefix does not generalise: `auth-api.service.yml:50` grants `transit/keys/auth-api-jwt`, which has no `data/` segment at all, and two mounts (`secret/` and `kv/`) with the same suffix normalise to the same placeholder key while `E_SUBTREE_PREFIX_COLLISION` — which operates on full paths — sees no collision. An ambiguous key on an authorisation check resolves in whichever direction the implementation happens to pick.

Consequence: `E_UNAUTHORISED_SECRET_REFERENCE` can be satisfied by the wrong grant, which turns the check that gates secret access into one that reports success for a reference nobody authorised.

Direction: normative normalisation rule in chapter 10, plus a composition invariant that two Subtree paths may not normalise to one placeholder key.

### DAT-010 — `keys: ['*']` makes the reader set, and therefore `E_ROLL_AFFECTS_OTHER_READERS`, undecidable

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/auth-api.service.yml:38-39`

Evidence:

```yaml
  - path: secret/data/auth-api
    keys: ['*']
```

Problem: A wildcard key set appears in a normative worked example and nowhere in chapter 10's field table, chapter 40's invariants, or `CONTEXT.md`. Every secret invariant is key-scoped: the dead-grant and unauthorised-reference joins match on `path#key`, and `E_ROLL_AFFECTS_OTHER_READERS` asks whether "a path other Services read" is being rolled. With `*` in the union, "does this reader read key X" is unanswerable without also knowing the live contents of the Vault document — which composition does not have and, under the purity rule, may not fetch. The check therefore has to choose between never firing for wildcard readers and always firing, and neither is stated.

Consequence: the one check the estate does not have today — the `secret/platform/observability` case where one CronJob rolls one key of a document three services read — is defeated by the first wildcard grant, and a wildcard grant is in the specification's own example set.

Direction: forbid `*` in a grant, or define the reader set as path-level whenever any grant on that path is a wildcard, and make the acknowledgement mandatory in that case.

### DAT-011 — `INPUTS_SHA` is computed over generated output, and merging a publish-back PR re-runs every Aggregator's gate

Severity: Major
Confidence: Certain
Target: `spec/v1/examples/workflows/service-publish-fragment.yml:78-83`; `spec/v1/20-resolved-deployment.md:208`

Evidence:

```
          # inputsSha covers AUTHORED inputs only, never generated output.
          find platform -type f -print0 | sort -z \
```

Problem: The comment states the property; the command below it hashes all of `platform/`, and `resolved.yml` — generated by composition, committed back under ADR-0017 — lives at `services/knowledge/platform/resolved.yml`. Chapter 40 defines `inputsSha` as "the authored inputs only, never generated outputs" and explains that a hash including generated output "would change on every publish and detect nothing". The same path is the publish trigger (`paths: ['platform/**']`), so merging a publish-back PR republishes the fragment; the `dev.jorisjonkers.inputs-sha` annotation is part of the pushed manifest, so the fragment digest changes even when its content did not; composition runs; a new composed lock publishes; Renovate bumps every Aggregator's pin; and roughly six vcluster suites run. That is a write path that feeds its own trigger, and the guard against it is a comment that the code does not implement.

Consequence: every assignment change costs two full estate-wide gate cycles instead of one, and the change-detection hash the whole lock chain rests on cannot distinguish an authored change from a machine-written one. Open item 13's CI-cost concern is understated by a factor of two.

Direction: exclude generated paths from both `INPUTS_SHA` and the workflow's `paths:` filter, and name the generated set in chapter 40 rather than in a comment.

### DAT-012 — composition's two pins are mutable GitHub Actions variables, and nothing ever writes the lock-chain pointer

Severity: Major
Confidence: Likely
Target: `spec/v1/examples/workflows/compose.yml:106`, `:73`

Evidence:

```yaml
            --previous "${{ vars.PREVIOUS_LOCK_DIGEST }}" \
```

```yaml
            --context-ref "${{ vars.CONTEXT_REF }}" \
```

Problem: `previousLockDigest` and `lockChain` are the only ancestry record the design has — chapter 40 says they answer "when did this fragment's digest change, and which render did that produce" — and the value is read from a repository variable that no step in the workflow updates. Either it is stale forever (every lock claims the same ancestor) or it is maintained by hand out of band, which is the mutable remembered state the purity rule exists to forbid. `CONTEXT_REF` has the same shape: chapter 20 requires `contextRef` to be an OCI **digest**, and a repository variable can hold a tag with nothing checking. Both are editable by anyone with repository admin, are not in git, and appear in no diff. I cannot verify from the tree whether some unshown step sets `PREVIOUS_LOCK_DIGEST`; the workflow is presented as complete and does not.

Consequence: the lock chain — the artefact that makes rollback targets and "which render produced this" answerable — is either empty or hand-maintained, and the discovery happens during the first incident that needs it.

Direction: derive the previous digest from the registry (resolve the current `composed:latest` before pushing) and record the context digest inside the composed package, not in CI configuration.

### DAT-013 — the negative fixture pins `schemaVersion`, and the gate-can-fail proof accepts any non-zero exit

Severity: Minor
Confidence: Certain
Target: `spec/v1/examples/negative/duplicate-service-id/intent-a/service.yml:3`; `spec/v1/examples/workflows/compose.yml:85-89`

Evidence:

```yaml
schemaVersion: 1.0.0
```

```yaml
            --out /tmp/should-fail && { echo "gate did not fail"; exit 1; }
          echo "gate rejects a duplicate Service Id as expected"
```

Problem: The fixture's version is a literal, and under DAT-001 the installed toolkit moves. After the first bump the fixture is rejected by `E_SCHEMA_VERSION_MISMATCH` before the union ever evaluates `E_DUPLICATE_SERVICE_ID`, and the assertion — which tests only that the command exited non-zero — prints "gate rejects a duplicate Service Id as expected" and passes. This is the exact failure the fixture's own README names: "an assertion that silently stopped running looks identical to one that passes".

Consequence: the estate's proof that its identity invariant can fail becomes a proof that its version check can fail, and no one is told the difference.

Direction: assert on the error code, not the exit status, and generate the fixture's `schemaVersion` from the installed toolkit.

### DAT-014 — nothing retains the composed locks the cluster's own annotations point at

Severity: Minor
Confidence: Speculative
Target: `spec/v1/examples/rendered/reapply-cronjob.yaml:46`; `spec/v1/examples/aggregator.yml:49`

Evidence:

```
                  oras pull "$LOCK" --output /tmp/candidate
```

Problem: The hourly drift correction pulls, by digest, a lock that may be up to `maxLocksBehind: 3` old, and break-glass pulls an arbitrarily older one. Composition pushes to `composed:latest`, so every superseded lock is an untagged manifest. No retention policy for the `composed` package appears anywhere in the specification, the ADRs or the workflows, and untagged manifests are the usual target of registry cleanup rules. I would need to read the GHCR package settings or any org-level cleanup policy to decide this; nothing in the repository states one either way.

Consequence: if untagged manifests are ever reaped, drift correction stops silently for every lagging Aggregator and the rollback targets the incident runbook depends on are gone at the moment they are needed.

Direction: state the retention requirement for composed locks alongside the lag bound, since the lag bound is what determines how far back the cluster can point.

### DAT-015 — the off-cluster copy for `irreplaceable` data is derived but its destination, credentials and retention are modelled nowhere

Severity: Minor
Confidence: Certain
Target: `CONTEXT.md` **Durability Class**; `spec/v1/examples/knowledge.service.yml:113`

Evidence:

```
`recoverable` (backed up with retention), `irreplaceable` (backed up with an
off-cluster copy, and relocation needs owner approval).
```

Problem: `durability` is the one input from which "backup job, retention sweep, off-cluster copy and move-plan requirement all derive" (`spec/v1/10-service-intent.md:385-386`), yet the assignment catalogue in chapter 20 lists only "backup job and retention" and no destination, no credential grant for it, and no retention period. The `irreplaceable` example is the Obsidian knowledge vault — personal notes — so the derivation moves personal data off-cluster to a target that no schema, invariant or ledger names. `E_RAW_SECRET` and the Secret Subtree machinery cover credentials *in* intent; a derived backup job's own credential is not covered by anything I read.

Consequence: personal data leaves the cluster to a location nobody has enumerated, on a retention nobody has set, and the first person to ask where it is has to read the renderer.

Direction: make the off-cluster target a Cluster Context value with a declared retention, so the destination is data rather than renderer behaviour.

## Out of lens

- The re-apply CronJob runs `ghcr.io/jorisjonkers-dev/deploy-config-schema:1.0.0`, a floating tag, while chapter 30 forbids a tag in any Deliverable (`E_FLOATING_IMAGE`).
- `aggregator-deploy.yml` sets `permissions: {}` at workflow level and then grants at job level; break-glass is a `workflow_dispatch` input with no approval environment.
- ADR-0001 is the only `Accepted` ADR; 0002–0019 are all `status: proposed`, and there is no `docs/adr/README.md` index.
- Chapter 30 open item 4 records a live path disagreement (`platform/cluster/flux` vs `cluster/flux`) that would land every Fragment in the wrong place.
- ADR-0002 promises `validate deployment` is renamed per layer; no CLI surface for the three v1 layers appears anywhere in the spec.
- `CompositionLock` carries `apiVersion: resolved.jorisjonkers.dev/v1` although composition precedes resolution; `ComposedIntent`'s apiVersion is never given.
