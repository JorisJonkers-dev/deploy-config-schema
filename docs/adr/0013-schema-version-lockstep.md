---
status: proposed
---

# Exact-match schemaVersion is retained; bumps are Renovate-driven behind an ordering gate

A document declares an exact `schemaVersion` that must equal the installed
toolkit version, as `src/cluster-context/schema.ts:77` already enforces. The
toolkit and both OCI contexts are published first, by hand and in order;
Renovate then raises the pin bump in each consumer, and a blocking CI gate fails
any consumer whose pinned version does not match the published context.

## Why

Exact match buys a guarantee worth keeping: the document, the toolkit and the
published context are provably the same version, so no combination can render
unexpectedly. In an estate whose stated habit is "verify the value, not the
command", that determinism is not ceremony.

The cost is real and was accepted with open eyes. `docs/contract-chains.md`
records it: *"A bump is therefore not one PR. It is: publish the new schema,
republish the OCI context, then update `schema-version` in every consumer"*, and
*"CI cannot validate a bump in every repo: `stalwart-provisioner`'s PR pipeline
never exercises the deploy path."* The 0.20→0.22 bump was proven by replaying
`deploy-artifact` by hand, and the first harness reported both configurations
failing until a known-good control was run alongside. Live skew at the time of
this decision is `0.16.0` in four service repos, `0.20.0` in
`stalwart-provisioner`, `0.22.0` in the contexts. An earlier attempt to remove
the constraint exists as the abandoned `feat/unversioned-contract` branch.

Renovate was chosen over bespoke orchestration because `renovate.json` is already
present in every repository and there is nothing to build.

## Consequences

- Renovate cannot be sequenced. Consumer PRs may appear before the contexts are
  republished and will sit red until they are. **A routinely-red Renovate PR is
  the thing people learn to ignore**, so the ordering gate's failure message must
  say plainly that the context has not been republished yet, rather than that the
  version is wrong.
- Steps one and two — publishing the toolkit and republishing both contexts —
  remain manual and unverified by CI. The verification that matters is reading
  `schemaVersion` back out of the pulled context by digest, not the publish
  step's exit code.
- The blocking gate is what prevents a repeat of the three-way skew. Without it
  this decision is the status quo.
