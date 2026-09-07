---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/30-deliverables.md#adapters
rests-on: ["0003"]
---

# The registered adapters are v1; the second generation is deleted

## Rests on

The 16 adapters registered in `src/adapters/registry.ts` are the only renderer
any entry point reaches, and `src/deployment/render/` contributes nothing a
consumer can observe. False if: a reachability walk from `src/index.ts` or
`src/cli.ts` reaches a module under `src/deployment/render/`, or a rendered
tree loses an object when that directory is removed. Settled by: `grep -rn
"render/" src/ | grep -v '^src/deployment/render/'` returns only the literal at
`src/artifact/contract.ts:52` and no import; then diff a full estate render
taken before and after the deletion commit.

## Why

Two complete renderer generations coexist here and only one runs: the entire
`src/deployment/render/` tree — 14 modules, 1,967 lines — is reachable from
neither entry point, and its only importers are 11 test files. It is
nonetheless inside the quality bar. `package.json` runs `c8 --all --include
"dist/src/**/*.js" --check-coverage --lines 90 --branches 80`, so those 1,967
unreachable lines count toward the gate guarding every pull request: dead code
satisfies the quality gate.

The design was therefore costed against the wrong artefact.
`spec/v1/30-deliverables.md:85` records `PodDisruptionBudget` 6 as *"no
adapter, no renderer"* and `ServiceMonitor` 8 / `PodMonitor` 2 /
`PrometheusRule` 1 as *"exists but is **not** a registered adapter"*. Both rows
are false: the registered `kubernetes` adapter pushes `pdb.yaml`,
`servicemonitor.yaml` and `podmonitor.yaml` at
`src/adapters/kubernetes.ts:44-62` and builds the PDB from
`rollout.availability` at `:376-388`. The table is wrong on two of its four
rows, and `spec/v1/60-setup.md:18` sequences bootstrap step 6 off it — *"22 of
the 36-object coverage gap"* — a number matching neither generation. Nor was
the "cheaper half" cheap: the unregistered renderers consume `ProjectModel`
while the registry hands adapters an `AdapterContext` of raw artifact
documents, so registering `networking` and `prometheus` is a port across the
seam — the work of writing `rbac` — and a new `availability` adapter would
claim `pdb.yaml` from the incumbent, the collision chapter 30 calls a build
error and `grep -rn E_PATH_COLLISION src/` finds nowhere (0 hits).

Deleting the tree also retires nine defects verified as written inside it —
among them every egress policy blocking DNS, hook Jobs with `backoffLimit: 0`
and no TTL, sidecars losing ports and mounts, and an HPA fighting
`spec.replicas`. None describes production behaviour today; all nine go live
the moment that tree is promoted. The surviving generation is not clean —
`src/adapters/kubernetes.ts:1` is `// @ts-nocheck`, 10 files across `src/` carry
the pragma under `"strict": true` — but that debt sits on live code.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Promote `src/deployment/render/`, delete the registry | Port 16 registered adapters onto `ProjectModel`, rewrite every consumer of `adapterContract()` and the CLI's adapter output, then fix all nine latent defects before the first production apply | Pays to repair code that has never rendered a live object, and discards the generation the estate's rendered objects actually come from |
| Keep both; register `render/` modules one at a time | Two live ports across the `ProjectModel`/`AdapterContext` seam, plus an `E_PATH_COLLISION` implementation that does not exist (0 hits), before the first duplicate `pdb.yaml` | This is the status quo, and the status quo produced a coverage table wrong on two of four rows and a bootstrap schedule costed against neither generation |

## Reversibility

Undo cost today: `git revert` of one deletion commit restores 14 modules, 1,967
lines and the 11 test files importing them; under an hour, blast radius zero,
since nothing in `src/` imports the tree and no rendered object changes either
way. Becomes irreversible once the adapter port in
[0053](0053-adapter-port-contract.md) changes shape: a restored `ProjectModel`
module then fails to compile, and the revert becomes a rewrite.

## Consequences

- The 16 registered adapters are the normative v1 set, enumerated only by
  `adapterContract()`; no renderer ships unregistered — paid by the maintainer.
- Nine latent defects and the eleven findings against that tree close as moot —
  paid by the reviewer who would otherwise triage them.
- Anything salvageable — the networking and Prometheus behaviour — re-enters
  through [0053](0053-adapter-port-contract.md) as costed new work against
  `AdapterContext`, never as free registration — paid by the toolkit maintainer.
- Chapter 30's coverage table is re-derived from `adapterContract()` and chapter
  60's step 6 re-sequenced against the corrected number — paid by the spec author.
- The 90% line gate is re-measured over reachable code only, and is not lowered
  if the number falls — paid by whoever lands the next pull request.
- `E_PATH_COLLISION` stays unimplemented, and is now the sole guard against a
  second adapter claiming `pdb.yaml` that [0054](0054-adapter-attribution.md)
  needs — paid by the toolkit maintainer, within
  [0059](0059-v1-scope-stopping-rule.md)'s budget.
