---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/10-service-intent.md#grant-unit
rests-on: ["0009"]
---

# The grant unit is the path; the subtree splits per reader set

## Rests on

Every path in the live Secret Subtree can be split so no path holds keys for more
than one reader set, without leaving a consumer unable to read a value it needs.
False if: a path's keys cannot be separated — a document an engine writes whole
whose keys have different readers, or a consumer that reads by enumeration rather
than by named key. Settled by: a subtree audit — for every path in the composed
union, list each key's readers from the composed grant set and print every path
where two keys differ; plus the lab Vault read test settling
[0009](0009-vault-read-is-per-path.md).

## Why

Under [0009](0009-vault-read-is-per-path.md) a KV-v2 `read` returns the whole
document, so the only unit the store can enforce is the path. Three worked
examples grant three key subsets of one document — `auth-api`
`keys: [auth.user, auth.password]` (`spec/v1/examples/auth-api.service.yml:31`),
`knowledge` `keys: [kb.user, kb.password]` (`knowledge.service.yml:27`), the
`platform-postgres` exporter `keys: [exporter.datasource]`
(`platform-postgres.service.yml:112`) — and each holds `read` on all of them, so
`knowledge`'s pod can read `auth-api`'s database password. The old spec promised
otherwise, *"`read` on the granted path and keys only"*
(`spec/v1/16-dependencies.md:287` at review time); the store never enforced it.
`keys:` documents the expected keys and feeds validation — dead grants,
unauthorised references — and confers nothing.

The reader-set boundary can then only be drawn at the path, which fixes the
Secret Subtree layout: **no path may hold keys for more than one reader set**.
`secret/data/platform/postgres` splits per consumer, the `kb` and `auth`
credentials landing on separate paths. The rule also condemns
`secret/platform/observability` — Prometheus token, Discord webhook and Grafana
client secret in one document — whose own
`cluster/flux/apps/data/vault/metrics-token-renewal.yaml` records the consequence:
a read/modify/write fallback *"would need `read` on the Discord webhook and
Grafana client secret too"*.

Two checks follow. `E_ROLL_AFFECTS_OTHER_READERS` (`spec/v1/40-composition.md:175`)
computes over the readers of a path; over declared key sets it under-reports by the
difference between the subset and the document. And `keys: ['*']`
(`spec/v1/examples/auth-api.service.yml:39`) leaves the vocabulary: it is in no
field table and no invariant, and makes a reader set undecidable without reading
live Vault contents, which the pinned-input rule forbids.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Per-key grants: `keys:` is the access boundary and the policy narrows to it | a policy generator emitting stanzas KV-v2 has no syntax for, or a broker holding full `read` on every document it slices | impossible under [0009](0009-vault-read-is-per-path.md); the estate chose `patch` over `update` for exactly this reason |
| Keys as documentation of an unenforced narrowing — the state the review found | zero migration today; reader sets stay undecidable, roll impact stays under-reported, and three Services keep silent `read` on each other's credentials | it is the finding, not a design; a boundary nothing enforces is worse than none, because authors act on it |
| The renderer copies the needed keys into a per-Service path | a copy pipeline plus a second document to rotate per consumer — three copies for `platform/postgres` alone, each with its own staleness | duplicates the value and moves custody into the toolkit; the copy is a new secret nobody declared |

## Reversibility

Undo cost today: the vocabulary half is a spec edit in chapters 10 and 40 plus the
policy renderer — hours. The layout half is larger but still small: three grants
across three example Services, one live shared document, three readers; a split is
a Vault write, a grant edit, a `${secret:...}` placeholder edit and one rollout per
consumer. Becomes irreversible once: production consumers reference the split paths
and the merged documents are deleted — re-merging then means rewriting every grant,
placeholder and policy that names them, with no period during which both resolve.

## Consequences

- `keys:` must be read as documentation and a validation input, never as an access
  boundary — paid by service authors, who lose a narrowing they believed they had.
- One path per reader set multiplies paths, policies and sync objects as reader sets
  diverge — paid by the platform, in object count and policy churn.
- `secret/data/platform/postgres` and `secret/platform/observability` must be split
  before the blast radius closes — paid by joris, as migration work.
- `E_ROLL_AFFECTS_OTHER_READERS` becomes honest and fires more often, including on
  grants that compose cleanly today — paid by service authors.
- `keys: ['*']` is removed, so `auth-api` must enumerate the keys of
  `secret/data/auth-api`, and adding a key becomes a Service edit — paid by the
  `auth-api` owner.
- Reader sets become computable from the composed union without reading Vault, at
  the price of a new rejection for a grant naming an undeclared key — paid by the
  toolkit.
