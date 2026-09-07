---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/40-composition.md#versioning
rests-on: ["0007"]
---

# The artifact schema is semver; composition accepts a range

## Rests on
A minor model bump only adds vocabulary, so a fragment written against minor
*m* renders identically under every toolkit minor ≥ *m* within the same major.
False if: two toolkit minors sharing a major produce different render hashes
from the same fragment and the same pinned inputs. Settled by: render the
pinned estate inputs once per published toolkit minor within a major and assert
`computeRenderHash` (`src/artifact/contract.ts:41`) is equal across the set —
one inequality falsifies the range and forces a major bump.

## Why
`schemaVersion` becomes the data model's own semver, starting at `1.0.0` and
bumped only on model change: major when a field is removed or its meaning
changes, minor when vocabulary is added, patch when wording is clarified with
no field change. It stops tracking `package.json`, which today supplies it via
`getPackageVersion()` in `src/cluster-context/schema.ts:75-79`. Composition
admits a fragment whose major equals the toolkit's *and* whose minor is ≤ the
toolkit's; `E_SCHEMA_VERSION_MISMATCH` fires on those two conditions only.

The rule exists to kill an amplification that equality creates and no earlier
decision names. Review finding B3 — three independent reviewers — records it:
`spec/v1/40-composition.md:105` asserts `schemaVersion == installed toolkit`
inside the resolve stage, and `:128` routes any failure to *"no ComposedIntent.
Nothing renders."* Under the union that is estate-wide, not local: one stale
participant blocks every aggregator, including the aggregator shipping the fix,
and `dormant: true` exempts a participant from `maxAge`
([0038](0038-participants-list-staleness.md)) but not from the version assert.
`CHANGELOG.md` carries 26 releases between 2026-06-09 and 2026-08-20 — ten
weeks — each of which would open roughly ten Renovate PRs post-v1 that must all
merge before anything renders. The superseded lockstep decision (0013 in the
old set) was written about per-repo skew and never revisited for the union.

Determinism survives because admission and reproduction are different jobs. The
range governs what composition accepts; the lock records the exact resolved
fragment versions and the exact toolkit version that produced the
`ComposedIntent`, so a replay runs the versions that actually ran, not the
range that admitted them ([0037](0037-composition-oci-fragments.md)). Minor >
toolkit stays a hard stop because the union is silent about what it drops — a
fragment using vocabulary an older toolkit cannot read would compose with the
unknown fields discarded and exit zero. Two spec artifacts become legitimate
rather than accidental here: `spec/v1/40-composition.md:237` and
`spec/v1/10-service-intent.md:36` both write `schemaVersion: 1.0.0`,
satisfiable today only while the package sits at `1.0.0` — it is `0.22.0`.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Equality over the union (the status quo assert) | 26 releases in ten weeks × ~10 Renovate PRs each, all red until both contexts republish; one stale or dormant participant halts every aggregator including the one carrying the fix | The estate already demonstrates skew is survivable — `0.16.0` in four service repos, `0.20.0` in `stalwart-provisioner`, `0.22.0` in the contexts, and it functions; the assert forbids what reality tolerates and fails closed over the whole union |
| Same major, any minor (caret range, minor > toolkit allowed) | A fragment at `1.4.0` composed by a `1.2.0` toolkit renders with the unrecognised fields dropped; a declared volume, grant or dependency edge silently leaves the tree and every gate passes | Trades a loud estate-wide stop for a silent per-Service under-render, which no digest, exit code or ledger detects; a stop is recoverable, a missing PVC is not |
| Version the composition rather than each fragment | Every participant republishes whenever the composed model moves, since one number covers all of them | Equality by another name; it reproduces exactly the all-must-merge round this decision removes |
| Record the accepted range in the lock instead of exact versions | Lock is smaller and human-readable; replay re-resolves and may legitimately pick a different admitted version | Breaks byte-identical replay at the only moment it matters — reconstructing what production actually ran |

## Reversibility
Undo cost today: `schemaVersion` is one constant plus one comparison in
`src/cluster-context/schema.ts` and one resolve-stage assert in composition —
tightening back to equality is two files and hours, and no fragment is
published to OCI yet, so nothing outside this repository breaks. Becomes
irreversible once: production locks reference fragments spanning more than one
minor; tightening to equality then rejects fragments already composed and
deployed, stopping every aggregator at once — the failure this decision exists
to prevent, reached by undoing it.

## Consequences
- A toolkit release that leaves the model alone no longer forces a
  republish-and-pin round across about ten repositories — saved by every consumer
  owner; paid by no one.
- A model change must now be classified major/minor/patch by hand, because
  `package.json` no longer does it by accident — paid by the toolkit maintainer
  (joris), once per model change.
- `E_SCHEMA_VERSION_MISMATCH` must name which rule fired and on which fragment
  and digest; a gate whose message says the wrong thing is the one people learn
  to ignore — paid by whoever implements the resolve stage.
- An aggregator on an older toolkit cannot compose a fragment written against a
  newer minor and must upgrade first — paid by that aggregator's owner, at the
  cadence set in [0040](0040-renovate-ordering-gate.md).
- Reproducibility now depends on the lock rather than on the assert, and the
  lock grows by two version strings per participant — paid by the composition
  implementation.
- Fixtures and worked examples may carry a literal `schemaVersion` instead of a
  generated one — saved by the spec author.
