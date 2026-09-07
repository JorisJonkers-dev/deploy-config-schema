---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/40-composition.md#participants
rests-on: ["0001"]
---

# Participants are listed, bounded by seven days of staleness

## Rests on
A domain that has published nothing for seven days has stopped publishing by
fault, not by cadence. False if: a non-dormant participant routinely goes more
than seven days between publishes while everything about it is healthy — then
the bound fires on normal operation and gets ignored, which is worse than no
bound. Settled by: list each participant's published fragment tags with push
timestamps over 90 days (`oras repo tags` against the GHCR namespace) and take
the maximum inter-publish gap; the claim fails if any non-dormant participant
exceeds 7 days. Baseline today: `CHANGELOG.md` records 26 releases between
2026-06-09 and 2026-08-20 — 72 days, one every 2.8 days.

## Why
A render is only as current as the last publish, and a domain that has not
published does not contribute. That absence is dangerous here specifically
because **Flux prunes**: a domain silently omitted from a render is a domain
deleted from the cluster on the next reconcile, and the render would look
entirely valid. `E_PARTICIPANT_MISSING` and `E_PARTICIPANT_STALE` are what stand
between a missed publish and a deletion. Apply-before-prune under
[0042](deferred/0042-apply-before-prune-inventory.md) does not cover this: it makes prune
run over an inventory that is *correct*, and a render missing a whole domain is
correct — it simply does not contain it.

Deriving the expected set from inbound references was considered and is
insufficient. A leaf Service that nothing depends on can vanish without breaking
any reference, and leaves are the majority — `immich`, `jellyfin`, `sonarr`,
`radarr`, `bazarr`, `prowlarr`, `qbittorrent`. Those seven media services are
depended on by nothing, so an inbound-edge derivation notices none of them going
missing. The expected set is therefore enumerated, and that enumeration is the
one central artefact that survives composition by fragments
([0037](0037-composition-oci-fragments.md)): it changes when a domain or test
project is added or retired, never when a declaration changes.

The old decision said "with a staleness bound" and the review flagged the
adjective. It is not academic: `spec/v1/40-composition.md:209` currently reads
`intent-media: {maxAge: 180d}`, so the media domain's publishing pipeline can be
broken for half a year — roughly 64 observed release intervals — before the
error that protects seven services from deletion fires. The default is
therefore **7 days**, about 2.5 observed intervals: long enough to absorb two
consecutive missed releases (2.5 x the observed 2.8-day interval), short enough
that a broken publish job is caught in the same week it breaks. A participant may override it with a
reason. `dormant: true` is the separate exemption, carrying a reason and a
review date like every other entry under
[0055](0055-bidirectional-ledgers.md); it exempts a participant from `maxAge`
and from nothing else — a dormant fragment still unions, and still satisfies the
version range of [0039](0039-artifact-schema-versioning.md).

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| No list; compose whatever published | Zero to build. A domain whose publish job breaks is pruned from the cluster on the next reconcile, from a render that passes every one of the 26 invariants | Makes a broken pipeline indistinguishable from a retirement, at the one moment the consequence is deletion |
| Derive the expected set from inbound dependency edges | Free — the edge graph already exists in chapter 16. Costs the seven media leaves, which have no inbound edges and would vanish undetected | The majority of the estate is leaves; a guard blind to the majority is not a guard |
| Keep the written 30/90/180-day per-domain bounds | No edit. `intent-media` tolerates a 180-day outage, `intent-nodes` 30 | A bound 64× the interval it protects fires only after the damage it exists to prevent |
| Let `dormant: true` exempt the version check too | Removes the republish burden on a domain nobody is touching | A dormant fragment still unions into `ComposedIntent`; exempting it means a fragment the toolkit cannot read is merged anyway |

## Reversibility
Undo cost today: `participants.yml` is one file plus the two error paths in the
composition resolver that read it. Deleting it removes a guard, not a capability
— no rendered manifest changes, no aggregator is touched, an afternoon. Changing
the number alone is a one-line default. Becomes irreversible once: retiring a
domain is performed *by* deleting its row, at which point the list is the
estate's only enumeration of expected domains, with nothing left to rebuild it.

## Consequences
- A publishing pipeline that breaks fails composition within seven days instead
  of deleting a domain from the cluster — paid by the domain owner, who gets a
  red compose rather than a silent restore.
- One stale participant blocks every aggregator, including the one shipping the
  fix (OPS-009); the remaining lever is break-glass with an older lock under
  [0045](deferred/0045-break-glass-reporting.md) — paid by every other domain owner.
- A domain that genuinely publishes less often than weekly must carry an
  override with a written reason — paid by that domain's owner.
- Dormancy costs a reason and a review date and is reviewed as a ledger entry —
  paid by the platform owner at review time.
- A dormant domain must still be republished when it falls out of the accepted
  version range — paid by the owner of a repository nobody is otherwise
  touching, which is the least convenient party.
- Seven days is measured against this estate's cadence, not a general constant;
  a change in participant count or release rate invalidates it and the
  measurement has to be rerun — paid by the platform owner.
