---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/60-setup.md#blueprint-packs
rests-on: ["0001"]
---

# Blueprint packs arrive by pinned checkout, not a registry

## Rests on

Every consumer of `flux-modules` pack content already obtains that repository
by checking it out at a pinned tag or ref; none resolves packs through a
package registry. False if: a consumer appears that can authenticate to a
registry but cannot run a git checkout of `flux-modules`, or an existing
consumer is found resolving packs any other way. Settled by:
`gh search code --owner JorisJonkers-dev "flux-modules" --match file` over
workflow files, confirming every hit obtains the content via a checkout
action at a ref and none via an npm or OCI pull.

## Why

The `flux-source` and `flux-packs` adapters need `flux-modules/packs/**` to
render source/release manifests and consumer-owned Flux pack files. Consumers
supply that content by checking out `flux-modules` at a pinned tag or ref and
pointing the toolkit at the checkout explicitly with `--blueprints-root <dir>`
or `DEPLOY_CONFIG_BLUEPRINTS_ROOT`. There is no implicit or default path —
machine-specific defaults make CI behavior depend on a developer workstation
layout. The caller may also pass `--blueprints-version <tag>`; that declared
tag is recorded in render-plan provenance so generated output traces back to
the `flux-modules` version used for pack resolution.

The estate evidence points one way. `flux-modules` is already consumed by
version tag/ref: its release workflow only echoes the tag, and the existing
JorisJonkers-dev/github-workflows actions consume `flux-modules` content by
checking that repository out at a ref. Private GitHub Packages access has
caused friction for `@jorisjonkers-dev` packages, so a registry dependency
would make pack resolution *less* reliable than the checkout every consumer
already performs. A pinned checkout also works offline once it exists in CI,
and the consumer controls the ref, which keeps rendering deterministic.

This deliberately diverges from [0037](0037-composition-oci-fragments.md),
where domain declarations compose from published OCI fragments. Packs are
exempt from that route for three reasons. They are already consumed by ref,
so the checkout adds no step a consumer does not run today, while OCI would
add one. The registry-auth friction is evidenced for `@jorisjonkers-dev`
packages, whereas fragment publication rides infrastructure composition
requires anyway. And packs are class-B foundation material delivered by Flux
([0048](deferred/0048-class-b-pinning.md)), consumed whole at render time by two
adapters — they are not domain declarations, join no composition union, carry
no lock digest, and hold no participants-list row. The exemption is a
material-class boundary, not a contradiction of the composition decision.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Publish `packs/**` as an npm or OCI artifact | Registry credentials in every consumer, a resolver in the toolkit, cache and offline handling | Auth friction is evidenced for `@jorisjonkers-dev` packages; adds a second consumption path beside the ref checkout every consumer already runs |
| Bundle a pinned pack snapshot inside this package | Every pack change requires a `deploy-config-schema` release; the bundled snapshot skews against the tag Flux delivers | Couples two release cadences and hides the effective pack version from the consumer |
| Implicit default checkout path | CI behavior depends on developer workstation layout | Machine-specific defaults break reproducibility; the explicit root is the whole point |
| Route packs through the [0037](0037-composition-oci-fragments.md) fragment pipeline | Digests, lock entries and a participants-list row for material that is never composed | Packs are foundation input to two adapters, not domain declarations; composition's invariants do not apply to them |

## Reversibility

Undo cost today: moving packs to OCI later costs a resolver in front of the
`flux-source`/`flux-packs` adapters (fetch by digest into a temp root) plus a
one-line change per consuming CI workflow — hours, not weeks, and provenance
already records a declared version, so the audit trail survives the move.
Nothing about the checkout model is irreversible.
Becomes irreversible once: no foreseeable event makes it so; the nearest
hazard is consumers baking checkout-relative paths beyond `--blueprints-root`
into their own tooling, which widens the migration surface without closing it.

## Consequences

- Consumers must check out or vendor `flux-modules` at the desired tag before
  rendering blueprint-backed adapters, via a pinned checkout step — paid by
  each consuming repository's CI configuration.
- No registry credentials to provision, rotate, or debug for pack resolution
  — paid for by the checkout step's wall time in every CI run, by consumers.
- A missing root, or a root without `packs/`, fails with a structured
  diagnostic instead of silently rendering empty pack output — paid by the
  toolkit, which owns that check.
- The declared tag is recorded, not verified: provenance holds what the
  caller passed, not what the checkout contains — paid by whoever audits a
  render, who must trust that CI pinned the checkout it declared.
- Two consumption models coexist: fragments arrive by OCI digest, packs by
  git ref — paid by every newcomer, who must learn where the boundary runs.
