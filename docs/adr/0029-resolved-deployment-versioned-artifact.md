---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#the-resolved-deployment
rests-on: ["0003"]
---

# The Resolved Deployment is a versioned, reviewable artifact

## Rests on

The Resolved Deployment, emitted per render and validated against its own
versioned schema, is byte-stable for identical pinned inputs, so a diff between
two renders shows exactly the platform decisions that changed and nothing else.
False if: two renders of the same Intent against the same pinned context and
locks differ — map ordering, timestamps, absolute paths — because a diff
carrying that noise is not a review surface. Settled by: render one Service
twice from the same lock and context into `/tmp/a` and `/tmp/b`, then
`diff -r /tmp/a /tmp/b` (empty settles it) and
`ajv validate -s schemas/deployment.schema.json -d /tmp/a/<service>.yml`.

## Why

The middle layer already has a schema; what it lacks is a version and a reader.
`schemas/deployment.schema.json` is 1,297 lines and pins `apiVersion` to the
bare const `deployment.jorisjonkers.dev` — no version segment at all — while
five sibling schemas in the same directory carry one (`cluster-context/v1`,
`artifact-contract/v1`, `adapter-compat/v1`, `cluster-composition-lock/v1`,
`kustomization-health/v1`). The only versioned deployment apiVersion in the
tree is `deployment.jorisjonkers.dev/v2`, and it names the wrong layer: it is
the authoring shape's constant, at `src/deployment/v2-model.ts:65`. That is how
incompatible documents came to share one name: the resolved shape
(`spec.workloads` as a map with `credentials[].claim`, `hooks`, `safety`;
verified at lines 47, 838, 1058 and 1104 of that schema) and the collection
shape, whose `spec.deployments[]` items embed a copy of that same schema, `$id`
and all (`schemas/collection.schema.json:45-61`), both pin the bare const, while
the authoring shape (`spec.workloads` as a list) pins `/v2`.
`validate deployment <file>` dispatches on the bare const (`src/cli.ts:343`),
so it resolves to the third and rejects the first on `/apiVersion`. The estate
wrote that up as a trap rather than fixing it.

The point of naming the middle layer is that a reviewer reads a diff of the
Resolved Deployment and sees what the platform decided on their behalf — a claim
about a document somebody holds. This repository already contains one such
resolved tree, `fixtures/deployment/golden/`, and
`grep -rn 'deployment/golden' test/ scripts/ .github/ package.json` returns
nothing: no test, no script and no workflow reads it. An artifact produced and
never diffed is the documented-but-unversioned option wearing a directory name.
So the decision is the emission and the gate: every render writes the artifact,
CI validates it against the schema and diffs it against the previous render,
and that diff is part of the change under review.

The version makes the diff legible over time. It is the data model's own semver
([0039](0039-artifact-schema-versioning.md)), not the package version, so a
field appearing in an artifact is attributable to a model change and not a
release. The artifact records the pinned inputs it came from
([0006](0006-pinned-inputs.md), the cluster-state snapshot of
[0034](0034-cluster-state-pinned-input.md) among them), so a non-empty diff
separates into "the inputs moved" and "the derivation moved". And because the
registered adapters accept the Resolved Deployment and nothing else
([0053](0053-adapter-port-contract.md)), an adapter change cannot relocate a
decision into layer 3 unnoticed: an empty artifact diff across it proves that.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Three layers, middle layer documented but unversioned | nothing to build and nothing to run, but the renderer's output drifts from the documented shape with no artifact to catch it, and every consumer negotiates compatibility per incident | without a CI artifact the rule cannot fail, and a rule that cannot fail is a preference |
| Emit the artifact but leave it unversioned | gives the reviewer the diff while denying every consumer a compatibility statement; a shape change is discovered by a downstream parse error, and the fix is per consumer | this is exactly what the bare `deployment.jorisjonkers.dev` const already does, and it is why two documents share one name |
| Reuse `deployment.jorisjonkers.dev/v2` for the resolved artifact | zero new schema and no new version to maintain; the CLI keeps one dispatch arm | that identifier is the authoring shape's (`src/deployment/v2-model.ts:65`); reusing it re-creates the collision this decision exists to end |

## Reversibility

Undo cost today: the schema exists, so undoing means deleting an emit step, a
CI validate-and-diff job and the version field — one workflow file, one command
path, a handful of fixtures; hours, and the review surface is the whole loss.
Becomes irreversible once: a service repository or a second aggregator pins a
Resolved Deployment schema version or reads a published artifact of its own
accord — the middle layer is then a contract with consumers this repository
cannot enumerate, and its shape moves only under the compatibility rule.

## Consequences

- A third schema to version and keep honest — paid by this repository's maintainers.
- Every render emits and validates an artifact, and CI gains a diff step per Service — paid by the aggregator's pipeline, in wall time on every change.
- A reviewer sees what the platform decided on their behalf, including decisions nobody asked for — paid by reviewers, who read a second document per change.
- `validate deployment` is ambiguous by construction and needs a per-layer name; scripts spelling the old one break — paid by tooling authors.
- Byte-stability stops being an aspiration: any non-determinism in the renderer surfaces as diff noise and must be fixed before the gate is trusted — paid by the renderer's maintainers.
- `fixtures/deployment/golden/` becomes the conformance baseline rather than decoration, regenerated with intent whenever a derivation changes — paid by whoever changes one.
- The published version is a promise, so a layer-2 field addition goes through the compatibility rule rather than a single PR — paid by anyone adding one, and by the ledger consumers of [0055](0055-bidirectional-ledgers.md).
