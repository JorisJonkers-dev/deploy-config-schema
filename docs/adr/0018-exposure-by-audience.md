---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#exposure
rests-on: ["0004"]
---

# Exposure is declared by Audience, in one closed vocabulary

A Workload declares exposure as a surface carrying an **Audience**, and per-path
audiences where they differ. Hostname, route tier, middleware, IngressRoute,
reachability entry and health endpoint all derive from that one declaration.

## Rests on

A hostname is unique across the estate and so is assigned under
[0004](0004-contention-decides-authority.md); the audience of a surface is
contended by nobody and so is declared — and one closed vocabulary of four values
(`anonymous`, `authenticated`, `internal`, `lan`) covers every routed surface in
the estate. False if: a routed surface needs an audience the set cannot express,
or two consumers of one surface need audiences that cannot both derive from one
declaration. Settled by: mapping every `route.authMode`, `auth.scope` and tier
`authModes` value onto exactly one audience, rendering all four routed services,
and asserting the derived IngressRoutes match those served today, zero unmapped.

## Why

One hostname, `kb.jorisjonkers.dev`, was declared in seven authoritative places.
Six become derived here: the reachability channel, both edge catalogs, both
Traefik IngressRoutes, and the Gatus endpoint. The two conformance tests that
existed only to detect their disagreement become unnecessary, not merely green.

The deeper defect was that one concept carried three disjoint vocabularies:

| where | values |
|---|---|
| service `route.authMode` | `anonymous`, `sso`, `forward-auth` |
| tier `authModes` | `forward-auth`, `internal`, `lan` |
| rule `auth.scope` | `anonymous`, `authenticated`, `application` |

Only `forward-auth` and `anonymous` appeared in two of them; `sso`, `internal`,
`lan`, `authenticated` and `application` each appeared in exactly one — seven
distinct values across three vocabularies. Because the
values were never comparable, the gate that should have caught this could not —
and it did not fire anyway. `validateDeploymentSemantics` checks `authMode`
against a tier only `if (tier && …)`: `src/deployment/v2-model.ts:199-203` takes
the tier from the optional `route.expose?.tier` and skips the check when it is
absent, and three of the four routed services declare no `expose.tier` at all —
`auth-api` (`anonymous`), `agents-api` (`sso`) and `home-portal` (`anonymous`),
every one on a public `*.jorisjonkers.dev` hostname whose only tier permits
`forward-auth` alone. `E_ROUTE_AUTH_MODE_NOT_IN_TIER` was implemented, had an
error code, and was vacuous exactly where it mattered.

One Audience vocabulary, shared by Services and route tiers, makes that class of
bug impossible: the two can no longer say the same thing in different words.
Undeployed hostnames are bounded by [0019](0019-registered-unmanaged-surfaces.md).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the three vocabularies; make `expose.tier` required and add a mapping table between them | every routed service repository is edited — the same migration cost as this decision — plus a hand-maintained 3×7 mapping table | the table is a fourth authority free to drift from the three it joins, and the gate it repairs already existed, had an error code, and was vacuous |
| Author the hostname on the Service and derive nothing | zero migration; seven declarations stay, and the two disagreement-detecting conformance tests stay with them | the hostname is unique across the estate, so [0004](0004-contention-decides-authority.md) assigns it; this is the status quo that produced the seven-way split |

## Reversibility

Undo cost today: hours — one spec edit, four modules that read `authMode`
(`src/deployment/v2-model.ts`, `src/adapters/fragment-model.ts`, and the Traefik
route and edge-catalog fragment adapters), old fields still standing alongside,
four routed services affected. Becomes irreversible once: those
repositories drop `authMode` and `auth.scope` and the edge catalogs and Gatus
ConfigMap stop being authored — restoring them means re-authoring six derived
artefacts by hand from a render that no longer emits them.

## Consequences

- Six of seven hostname declarations stop being authored — paid by the platform,
  which owns assignment and every artefact repeating it.
- Hostnames leave the Service repository, so the Resolved Deployment must be
  published back ([0033](0033-assignments-published-back.md)) — paid by the
  aggregator, since owners cannot otherwise locate their own service.
- `authMode`, `auth.scope` and tier `authModes` are all replaced, and the edge
  catalogs plus the Gatus ConfigMap stop being authored — paid by the four routed
  service owners, in one coordinated migration.
- The health endpoint derives from the same declaration as the route, so a
  monitored and a served surface can no longer disagree — paid by observability
  authors ([0021](0021-observability-scrape-and-alert-class.md)).
- `E_ROUTE_AUTH_MODE_NOT_IN_TIER` is deleted rather than repaired — paid by
  reviewers, who read a shrunk error set as a fixed defect, not a lost check.
