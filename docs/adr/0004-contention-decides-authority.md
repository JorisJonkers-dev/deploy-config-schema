---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#authority
---

# Contention decides who declares a value

## Rests on

A value is platform-assigned if and only if it must be unique across the
estate or draws on a shared finite resource; every other value is
Service-declared — and this single test partitions every field in the model
with no residue. False if: any field needs a third category, or the authority
table needs an exceptions row to hold. Settled by: the table at
[../../spec/v1/20-resolved-deployment.md#authority](../../spec/v1/20-resolved-deployment.md#authority)
deriving every one of its rows from the rule alone, with no exception noted.

## Why

The estate had no test for where a field belongs, so fields landed wherever
the change that introduced them was being made. One hostname,
`kb.jorisjonkers.dev`, ended up declared in seven authoritative places across
three repositories — `homelab-inventory/catalog/reachability.yml`, three
`fleet-infra` edge and knowledge manifests, a bearer-token secret, and the
service's own `platform/deployment.yml` — plus hardcoded in
`ServicePermission.kt`. Two conformance tests exist for no purpose other than
detecting when those seven disagree. The guard was cheaper to write than the
fix, which is how the estate arrived here.

The rule replaces a per-field negotiation with a one-question test: does the
value contend? A hostname must be unique across the estate; a node slot is a
draw on a finite pool; those are assigned, with Service Intent expressing only
the need. A value only its own Service cares about contends with nothing, so
the Service declares it outright and the platform carries it through
untouched.

This record deliberately carries the rule and no field table. The old record
carried an illustrative worked list, and that list drifted four times against
later decisions without amendment — co-test sets, health paths, migration
strategy, and hostnames — the last recorded as open item 1 in
[../../spec/v1/00-overview.md](../../spec/v1/00-overview.md): chapter 20
separates *identity* (unique, declared, checked) from *pool* (finite,
assigned) "because not one live hostname is derivable from a Service Id". A
rule and a table have different lifetimes. The table lives once, at the
normative anchor, where every row must cite which half of the rule placed it;
that same open item is live pressure on the residue claim, which is why this
premise is open rather than settled.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Ownership-by-on-call: whoever gets paged for a value declares it | a fresh negotiation per field, re-run whenever the pager rotation changes | one of the two implicit rules actually in force while `kb.jorisjonkers.dev` accumulated seven authoritative declarations and two disagreement-detecting tests |
| Ownership-by-churn: whoever edits a value most declares it | authority migrates silently as a service matures and its churn moves; each migration is another declaration site | the other implicit rule in force; it is precisely how declarations landed "wherever the change was being made" |
| Enumerated authority table with no generating rule | every new field is a table negotiation, and the table becomes the decision | the old set ran this experiment: its worked list drifted four times, unamended, while still being cited as the authority |

## Reversibility

Undo cost today: reassign authority field-by-field in the chapter-20 table
(one file) and retire this premise — hours of editing, but the decisions the
index rests on it ([0010](0010-flat-service-identity.md),
[0018](0018-exposure-by-audience.md),
[0019](0019-registered-unmanaged-surfaces.md),
[0033](0033-assignments-published-back.md)) each lose their stated
justification and must restate their own.
Becomes irreversible once: service repositories author Intent against the
chapter-20 table — moving a field across the Intent/Resolved boundary after
that is a schema-shape change paid again in every consuming repository.

## Consequences

- Field placement stops being a negotiation: every proposed field answers the
  contention question before it enters the schema — paid by the author of the
  schema change.
- A service owner cannot read their own service's URL out of their own
  repository, so assignments must be published back rather than merely
  computed during a render ([0033](0033-assignments-published-back.md)) —
  paid by the platform, which owns the publish-back machinery.
- Six of the seven `kb.jorisjonkers.dev` declarations become derived, and both
  conformance tests become unnecessary rather than merely passing — paid by
  the migration that collapses the seven sites (joris).
- The authority table lives in exactly one place; records that need a field's
  placement link to the anchor instead of copying rows — paid by ADR authors,
  who give up local worked lists like the one that drifted four times.
- A field the rule cannot place falsifies the premise and forces a rule
  amendment, never a table exception — paid by the claim owner (joris).
