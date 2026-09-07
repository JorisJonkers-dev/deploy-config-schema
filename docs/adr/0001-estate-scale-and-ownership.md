---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/00-overview.md#the-estate
---

# The estate is one maintainer, one cluster, about thirty Services

## Rests on
The estate is operated by one regular human maintainer (one person across three
git identities, plus bot accounts), runs one production cluster, and comprises
about thirty Services across about ten repositories — and this holds for a
stated horizon of 24 months, until 2028-08-31. False if: a second regular human
maintainer (sustained commits or reviews, not a bot) or a second production
cluster appears before the horizon. Settled by: `git shortlog -sn --all` run
across every estate repository, re-checked at the horizon review date of
2028-08-31, counting humans with sustained activity and clusters serving
production traffic.

## Why
The repository record is unambiguous. `git shortlog -sn --all` in this
repository shows 35 commits by the one human identity; every other author is a
bot account (five of them, 99 commits between them, as of 2026-08-31). The red
team verified the same estate-wide: "`git shortlog --all` shows one human across
three identities (35 commits) plus bot accounts" (review/06-redteam.md,
RED-006). The physical estate is what RED-013 measured the design's value
against: "a 30-service, 7-node, one-cluster, one-user homelab that currently
runs." Reviewers who wrote "~30 separate repositories"
(`review/CONSOLIDATED.md:248`, `review/04-k3s.md:121`) were counting Services,
not repositories; the premise is ~30 Services in ~10 repositories, and the
horizon recount settles which.

This has to be the outermost premise because its absence was the review's
largest single root cause. Consolidated cluster C11 — "The design is scaled for
an organisation and an estate that do not exist" — collapses nine findings
(RED-001, 004, 005, 006, 010, 011, 013, OPS-016, and the k3s review's framing
section) into that one sentence. RED-006 itemises the machinery built for
separated authority: `owner` fields, `alertClass: page` notifier routing,
publish-back pull requests into "the owning repository", per-aggregator RBAC
where a workflow applying a Service it does not own gets a 403. Its verdict: "If
one person is every owner, then every publish-back PR is a self-review, every
ledger review date is a note to self, and the 403 protects the author from the
author." Every mechanism in this specification must therefore justify itself at
THIS scale — one maintainer, one cluster, thirty Services — not at the scale of
an imagined organisation.

The premise is dated, not permanent. A 24-month horizon is long enough to build
and operate v1 (the stopping rule in
[0059](0059-v1-scope-stopping-rule.md) fits inside it) and short enough that the
assumption is re-checked before it silently rots. RED-006's direction stands as
the working rule until the horizon or a falsifying observation: separate the
invariants that catch the maintainer's own mistakes from the ones that arbitrate
between people, and build only the first set until there is a second person.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Design for the team this might become | Complexity paid now for a future that may not arrive: RED-013's arithmetic put the already-specified organisation-scale build at 400–900 hours of one person's evenings, and RED-006 found "the controls that cost the most to build are the ones that deliver least at this headcount" | Nine review findings trace to exactly this premise having been assumed implicitly; making it explicit and rejected is the point of this file |
| Design for exactly today, with no horizon | Any growth — a second maintainer, a second cluster — falsifies undated assumptions silently, and the rework arrives unplanned and unbudgeted | A dated horizon costs one review entry per 24 months and turns "the estate outgrew the design" from a surprise into a scheduled observation |

## Reversibility
Undo cost today: edit this file and re-examine the six decisions whose
`rests-on` names it — [0013](0013-blueprint-packs-pinned-checkout.md),
[0037](0037-composition-oci-fragments.md),
[0038](0038-participants-list-staleness.md),
[0049](deferred/0049-aggregator-owned-tests.md), [0050](deferred/0050-exercises-and-deploys.md),
[0059](0059-v1-scope-stopping-rule.md) — a day of review, no code, no cluster
change. Becomes irreversible once: mechanisms sized to this premise are live in
production and a real second maintainer or second cluster exists; from that
point the premise cannot be quietly re-worded — each dependent decision must be
re-opened against the new scale, at whatever the estate has grown to cost.

## Consequences
- Every ADR in this set must justify its mechanism at one-maintainer,
  one-cluster, thirty-Service scale, and an ADR that cannot is wrong by
  construction — paid by the author of each ADR, at writing time.
- Invariants that arbitrate between people (self-reviewed publish-back PRs,
  RBAC protecting the author from the author) fall out of v1 scope; if a second
  maintainer arrives, those controls are missing on day one and must be built
  then — paid by that second maintainer and joris, at growth time.
- The horizon review on 2028-08-31 is a standing obligation: re-run the
  shortlog, recount clusters and Services, re-date or revise this file — paid
  by joris.
- A falsifying observation inside the horizon (second maintainer, second
  production cluster) forces re-examination of every decision resting here,
  ahead of schedule — paid by joris.
- The operational load the design creates lands on one person with no second
  pair of eyes for procedures executed under pressure (RED-006); the premise
  legitimises simpler procedures but does not staff them — paid by joris, at
  incident time.
