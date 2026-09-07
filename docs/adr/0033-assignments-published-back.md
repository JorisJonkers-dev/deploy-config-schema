---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#publish-back
rests-on: ["0004"]
---

# Assignments are published back to the owning repository

Composition writes every Service's resolved assignments into that Service's own
repository as a generated file and opens a pull request when they change. The
file is generated, never hand-edited, and guarded by a drift check that fails
the build when it disagrees with a fresh compose.

## Rests on

An assignment can change because of an edit in a *different* repository, and
when it does there is no event in the owning repository for a render-time
mechanism to attach to — so a committed artefact is the only channel that
reaches the owner. False if: every assignment change is caused by a change in
the repository that owns the assignment, in which case the existing preview
comment already covers it. Settled by: raise `auth-api`'s route tier on a
branch, compose, and assert a pull request appears in the `knowledge`
repository whose diff shows the changed derived forward-auth middleware, with
no commit to `knowledge` in between; then hand-edit that file and assert the
drift check exits non-zero.

## Why

[0004](0004-contention-decides-authority.md) makes contended values
platform-assigned, so a Service owner cannot read their own hostname,
namespace, placement or Secret Store paths out of their own repository. Two
earlier records reached the same conclusion from opposite ends and neither
specified the mechanism: the contention record's consequences state *"A service
owner cannot read their own service's URL out of their own repository. The
Resolved Deployment must therefore be published back to the owning repository,
not merely computed during a render"*, and the exposure record — now
[0018](0018-exposure-by-audience.md) — repeats it, noting *"This is now the
second decision to require that … and it is no longer optional"*.

The estate already shows an owner their render during their own pull request.
The `deploy-preview` action posts a sticky comment on the owner's own pull
request, and `render-local.sh` computes the same result locally through
`@jorisjonkers-dev/deploy-check` — the same package CI runs, *"so a local result and a CI result cannot disagree"*. That was never the
gap. The gap is an assignment that changes because of **someone else's**
change. If `auth-api`'s route tier changes, `knowledge`'s derived forward-auth
middleware changes with it and nothing in the `knowledge` repository is
touched. A sticky comment on a pull request nobody is opening communicates
nothing. A generated file arriving as a pull request lands the change where the
consequence lands.

The discipline is one `homelab-inventory` already applies to `context/`:
committed, generated, never hand-edited, with `check-context-drift.mjs` proving
it still matches its inputs. `render-local.sh`'s own header records what
happens without that check: a hardcoded schema version went stale by four minor
releases and a context digest by two republications. A generated file with no
drift check is that outcome by construction.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Preview comment only (status quo) | zero new machinery, no write credentials, no PR noise | it fires only when the owner opens a pull request; the `auth-api` → `knowledge` case produces no pull request in `knowledge`, so the one class of change publish-back exists for is exactly the class it misses |
| A queryable read-only view of all assignments | a service to build, host, authenticate and keep available — including during the incident when someone needs it | nothing arrives; the consumer must already know to look, and not knowing to look is the failure mode |
| Commit straight to the default branch, no pull request | saves review latency and roughly one workflow step per repository | the change lands unseen; the diff *is* the notification, and a silent commit buys the file without buying the visibility |
| Publish the file without a drift check | saves one check invocation per CI run | a snapshot nobody verifies is worse than no file: it looks authoritative while being stale, which is the `render-local.sh` outcome quoted above |

## Reversibility

Undo cost today: delete one generated file and one workflow step per
participating repository (~30), plus the commit-back job and its credential —
an hour or two, and nothing at apply time reads the file, so the blast radius
is what owners can read locally, not what the cluster runs.
Becomes irreversible once: anything consumes the published file as an *input* —
a consumer's CI job, a runbook step, or a render that treats it as source
rather than output — at which point removing it breaks builds instead of
removing a convenience.

## Consequences

- A commit-back mechanism holds write access to every participating repository, so a bug in composition can open a pull request in all of them at once — paid by the platform owner, in credential custody and blast radius
- Pull-request noise is the cost of visibility: an assignment change nobody needed to see still arrives as a review request — paid by every service owner
- The file is a snapshot and goes stale between composes; the drift check is the only thing making it trustworthy — paid by whoever reads it during an incident if the check is ever skipped
- Hand-editing generated assignments becomes a build failure rather than silent divergence — paid by owners who used to patch rendered output in place
- "What is my hostname, namespace, or Vault path" becomes a `grep` in the owner's own checkout, with no render and no cluster access — paid for by the composition run that produces the file
