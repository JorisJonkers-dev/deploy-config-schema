---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#access-tiers
rests-on: ["0009"]
---

# Access tiers derive the Vault policy

## Rests on

Every secret-touching workload in the estate holds exactly one of four
intents — `read`, `self-renew`, `self-roll`, `custody` — and the least
privilege each needs follows from the intent alone. False if: a workload needs
a capability set no tier's derivation produces, or two workloads on the same
tier need different capabilities. Settled by: enumerate every Vault policy
under `cluster/flux/apps/data/vault/` and every hand-written Agent Injector
annotation in the twelve files carrying them, classify each into a tier, and
diff the derived policy against the hand-written one — the decision falls on
any capability the derivation cannot produce, or produces in excess.

## Why

The tiers are read off production, not invented.
`cluster/flux/apps/data/vault/metrics-token-renewal.yaml` already distinguishes
renewal from minting and records why: *"Renewal is the normal path and needs no
privilege: `vault token renew` with no argument renews the token it
authenticated with, which every token may do. It also leaves the value
unchanged, so nothing downstream re-reads or restarts. Minting is the fallback
for a token already expired or revoked, and is the only reason this has a Vault
identity at all."* A single read/write axis cannot express that job: it grants
privilege to a self-renewer that needs none, and loses the lease-extension
versus value-replacement distinction that decides whether anything re-reads.

`self-roll` derives `patch`, never `update`, for a reason the same file
records: *"`-method=patch` forces the HTTP PATCH path, which the `patch`
capability allows without read access to the other keys in this document. A
read/modify/write fallback would need `read` on the Discord webhook and Grafana
client secret too."* Under [0009](0009-vault-read-is-per-path.md) that argument
is also the evidence a read covers the whole document. Once the Secret Subtree
is laid out one path per reader set — [0023](0023-grant-unit-is-the-path.md) —
that motivation relaxes: a roller of a single-reader path gains nothing it may
not already read. `patch` stays regardless, because it is still the smaller
capability and merged documents like `secret/platform/observability` outlive
the migration. Deriving rather than declaring makes the least-privilege choice
once, in the renderer, instead of a trap every author meets.

`custody` is a prefix grant because `agents-api` creates and deletes secrets at
runtime under `secret/data/agents/projects/<id>/repos/<id>`; those paths cannot
be enumerated at render time. That makes some tier-by-delivery cells illegal
rather than merely unusual: `custody` with `env` or `file` asks the renderer to
sync paths that do not yet exist, and `self-renew` with `env` gives a token with
no capability on its path a Secret it never reads. The schema refuses those; the
cell-by-cell table lives in chapter 10.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| a single `read`/`write` axis | one enum value fewer and no derivation branch, at the price of granting write privilege to the renewal job that today needs none, and of losing the lease-extension-versus-value-replacement distinction that drives rollout restarts — restart targets would have to be declared by hand on every grant | the production evidence contradicts it: the renewal job has a Vault identity *only* to mint, and its own file says renewal needs no privilege |
| authors declare Vault capabilities directly | maximum expressiveness, no tier vocabulary to maintain; every author must know that `patch` beats `update` on a shared document, and every review must re-derive it | it makes a one-time least-privilege choice a per-author decision; the estate's own annotations show the failure mode — twelve hand-written injector files, none reviewed against each other |
| `custody` as an enumerated path list | the grant stays a path grant, so [0023](0023-grant-unit-is-the-path.md) needs no prefix case and roll-impact stays exact | `agents-api` mints paths keyed by runtime ids; enumeration would require a control loop rewriting Service documents from cluster state, which inverts the authoring direction |

## Reversibility

Undo cost today: the tier vocabulary is a schema enum, one derivation branch in
the policy renderer, and one field per declared grant. Collapsing it to a
read/write axis is a few hours of work plus a rewrite of every `secrets` entry
in the estate's Service documents; every rendered Vault policy re-renders.
Becomes irreversible once: production tokens authenticate against derived
policies and the `self-renew` workloads run with no Vault privilege at all —
widening the axis then means re-granting write privilege to identities that
hold none, and re-auditing every path they can reach.

## Consequences

- A self-renewing workload gets an identity with no capability on its path,
  matching what the renewal job needs today — paid by the renderer, which emits
  a role with an empty policy rather than skipping it.
- Rollout restart targets follow from tier and rotation tolerance rather than
  being declared — paid by the platform, which owns the derivation.
- Four tiers times three deliveries is twelve cells and not all are legal, so
  authors meet refusals for combinations that read as plausible — paid by
  service authors and by chapter 10, which keeps the table current.
- `custody` is unvalidatable against a placeholder or path list, so its blast
  radius is bounded only by the prefix — paid by whoever reviews such a grant.
- An intent no tier expresses cannot be worked around by an author: it is a
  schema change and a renderer change — paid by joris.
