# Design patterns, abstraction, module boundaries — critique
Skills: `codebase-design` loaded. `engineering:system-design` and `engineering:tech-debt` are **not installed** on this workstation (checked `~/.claude/skills/` and the available-skills list); continued without them, using `codebase-design` as the checklist.

Reviewed:
- `review/00-inventory.md`
- All 19 ADRs, in full: `docs/adr/0001-blueprint-pack-distribution.md` … `docs/adr/0019-push-delivery-via-aggregators.md`
- All 8 spec chapters, in full: `spec/v1/00-overview.md`, `10-service-intent.md`, `16-dependencies.md`, `20-resolved-deployment.md`, `30-deliverables.md`, `40-composition.md`, `50-lifecycle.md`, `60-setup.md`
- `CONTEXT.md` (full), `docs/adapters.md` (full), `README.md` (lines 1–80)
- Boundary configuration: `eslint.config.js`, `tsconfig.json`, `package.json`, `.github/workflows/ci.yml` (all full)
- Boundary-carrying source, full: `src/index.ts`, `src/adapters/registry.ts`, `src/adapters/model.ts`, `src/adapters/fragment-model.ts`, `src/adapters/adapter-compat.ts`, `src/blueprints/registry.ts`, `src/cluster-context/schema.ts`, `src/render-plan/plan.ts`, `src/render-plan/paths.ts`, `src/render-plan/writer.ts`
- Partial, targeted at the seams: `src/adapters/flux-utils.ts` (530–660, 940–960), `src/deployment/model.ts` (types, `projectModelToAdapterContext`, `validateProjectModel`, `buildProjectModel`), `src/adapters/catalog.ts`, `src/adapters/kubernetes.ts` (1–40), `src/deployment/render/kubernetes.ts` (1–40), `src/artifact/contract.ts` (`computeRenderHash`)
- A machine-generated import graph over all 70 files in `src/`, plus a reachability walk from `src/index.ts` and `src/cli.ts`

Not reviewed, and why:
- The bodies of `src/cli.ts`, `src/deployment/commands.ts`, `src/validator.ts`, `src/artifact-validator.ts`, `src/minimal/expand.ts`, `src/schemas/*.ts` (~7,000 lines). Inspected only via the import graph, export lists and targeted greps — their internals are outside a boundary lens, and reading them would not have changed a finding.
- `fixtures/**`, `test/fixtures/**`, `schemas/*.json`, `spec/v1/examples/**`. These are rendered output and input corpora, reviewed by the manifest lens, not this one.
- `docs/deployment-parity-report.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `README.md` lines 81–167.

## Findings

### PAT-001 — The adapter port is typed `never`; the seam every v1 invariant rests on has no contract
Severity: Blocker
Confidence: Certain
Target: `src/adapters/registry.ts:29`, `src/render-plan/plan.ts:123`

Evidence:
```
  render: (input: never) => RenderResult;
    const rendered = adapter.render(context as AdapterContext as never);
```

Problem: `never` accepts every function, so `registerAdapter` type-checks any callable. Both call sites launder the argument through a double cast (`plan.ts:123` and `plan.ts:127`, the latter `context.artifacts["deploy-config"] as never`), and the runtime check at `registry.ts:237` verifies only `typeof render === "function"`. The dispatch that decides which of two incompatible shapes an adapter receives is a single string comparison, `adapter.input === "canonical-artifacts"` (`plan.ts:122`), on a field the definition author sets by hand. `registerAdapter` is public API (`src/index.ts:6`), so a consumer can register an adapter declaring `input: "canonical-artifacts"` whose body reads `DeployConfig`, and nothing — not `tsc`, not the validator, not a test — objects until it reads `undefined` at render time.

Consequence: chapter 30 makes this seam load-bearing for four things it does not yet carry — per-Fragment attribution, the normative one-adapter-per-kind table, `E_PATH_COLLISION`, and the coverage assertion. Chapter 60 step 6 then requires two new adapters (`rbac`, `availability`) and two registrations (`prometheus`, `networking`) before the first production apply. Four more adapters get built against a port whose only contract is a comment at `registry.ts:27` saying the entries are "intentionally heterogeneous". The first symptom is a rendered tree missing a Fragment, and under ADR-0019's push prune a missing Fragment is a deleted object.

Direction: the two input shapes are two ports, not one with a `never` hole — split `AdapterDefinition` into a discriminated union before adding a fifth adapter to it.

### PAT-002 — Two complete renderer generations coexist; the registered one is `@ts-nocheck`, the typed one is reachable from nothing
Severity: Blocker
Confidence: Certain
Target: `src/adapters/kubernetes.ts:1`, `src/adapters/registry.ts:99`

Evidence:
```
// @ts-nocheck
  render: renderKubernetes,
