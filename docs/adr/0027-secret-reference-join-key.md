---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#secret-references
rests-on: ["0009"]
---

# A secret placeholder byte-matches a granted path

## Rests on

Every Secret Store path an author may grant is a string that can appear
verbatim between `${secret:` and `#`: it contains no `#`, and the string written
as `path:` is the string the derived Vault policy names. False if: a grantable
path contains `#`, or a mount exists whose authored grant path differs from the
path its policy stanza must address. Settled by:
`grep -h ' path:' $(git ls-files '*.service.yml') | grep '#'` returns nothing
over the composed union, and for each distinct mount in that list (`secret/`,
`transit/`) `vault policy read` on the derived policy shows the grant string
unchanged.

## Why

The old design left the join key unstated. Grants are written
`secret/data/platform/postgres` (`spec/v1/examples/knowledge.service.yml:26`);
the placeholders that bind them are written `${secret:platform/postgres#kb.user}`
(`spec/v1/examples/knowledge-api.base.env:22`). Something strips the mount and
the KV-v2 `data/` segment, and neither the old credential-provisioning ADR nor
chapter 10 says what. Ten placeholders across three example env files rely on
that unwritten rewrite.

The rewrite does not generalise. `spec/v1/examples/auth-api.service.yml:50`
grants `transit/keys/auth-api-jwt`, which has no `data/` segment at all: a rule
keyed on `data/` has no defined behaviour there, and a rule that drops the first
two segments yields `auth-api-jwt`, a string that could equally be produced by a
KV path. `E_UNAUTHORISED_SECRET_REFERENCE` (`../../spec/v1/40-composition.md`)
can therefore be satisfied by a grant the author did not intend — and that check
is the only place the grant boundary is enforced at build time, since under
[0009](0009-vault-read-is-per-path.md) the store enforces nothing below the path.

Byte equality removes the transform instead of specifying it: the composer
compares two strings, needing no mount table, no engine taxonomy and no read of
live Vault contents, which the pinned-input purity rule
([0006](0006-pinned-inputs.md)) forbids it anyway. Because the grant unit is the
path ([0023](0023-grant-unit-is-the-path.md)), the path is also the correct join
key — the `#<key>` half selects which value fills the variable and confers
nothing. Non-KV engines take no placeholder: a transit key is never materialised
into an env var or a file, so `delivery: self` is its only legal delivery
([0026](0026-delivery-env-file-self.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Specify the strip rule (`secret/`, then `data/`) in chapter 10 | the composer carries a mount-aware rewrite table, one row per engine, extended whenever a mount is added; `transit/` needs its own row today and an unknown future mount has no row at all, leaving the check undecidable for it | it re-encodes Vault's API-path layout inside the composer to save authors 12 characters, and the review found the unstated version already produced a check satisfiable by the wrong grant |
| Placeholder names a per-Service alias (`alias: pg` on the grant, `${secret:pg#kb.user}`) | a second name-space per Service, unique across both declaration levels, and a join key that drifts when the alias is renamed on one side only | the old credential-provisioning ADR rejected a separate `SecretAccess` document for exactly this reason — "a join key that can drift, with no compensating benefit" — and an alias reintroduces it inside one file |
| Grant declares the env var name; the env file carries only the key | the shared Service-level grant on `platform/postgres` can no longer serve two Workloads that name the variable differently, so shared grants split per Workload and the sharing the two levels exist for is lost | `knowledge` writes `DB_HOST` and `n8n` writes `DB_POSTGRESDB_HOST` from the same Postgres; keeping the variable name in the env file is the whole point of the placeholder mechanism |

## Reversibility

Undo cost today: ten placeholders in three example env files, one grammar
sentence in chapter 10, and one string comparison in the composer — under an
hour. Blast radius is build-time only: no rendered object carries a placeholder,
because the renderer resolves `${secret:…}` keys into `envFrom` secretRef
entries before anything is applied. Becomes irreversible once: the composer
accepts both the long and the short form for compatibility — from that point the
byte-match check no longer exists, and restoring it breaks whichever files chose
the other form.

## Consequences

- Placeholders get longer: `${secret:secret/data/platform/postgres#kb.user}`
  where the old form wrote `${secret:platform/postgres#kb.user}` — paid by
  service authors, once per placeholder, at authoring time.
- `E_UNAUTHORISED_SECRET_REFERENCE` and the dead-grant check become string
  comparisons over the composed union, with no mount table and no Vault read —
  paid by the composer, which gets smaller.
- One `grep -r` over env files finds every reader of a path, which is what makes
  the reader-set roll-impact model of [0009](0009-vault-read-is-per-path.md)
  auditable from the repository — paid by nobody.
- A `transit/` or other non-KV grant with `delivery: env` or `file` is a build
  error — paid by authors of self-rotating services, who must fetch at runtime.
- Renaming a path edits the grant and every placeholder naming it in lockstep —
  paid by whoever moves paths during the Secret Subtree layout
  ([0023](0023-grant-unit-is-the-path.md)).
- The placeholder embeds the mount's API path, so remounting the KV engine or
  moving off KV-v2 rewrites every placeholder in the estate — paid by the
  platform, at mount-migration time.
