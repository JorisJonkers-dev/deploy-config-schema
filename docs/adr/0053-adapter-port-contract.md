---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/30-deliverables.md#the-adapter-port
rests-on: ["0003"]
---

# An adapter satisfies one typed port

## Rests on

The three adapter input shapes declared at `src/adapters/registry.ts:19` are not
three requirements: `deploy-config` is one entry of the `AdapterContext` (6
adapters), and `deployment-fragment` (5 adapters) is the same documents already
parsed and pinned, so one typed input covers all 16. **False if:** with the port typed and `@ts-nocheck` removed, an adapter
cannot compile because it needs a value reaching it only through the second
shape, or through an ambient read of env, clock or filesystem. **Settled by:**
`grep -n 'input:' src/adapters/registry.ts` to enumerate the declared shapes, then
`npx tsc --noEmit` with the port typed and the pragma deleted from the four
adapter files — zero errors settles it; any error names the missing input.

## Why

The seam has no contract today. `src/adapters/registry.ts:29` declares
`render: (input: never) => RenderResult`, under a comment two lines above saying
the entries are "intentionally heterogeneous". `never` accepts every function, so
`registerAdapter` type-checks any callable; both call sites launder the argument
through a double cast (`src/render-plan/plan.ts:123` and `:127`), and the runtime
check at `registry.ts:237` verifies only `typeof render === "function"`. Which of
three declared shapes an adapter receives is one hand-set string comparison,
`adapter.input === "canonical-artifacts"` (`plan.ts:122`); the five
`deployment-fragment` adapters match no branch of their own and fall through to
the `deploy-config` branch at `plan.ts:127`, and an adapter declaring the wrong
shape reads `undefined` at render time.

That untyped seam mispriced the v1 schedule. Chapter 30 costed `prometheus` and
`networking` as "working renderers that were never registered as adapters — 14
objects, and the cheaper half of the gap" (`spec/v1/30-deliverables.md:236-237`).
They are not the cheaper half: those renderers consume `ProjectModel`, while the
registry hands adapters an `AdapterContext` of raw artifact documents, so
registering one is a port across the seam — the same work as writing `rbac` from
scratch. [0052](0052-registered-adapters-are-v1.md) settles which generation
survives; this settles what it must satisfy.

The surviving generation is the worse-typed one, and the invariants the port
should carry are absent from it. Ten files under `src/` carry `@ts-nocheck`, four
of them registered adapters (`adapters/kubernetes.ts:1` and three flux adapters),
while `tsconfig.json:11` sets `"strict": true` and `eslint.config.js:33` sets
`ban-ts-comment: "off"` — the layering is defended and nothing fails when it is
violated. `grep -rn E_PATH_COLLISION src/` returns nothing, while the writer
applies each prepared file in turn (`src/render-plan/writer.ts:60-66`): two
adapters sharing a path both write, second wins, silently, both reporting
`action: "create"`. `kubernetes-workload-fragment` reads raw manifests from disk
inside render (`src/adapters/kubernetes-workload-fragment.ts:48-49`, `:236-247`);
under the port that read moves to the caller, which passes the parsed documents
in, as `loadFragmentInput` already does at `src/adapters/fragment-model.ts:95-98`.
Hence the contract — documents in, attributed Fragments out, deterministic, no
ambient reads, and a path claimed twice is a build error that exists in code.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `input: never` plus the hand-set discriminator | Zero now; four new adapters (`rbac`, `availability`, `prometheus`, `networking`) written against no contract | The first symptom is a rendered tree missing a Fragment, and under [0042](deferred/0042-apply-before-prune-inventory.md) a missing Fragment is a deleted object |
| Split into a discriminated union of the three declared inputs | Three signatures, both call sites, every future invariant implemented three times | Neither of the other two shapes adds information: `deploy-config` is one entry of the same context, and `deployment-fragment` is those documents parsed and pinned, so the union triples the surface and buys no expressiveness |
| Keep `ProjectModel` as the port, move adapters onto it | Retain a 1,477-line IR, port all 16 adapters | Its only field the renderers read is the raw artifact bundle; the deleted deliverables record's own rule applies — "an abstraction with one consumer is shaped entirely by that consumer" |

## Reversibility

Undo cost today: one type in `src/adapters/registry.ts` and two call sites in
`src/render-plan/plan.ts`; widening back to `never` and dropping the ratchet is
under an hour, blast radius the 16 registered adapters, all in this repository.
Re-narrowing later costs the port of every adapter written loose in between.

Becomes irreversible once: adapters outside this repository register through the
public `registerAdapter` export. The port is then a compatibility surface in a
published package that every out-of-tree adapter pins, so narrowing it means a
major toolkit release and a coordinated bump of that pin — a separate number from
`schemaVersion` ([0039](0039-artifact-schema-versioning.md)).

## Consequences

- Four registered adapters lose `@ts-nocheck` and must type-check under
  `strict: true` before v1 — paid by the toolkit maintainer, in the pass that
  deletes the dead generation.
- A `@ts-nocheck` file count that cannot increase becomes a CI gate; it starts at 10 and only falls — paid by whoever would have added the eleventh.
- `E_PATH_COLLISION` is implemented where the Fragment set is assembled, not at
  the writer, and the render hash preimage carries the adapter — paid by the
  toolkit maintainer; precondition for [0054](0054-adapter-attribution.md) and
  the coverage assertion in [0055](0055-bidirectional-ledgers.md).
- The adoption schedule loses its cheap half: registering `prometheus` and
  `networking` is adapter work — paid by the v1 programme, as schedule honesty
  rather than new cost.
- The test helper that skips the ambient-input prohibition stops being public — paid by test authors, who write the documents explicitly instead.
- Out-of-tree callers of `registerAdapter` change once, at the narrowing release — paid by those consumers.
