---
status: proposed
---

# Each Service's assignments are written back into its own repository

Composition writes every Service's resolved assignments into that Service's own
repository as a generated file, and opens a pull request when they change. The
file is generated, never hand-edited, and guarded by a drift check.

## Why

ADR-0003 makes contended values platform-assigned, which means a Service owner
cannot read their own hostname, namespace, placement or Secret Store paths out of
their own repository. ADR-0010 restates the same requirement for exposure. Both
depend on publish-back and neither specified it.

The estate already shows an owner their render during their own pull request: the
`deploy-preview` action posts a sticky comment, and `render-local.sh` computes the
same result locally through `@jorisjonkers-dev/deploy-check` — the same package CI
runs, *"so a local result and a CI result cannot disagree"*. That was not the gap.

The gap is an assignment that changes because of **someone else's** change. If
`auth-api`'s route tier changes, `knowledge`'s derived forward-auth middleware
changes with it, and nothing in the `knowledge` repository is touched. A sticky
comment on a pull request nobody is opening communicates nothing. A generated
file that arrives as a pull request lands the change where the consequence lands.

The discipline is one `homelab-inventory` already applies to `context/`:
committed, generated, never hand-edited, with `check-context-drift.mjs` proving it
matches its inputs. `render-local.sh`'s own header records what happens without
that check — a hardcoded schema version went stale by four minor releases and a
context digest by two republications.

## Consequences

- A commit-back mechanism is required, with write access to every participating
  repository, and it produces churn on every compose that changes an assignment.
- The file is a snapshot and goes stale between composes. The drift check is what
  makes it trustworthy, and without it this decision is worse than nothing —
  a stale file that looks authoritative.
- Pull-request noise is the cost of visibility. An assignment change that nobody
  needed to see still arrives as a review request.
