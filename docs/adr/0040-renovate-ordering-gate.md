---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/40-composition.md#version-rollout
rests-on: ["0007"]
---

# Version bumps ride Renovate behind an ordering gate

## Rests on

Every repository holding a version pin already runs Renovate against the file
that pin actually lives in, so the bump arrives as a PR without new automation
and the only machinery this decision builds is the gate that orders it. False
if: a pinning repository carries no `renovate.json`, or its manager pattern
names a file no workflow reads — the bump then never appears, or appears
unchecked, and nobody enforces the ordering while every run reports success.
Settled by: for each consumer, fetch `renovate.json` and compare its
`managerFilePatterns` against both the `paths:` filter and the `yq` read path
of that repository's gate workflow; every pair must name the same file.

## Why

The rollout half of the superseded lockstep record is retained because the
sequence it describes is real work that somebody performs today. Under exact
match — `src/cluster-context/schema.ts:77` throws `E_SCHEMA_VERSION_MISMATCH`
when `ctx.spec.schemaVersion !== getPackageVersion()` — a bump was never one
PR. The estate's contract-chains note recorded it: *"A bump is therefore not
one PR. It is: publish the new schema, republish the OCI context, then update
`schema-version` in every consumer"*, and *"CI cannot validate a bump in every
repo: `stalwart-provisioner`'s PR pipeline never exercises the deploy path."*
The 0.20→0.22 bump was proven by replaying `deploy-artifact` by hand, and the
first harness reported both configurations failing until a known-good control
was run alongside. Live skew at the time was `0.16.0` in four service repos,
`0.20.0` in `stalwart-provisioner`, `0.22.0` in the contexts; `package.json`
still reads `0.22.0`. An earlier attempt to drop the constraint entirely
survives as the abandoned `feat/unversioned-contract` branch.

[0039](0039-artifact-schema-versioning.md) changes what the gate compares, not
whether one exists. `schemaVersion` becomes the data model's own semver and
composition accepts same-major with minor ≤ toolkit, so the gate checks a range
rather than a string, and a release stops moving the pin. That is the
difference between routine and estate-blocking: `CHANGELOG.md` carries 26
releases in ten weeks, and under equality each one post-v1 would open roughly
ten consumer PRs that all had to merge before anything rendered — one stale
participant blocking every aggregator, including the one shipping the fix.
Under a range, most releases open no PR at all, and the ones that do fail
closed on a model change rather than on a patch number.

The gate is the work, and this decision says so rather than claiming there is
nothing to build. Renovate was chosen because `renovate.json` is already
present in every repository, not because the rollout is free: two manual
publish steps and a blocking gate remain, and wiring the gate to the file
Renovate edits has already gone wrong once. As specified,
`spec/v1/examples/renovate.json:8` manages `/^aggregator\.yml$/`, while
`aggregator-gate.yml:15` filters on `pins.yml` and both it (`:38`) and
`aggregator-deploy.yml:61` read `yq -r '.pins.composedLock' pins.yml` — so a
bump touches a file no workflow reads, triggers no gate, and on merge triggers
no deploy, every run green. That is what the settling command catches.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A bespoke orchestrator that publishes the toolkit, republishes both contexts, then opens consumer PRs in dependency order | one new workflow plus a cross-repository token, and an ordering graph that must be maintained as participants join and leave ([0038](0038-participants-list-staleness.md)) | it buys ordering, which the gate already enforces by refusing to merge early, and pays for it with credentials that can write to every repository in the estate |
| No gate: let composition fail closed at resolve on the version assert | zero build cost; the assert already exists and already refuses to emit a ComposedIntent | the failure lands after merge, on the aggregator, as "nothing renders" for the whole estate rather than one red check on the PR that caused it — this is exactly the three-way skew that produced `0.16.0`/`0.20.0`/`0.22.0` |
| Auto-merge Renovate bumps once green | removes the human wait entirely and closes the window in which skew accumulates | green before the contexts are republished is meaningless, and a bump that merges itself removes the only reader of the gate's message; the composed-lock rule already states a bump "is never grouped and never auto-merged: the gate must run and a human must read it" |
| Keep manual bump PRs, no Renovate manager | nothing to configure; the release operator opens each PR | it is the status quo that produced the skew, and it scales with participant count at the moment [0037](0037-composition-oci-fragments.md) makes one stale participant everyone's problem |

## Reversibility

Undo cost today: delete one reusable gate workflow and the manager stanza from
each consumer's `renovate.json` — under ten repositories, hours. The blast
radius is what replaces the signal: skew stops being visible before merge and
reappears at resolve, as estate-wide unavailability rather than a red check.
Becomes irreversible once: the publish steps move to a bot or a schedule and
the gate's message is the documented procedure, so no human holds the ordering
knowledge — removing the gate then removes the only record of the order.

## Consequences

- Renovate cannot be sequenced, so consumer PRs may appear before the contexts are republished and sit red until they are — paid by consumer repository owners, in PRs that are red for a reason that is not their fault.
- The gate's failure message must say the context has not been republished yet, not that the version is wrong; a routinely-red Renovate PR is the thing people learn to ignore — paid by whoever writes the gate, in wording it cannot get lazy about.
- The two publish steps stay manual and outside CI, verified by pulling the context by digest and reading `schemaVersion` back out of it — never by the publish step's exit code — paid by the release operator, once per bump.
- A stale pin fails every PR in that repository, not only the bump, so unrelated work queues behind a republish — paid by that consumer's authors.
- Under [0039](0039-artifact-schema-versioning.md)'s range the gate computes compatibility rather than comparing strings, so it needs the toolkit version available at gate time — paid by this repository, which must publish that number somewhere the gate can read.
- Bumps become routine: most of the 26-releases-in-ten-weeks cadence opens no consumer PR at all — paid back to consumer owners, at the cost that a genuine model change is now rarer and therefore less rehearsed.
- Without the gate this decision is the status quo — paid by whoever debugs the next resolve failure with three versions live in the estate.