```

Problem: there are two functions named `renderKubernetes`. The registered one (`src/adapters/kubernetes.ts`, 743 lines) opens with `@ts-nocheck` and takes an untyped `context`. The other (`src/deployment/render/kubernetes.ts:19`) takes a `ProjectModel` and is fully typed. A reachability walk from `src/index.ts` and `src/cli.ts` shows the **entire** `src/deployment/render/` tree — 14 modules, 1,967 lines — is reachable from neither entry point. It is imported only by 14 test files, and `npm run test:coverage` runs `c8 --all --include "dist/src/**/*.js" --check-coverage --lines 90`, so those 1,967 unreachable lines count toward the 90% bar that gates every PR. Separately, 10 files totalling 4,944 lines (26% of `src/`) carry `@ts-nocheck`, including `cli.ts`, `validator.ts` and four registered adapters, while `tsconfig.json:12` sets `"strict": true` and `eslint.config.js:33` sets `"@typescript-eslint/ban-ts-comment": "off"` — the layering is defended and nothing fails when it is violated.

Consequence: chapter 30 open item 2 costs `prometheus` and `networking` as "working renderers that were never registered — 14 objects, and the cheaper half of the gap." They are not the cheaper half. Those renderers consume `ProjectModel`; the registry hands adapters an `AdapterContext` carrying raw artifact documents (PAT-003). Registering them means porting them across the seam, which is the same work as writing `rbac`. The v1 implementation schedule in chapter 60 is costed against a model of the codebase that the import graph contradicts, and the coverage gate cannot detect the problem because dead code is satisfying it.

Direction: decide which generation is v1 before scheduling anything against the 36-object gap; delete the other rather than leaving both to be found by the next reader.

### PAT-003 — `ProjectModel` is a 1,477-line IR whose only field the renderers read is the raw artifact bundle
Severity: Major
Confidence: Certain
Target: `src/deployment/model.ts:912`, `src/deployment/model.ts:426`

Evidence:
```
export function projectModelToAdapterContext(model: ProjectModel): AdapterContext {
    artifacts: model.adapterArtifacts,
```

Problem: `ProjectModel` normalises 15 concerns — `workloads`, `routes`, `providerGraph`, `flux`, `nodeContract`, `reachability`, `collections` — under Zod schemas. The bridge to the registered adapters keeps three of them: `adapterArtifacts`, `cluster.appsRoot`/`clusterRoot`, and the diagnostics array. `AdapterArtifactsModel` (`model.ts:426`) is `DeployConfig`, `ServiceIntentArtifact`, `FleetInventoryArtifact`, `VaultDynamicSecretsArtifact` and `PlatformConfig` — every one imported from `../adapters/model.js`, i.e. the raw authoring/transport document shapes. Apply the deletion test: remove `workloads`, `routes`, `providerGraph`, `flux`, `parityImports` from `ProjectModel` and no registered adapter notices, because they all re-derive from `artifacts["service-intent"]` (`adapters/kubernetes.ts:17`) and `artifacts["deploy-config"]`. The IR is a port that hands the adapter the persistence format.

Consequence: ADR-0016 rejected a target-neutral IR on the grounds that "an abstraction with one consumer is shaped entirely by that consumer" (`docs/adr/0016-deliverables-and-ledgers.md:24`). That argument applies to `ProjectModel` as it stands: it has one consumer, and that consumer ignores it. Chapter 20 promises `ResolvedDeployment` as a schema'd, versioned, published layer-2 document. Building it on top of a normalised model that the renderers bypass means layer 2's guarantees stop at the seam, and every derivation chapter 20 lists as "assigned" is in fact re-derived inside each adapter from layer-1 shapes.

Direction: make the artifact bundle the thing the adapters cannot see, not the only thing they can.

### PAT-004 — Four directory cycles, no boundary configuration, nothing in CI that fails on a violation
Severity: Major
Confidence: Certain
Target: `src/deployment/model.ts:2`, `src/adapters/fragment-model.ts:11`

Evidence:
```
import type {                       // src/deployment/model.ts -> ../adapters/model.js
} from "../deployment/v2-model.js"; // src/adapters/fragment-model.ts -> deployment
```

Problem: the import graph over all 70 `src/` files contains four cycles at directory level — `adapters ↔ deployment` (5 edges out, 4 back), `adapters → artifact → deployment → adapters`, `adapters ↔ render-plan` (`flux-utils.ts → render-plan/paths.js` against `render-plan/plan.ts → adapters/registry.js`), and `deployment ↔ collections` and `deployment ↔ hosts` (both via `commands.ts` importing what imports `deployment/io.js`). The inventory records that no boundary configuration exists, and I confirmed it: `eslint.config.js` carries no import-boundary plugin, `tsconfig.json` is one project with no references, `package.json` has no `madge`, and `ci.yml` runs lint, test, actionlint and gitleaks — nothing that inspects the graph. The `adapters ↔ deployment` cycle is not incidental: it is the shared `AdapterContext`/`DeployConfig` types moving one way and `DeploymentV2` the other, so the two directories are one module wearing two names.

Consequence: chapter 30 is about attributing every file to exactly one adapter, and chapter 40 asserts nine completeness invariants across modules. Neither is expressible while `adapters` and `deployment` can each reach into the other's types. Six months on, the first person told to extract the `rbac` adapter discovers it needs `ProjectModel`, which needs `adapters/model.js`, and adds a fifth cycle because nothing tells them not to.

Direction: an acyclicity check in CI is cheaper than the boundary documentation that would otherwise be written and ignored.

### PAT-005 — `E_PATH_COLLISION` is normative in two chapters, implemented nowhere, and the writer is literally last-write-wins
Severity: Major
Confidence: Certain
Target: `spec/v1/30-deliverables.md:141`, `src/render-plan/writer.ts:60`

Evidence:
```
A collision is a build error, not a last-write-wins merge.
    for (const result of results) {
```

Problem: `E_PATH_COLLISION` appears in `spec/v1/40-composition.md:150` as an identity invariant and in chapter 30 as a build error. Grepping `src/` for it returns nothing; the only collision check in the codebase is `E_RESOURCE_NAME_COLLISION` in `artifact/apply-bundle.ts:123`, which compares object names inside one bundle, not paths across adapters. `writeGeneratedFiles` computes every `PreparedWrite` against on-disk state at `writer.ts:45` and then writes each in turn at `writer.ts:60–66` — two `AdapterFile`s sharing a path both get written, second wins, silently, and both report `action: "create"`. The determinism chain cannot see it either: `computeRenderHash(files: Record<string, string>, …)` (`src/artifact/contract.ts:42`) keys by path and drops the `adapter` field entirely, so the hash chapter 30 says is "taken over the sorted Fragment set" is taken over a path→content map in which a collision has already collapsed.

Consequence: chapter 30 open item 1 requires four duplicated adapter pairs to collapse "before the coverage assertion can be enforced" — `traefik-public` against `traefik-route-fragment`, `gatus` against `gatus-endpoint-fragment`, and two more. Those pairs are exactly the condition the missing check exists to catch, and today they are registered simultaneously (`registry.ts:36–192`). Under ADR-0019's push delivery, an object silently overwritten by a rival adapter is an object whose content nobody chose.

Direction: the check belongs where the Fragment set is assembled, not where it is written, and `renderHash`'s preimage should carry the adapter if attribution is meant to be part of the chain.

### PAT-006 — `emitAdapterCompat` is a second, hand-written registry, and its digest is the pinned one
Severity: Major
Confidence: Certain
Target: `src/adapters/adapter-compat.ts:25`, `src/adapters/registry.ts:33`

Evidence:
```
  const spec: AdapterCompatSpec = {
const adapterDefinitions = new Map<string, Readonly<AdapterDefinition>>();
```

Problem: two structures claim to describe which adapters exist and what they accept. `adapterDefinitions` is a module-level mutable `Map`, populated by 16 top-level `registerAdapter` calls and mutable at runtime by any consumer through the public `registerAdapter` export (`index.ts:6`) — a service locator with process-wide scope and no reset. `emitAdapterCompat` is a hardcoded object literal listing five fragment adapters and the central adapters they feed, and its SHA-256 becomes `adapterCompatDigest` — a load-bearing input to `loadFragmentInput` (`fragment-model.ts:31`) and to `computeRenderHash`. The two are never reconciled: nothing derives one from the other, and nothing asserts they agree.

Consequence: register a sixth fragment adapter and the compat digest does not move, so every consumer's triple-digest assertion passes while the compatibility matrix it pins is stale. Delete one and the compat doc keeps advertising it. ADR-0013's whole argument is that "the document, the toolkit and the published context are provably the same version"; that proof runs through a digest of a literal that no code path keeps honest.

Direction: derive the compat document from `listAdapters()`, or accept that it is documentation and stop pinning it.

### PAT-007 — `BlueprintRegistry` is declared twice, incompatibly, and the consumer sniffs five shapes of which one exists
Severity: Major
Confidence: Certain
Target: `src/adapters/model.ts:132`, `src/adapters/flux-utils.ts:558`

Evidence:
```
export type BlueprintRegistry = {  files?: …; readFiles?: …; roleModuleNameForRole?: …
  if (typeof registry.files === "function") return normalizeBlueprintFiles(registry.files(blueprintPath));
```

Problem: `src/blueprints/registry.ts:14` declares `BlueprintRegistry` as three required members — `root`, `packs`, `files()`. `src/adapters/model.ts:132` declares a different type of the same name with eight members, all optional, plus `[key: string]: unknown` — a type nothing can fail to satisfy. `blueprintRegistryFiles` (`flux-utils.ts:556–563`) then probes five shapes in order: `files()`, `readFiles()`, `instanceof Map`, `registry[path]`, `registry.packs[path]`. Only the first is produced anywhere in the repository. Five of `model.ts`'s eight members are nix-specific (`roleModuleNameForRole`, `moduleNameForRole`, `roleModuleNames`, `nixosHostRoles`, `nixos`) and no registered adapter reads any of them — `registry.ts:18` still declares a `"nix"` target that no adapter claims. This is one implementation behind a hypothetical seam, and the codebase's own rule from ADR-0016:24 applies: an abstraction with one consumer is shaped by that consumer.

Consequence: the cost is paid at the failure. `blueprintFiles` returns `[]` when the registry is unrecognised (`flux-utils.ts:547–551` only files a diagnostic when there is also no override root) and `[]` again when the pack directory is absent (`flux-utils.ts:550`). Under ADR-0015:60 — "a domain silently omitted from a render is a domain deleted from the cluster on the next reconcile" — the two indistinguishable empty returns are the failure mode the participants list was invented to prevent, reproduced one layer down and inside the toolkit.

Direction: one declaration, required members, and a thrown error where the five-way sniff currently returns `undefined`.

### PAT-008 — The pack seam has two owners: `flux-modules` owns the templates, this repo hardcodes 285 values, and an unknown placeholder is invented rather than rejected
Severity: Major
Confidence: Certain
Target: `src/adapters/flux-utils.ts:946`, `src/adapters/flux-utils.ts:615`

Evidence:
```
  return name.toLowerCase().replaceAll("_", "-");
    CERT_MANAGER_CHART_VERSION: "*",
```

Problem: ADR-0001 puts pack content in `flux-modules`, pinned by ref. The values that fill those packs' `${PLACEHOLDER}` slots live here, as a 285-entry literal inside `substitutionMap` (`flux-utils.ts:597–940`) — chart URLs, namespaces, intervals, ports, OTLP endpoints. Nothing records the contract between the two repositories. A placeholder added to a pack upstream does not fail; it falls through `substitutePlaceholders` (`flux-utils.ts:591–594`) into `placeholderFallback`, which returns `"false"` for anything ending `_ENABLED`, `"0"` for `_PORT`, and otherwise the placeholder's own name lowercased with hyphens. `substitutionMap:600` similarly defaults the cluster domain to `"example.invalid"` and the LAN ingress range to `"192.0.2.10-192.0.2.10"`. Fifteen `*_CHART_VERSION` keys are `"*"`.

Consequence: ADR-0007:124 requires substitution to stay "restricted to named placeholders with declared sources. Never a general template language," and chapter 10 makes writing a derived value as a literal a build error. This engine does the opposite of both: it invents a plausible literal for an undeclared source and renders successfully. The output is a valid-looking manifest with a made-up port or a hostname under `example.invalid`, and chapter 30's byte-identical-re-render property still holds over it, because the wrong value is deterministic. `CHART_VERSION: "*"` additionally means the render is reproducible while the cluster it produces is not.

Direction: an unresolved placeholder is the clearest possible build error; `placeholderFallback` is the line that converts it into a silent one.

### PAT-009 — `ExposureTier` is a closed union with a site name in it, published in the JSON Schema, rivalling the open `routeTiers` map chapter 20 assigns from
Severity: Major
Confidence: Certain
Target: `src/deployment/model.ts:14`, `src/cluster-context/schema.ts:17`

Evidence:
```
export type ExposureTier = "public-frankfurt" | "lan";
    routeTiers: Record<string, { class: "public" | "lan"; hostnamePolicy: …
```

Problem: the same concept has two representations. `ClusterContext.routeTiers` is an open map keyed by tier id, carrying `class`, `hostnamePolicy`, `authModes` and `requiredLabels` — this is the shape chapter 20's assignment catalogue reads when it assigns a fully-qualified hostname from "exposure `name` + tier `hostnamePolicy` + cluster domain", and the shape `fragment-model.ts:198` validates against. `ExposureTier` is a two-value closed union in the IR, one of whose values names a physical site. It is not internal: `schemas/deployment.ts:494` emits it as `enum: ["lan", "public-frankfurt"]` and `schemas/deployment.ts:1380` emits `required: ["public-frankfurt", "lan"]`, so the published `deployment.schema.json` **requires** a reachability document to carry a channel named after Frankfurt. `deployment/model.ts:122` keys `channels` by it, and `render/traefik.ts:12` and `render/gatus.ts:49` compare against the string literal directly.

Consequence: this is the abstraction that will be wrong first. CONTEXT.md defines a Tier as "a named class of external exposure" and chapter 40's `E_NO_TIER_FOR_AUDIENCE` presumes tiers are data. Adding a second public tier, adding a second cluster (chapter 40 open item 3), or renaming the Frankfurt site is a breaking change to a published JSON Schema under exact-version lockstep — which by PAT-010 means republishing both OCI contexts and bumping the pin in every consumer repository, for a change that in the cluster-context representation is one map entry.

Direction: one representation of a tier, and it is the one that is already data.

### PAT-010 — The schema version *is* the npm package version, so every patch release invalidates the estate; ADR-0013 cites the code as its own justification
Severity: Major
Confidence: Likely
Target: `src/cluster-context/schema.ts:77`, `docs/adr/0013-schema-version-lockstep.md:7`

Evidence:
```
  if (ctx.spec.schemaVersion !== installed) {
A document declares an exact `schemaVersion` that must equal the installed
```

Problem: `getPackageVersion()` (`schema.ts:63`) reads `package.json`'s `version`, and `validateClusterContext` requires the document's `schemaVersion` to equal it exactly. There is no separate schema version. The repository uses release-please with conventional commits, so a `fix:` in `flux-utils.ts` produces `0.22.1` and every published context and every consumer pin becomes invalid, for a change with no schema impact. ADR-0013's decision paragraph justifies the rule by pointing at the line that implements it — "as `src/cluster-context/schema.ts:77` already enforces" — which is the contract documenting what the code happens to do rather than the code following the contract. The ADR's own cost paragraph then records the resulting live skew: `0.16.0` in four service repos, `0.20.0` in one, `0.22.0` in the contexts. Meanwhile `spec/v1/40-composition.md:237` writes `schemaVersion: 1.0.0` in the CompositionLock and `spec/v1/10-service-intent.md:36` writes the same in a Service document — both of which are only satisfiable if the npm package is at exactly `1.0.0`, i.e. for one release.

Assumption stated: I am assuming release-please's default conventional-commit behaviour (patch on `fix:`); `release-please-config.json` was not read.

Direction: an artefact schema and a package build are different things changing at different rates; one version number cannot mean both.

### PAT-011 — The delivery-class boundary has no representation in the Fragment shape the spec declares normative
Severity: Major
Confidence: Certain
Target: `spec/v1/30-deliverables.md:22`, `spec/v1/40-composition.md:194`

Evidence:
```
{ path: string, content: string, adapter: string }
| no object is claimed by both delivery classes | `E_CLASS_BOUNDARY_CONFLICT` |
```

Problem: ADR-0019 and chapter 50 split every Deliverable into class A (applied by an Aggregator via server-side apply) and class B (reconciled by Flux), and chapter 50:49 states "the boundary is enforced, not documented: an object's class decides its applier, and both claiming one object is a build error." The normative Fragment carries three fields and none of them is the class. `AdapterDefinition` (`src/adapters/registry.ts:21–30`) carries `name`, `target`, `input`, `status`, `defaultPath`, `render` — no class either; `target` is the output subsystem (`edge`, `flux`, `vault`), which cuts across the class split rather than encoding it. `E_CLASS_BOUNDARY_CONFLICT` therefore has nothing to evaluate. The same gap applies to `deploy.jorisjonkers.dev/deployer`: chapter 50:105 makes the prune pass a label query, so the label must be on every applied object, but which Aggregator deploys a Service comes from `Aggregator.deploys` — a composition fact. That makes the deployer label a layer-2 assignment, and it does not appear in chapter 20's assignment catalogue (`20-resolved-deployment.md:127–152`), which is declared normative.

Consequence: two of the mechanisms the delivery model depends on — the class invariant and the prune inventory — are asserted at a boundary the data model does not cross. The likely outcome is that the label gets injected by post-processing the rendered YAML in the aggregator workflow, which breaks chapter 30's byte-identical-re-render property at exactly the point the property is needed, since the tree that is hashed stops being the tree that is applied.

Direction: if an object's class and its deployer decide what happens to it, both are fields of the thing that carries it.

### PAT-012 — Node label keys are hardcoded in TypeScript, duplicating the data ADR-0009 moved into YAML
Severity: Minor
Confidence: Certain
Target: `src/cluster-context/schema.ts:47`, `src/cluster-context/schema.ts:100`

Evidence:
```
const KNOWN_NODE_LABEL_KEYS = new Set([
    if (!KNOWN_NODE_LABEL_KEYS.has(key)) {
```

Problem: ADR-0009 decides that "a node is described once, in YAML," and that "a capability must exist on some node before a Service may require it. Adding a capability is a node-declaration change, which is the right place for it." `assertNodeLabelsOnAllowlist` enforces an eight-entry allowlist compiled into the toolkit and applied to the public ClusterContext's own `labels.allowed` map. So there are two allowlists: the data one the ADR describes, and this one gating it.

Consequence: adding a capability is not a node-declaration change. It is a toolkit release, which under PAT-010 is a republication of both OCI contexts and a pin bump in every consumer repository. The ADR's stated cost model for adding a capability is wrong by that whole chain.

Direction: the allowlist that gates a data file should be in the data.

### PAT-013 — The package's public surface is ~120 symbols including a documented test helper, under exact-version lockstep
Severity: Minor
Confidence: Certain
Target: `src/index.ts:164`, `src/adapters/fragment-model.ts:100`

Evidence:
```
  loadFragmentInputFromPaths,
/** Same as loadFragmentInput but without the ambient-env prohibition (test/dev helper). */
```

Problem: `src/index.ts` is 179 lines of re-export and nothing else. Alongside the intended contract it exports `listYamlFilesRecursive`, `extractImageRefs`, `isDeterministicRuntime`, `withDeterministicRuntime`, `deterministicTimestamp`, `scanAllStringFields`, and `loadFragmentInputFromPaths` — the last explicitly commented as a dev helper that skips `forbidAmbientAdapterInputs`, the guard `fragment-model.ts:67` exists to make adapter inputs explicit. A public API this wide is not an API; it is the module list.

Consequence: every one of these is a compatibility surface that a consumer may pin against, in a package where the version number is also the estate's schema version. The specific hazard is `loadFragmentInputFromPaths`: a consumer reaching for the convenient overload silently disables the ambient-input prohibition that ADR-level determinism depends on, and nothing marks it as unsupported.

Direction: an export list is a decision; this one has not been made.

### PAT-014 — Shipped documentation describes a command surface and an adapter that do not exist
Severity: Minor
Confidence: Certain
Target: `README.md:73`, `docs/adapters.md:14`

Evidence:
```
npx deploy-config-schema compile --env production --sources deployment-sources.yml …
- `nix-hosts`: renders fleet inventory into `platform/flake.nix`, generated NixOS host defaults …
```

Problem: `src/cli.ts` dispatches twelve commands — `validate`, `init`, `expand`, `render-plan`, `bundle`, `hosts`, `collections`, `resolve-sources`, `render-flux`, `artifact`, `adapter-contract`, `render`. `compile`, `parity`, `lock`, `state` and `cutover`, all documented in README with worked invocations, are not among them. `nix-hosts` is documented as an implemented adapter and is not in `registry.ts`; the residue is still in the tree — `registry.ts:18` keeps a `"nix"` target no adapter claims, and `render-plan/paths.ts:35` still allocates `"nix-hosts": "platform"`. `package.json:34–42` ships `docs/` and `README.md` to consumers.

Consequence: the documented contract and the implemented contract have drifted in both directions, and the artefacts recording the drift (`AdapterTarget`, the allocator table) read as live extension points to the next person adding an adapter.

Direction: `adapterContract()` already exists and is exported; the adapter list in `docs/adapters.md` should come from it.

### PAT-015 — Three rival authorities decide an output path, and one of them makes a decision inside layer 3
Severity: Minor
Confidence: Certain
Target: `src/render-plan/paths.ts:29`, `src/render-plan/plan.ts:176`

Evidence:
```
      const known: Record<string, string> = {
  const observability = platform.packs?.observability;
```

Problem: chapter 30:132 states paths as a formula — `<gitopsRoot>/apps/<reconcileUnit>/<service>/<fragment>.yaml` — and says "the existing allocator already encodes the shape." It does not. `existingAdapterPath` is a nine-entry lookup keyed by adapter name, `AdapterDefinition.defaultPath` is a second hardcoded absolute-ish path per adapter (`registry.ts:40`, `:51`, `:62`, …), and `allocatorPath` (`plan.ts:133`) picks between them. Chapter 30's own open item 4 notices the two disagree about the `platform/` prefix without noticing that there are two. Separately, `gatusGroup` (`plan.ts:175–178`) inspects whether the observability pack contains gatus and returns `"observability"` or `"utility-system"`, which then becomes a path segment — a branch taken during serialisation, which chapter 30:12 forbids: "If a renderer has to choose, the choice belongs one layer up."

Consequence: a decision made here appears in no schema and is recorded in no lock, so a Service owner reading `resolved.yml` cannot see why their Gatus ConfigMap moved. Combined with PAT-005's missing collision check and prune-on-omission, a path that silently changes group is a delete plus a create.

Direction: one allocator, and the gatus group decided in layer 2 where it can be recorded.

## Out of lens
- `CHART_VERSION: "*"` across fifteen Helm packs is a supply-chain pin question as well as a seam question; the manifest/security lens should take it.
- `blueprintFiles` returning `[]` for a missing pack directory (`flux-utils.ts:550`) is an operational deletion risk under Flux prune, beyond the type-shape point in PAT-007.
- Chapter 10:190 calls `domain` "the unit of Intent Fragment publication" while chapter 40:28 says "the unit of publication is a **repository**, not a domain"; the participants list in 40:204 is keyed by neither consistently.
- "Fragment" carries three meanings across CONTEXT.md, `adapter-compat.ts` and ADR-0015 (adapter output / service-published input / OCI publication unit); CONTEXT.md disambiguates two of the three.
- Chapter 10:463 derives `replicas` from "`minAvailable` and capacity" while chapter 20's purity rule forbids reading observed capacity; chapter 20 open item 3 already flags it.
- `plannedAdapterContracts = Object.freeze([] as const)` is exported through `adapterContract()` as `planned: readonly []` — a public contract field that can only ever be empty.
- `spec/v1/00-overview.md:186` counts 328 of 364 objects attributable; that arithmetic depends on the adapter set the graph shows is half unreachable (PAT-002) and was not independently recounted here.
