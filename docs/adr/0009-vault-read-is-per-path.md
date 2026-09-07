---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/10-service-intent.md#secrets
---

# A Vault KV-v2 read grant covers the whole path

## Rests on

On this estate's KV-v2 mount, the `read` capability attaches to the API path
`secret/data/<path>`, and a token holding it receives the entire secret
document — every key — on each read; no policy stanza narrows a read to a key
subset of one document. False if: a policy can grant `read` on a strict key
subset of one KV-v2 document. Settled by: on the lab Vault, write a test
policy granting `read` on exactly one path, bind a Kubernetes auth test role
to it, and run `vault kv get` for that path with the resulting token,
inspecting a key outside the declared set — the premise falls only if the
store withholds that key.

## Why

The estate's production configuration already depends on this behaviour.
`cluster/flux/apps/data/vault/metrics-token-renewal.yaml` chose `patch` over
`update` for its self-roll job and records why: *"`-method=patch` forces the
HTTP PATCH path, which the `patch` capability allows without read access to
the other keys in this document. A read/modify/write fallback would need
`read` on the Discord webhook and Grafana client secret too."* That sentence
is only true if `read` is per-document: were a read scopable to one key, the
read/modify/write fallback would have cost nothing. The old
credential-provisioning ADR carried this quote as its patch-over-update
rationale, and so asserted this premise without naming it.

The spec contradicts the premise in the same tree today:
`spec/v1/16-dependencies.md:287` still claims the derived policy grants *"`read` on the granted path and keys only"* — a boundary the
store never enforces. Three worked examples granted three different key
subsets of `secret/data/platform/postgres`; under this premise every one of
those readers holds `read` on all of them, so `knowledge`'s pod could read
`auth-api`'s database password, and a roll-impact check computed over declared
key sets under-reports by the difference between the declared subset and the
document. The spec rewrite must therefore delete that row: what a `keys:` list documents
and what a grant confers are different things, and only the second is an access
boundary.

The blast radius is live, not hypothetical: `secret/platform/observability`
holds the Prometheus token, the Discord webhook and the Grafana client secret
in one document, so any reader of one of those keys today holds `read` on all
three.

## Alternatives

| option (rival premise) | cost if taken | why rejected |
|---|---|---|
| KV-v2 `read` can be scoped to a key subset by policy | `keys:` treated as an access boundary; roll-impact and unauthorised-reference checks computed over subsets the store never enforces; shared documents like `platform/postgres` stay merged while every reader silently holds its neighbours' credentials | Vault ACL capabilities attach to API paths, and KV-v2 serves one document per path; no stock policy syntax addresses keys within it — the production patch-over-update rationale exists precisely because of this |
| a broker (template, wrapper, sidecar) can slice documents per key | a bespoke proxy holding full `read` on every document it slices: a new single point of compromise whose slicing rules Vault's own ACL never audits | it concedes the store cannot enforce the boundary and moves it into unaudited code; the premise is about what the store enforces |

## Reversibility

Undo cost today: nothing in code — this is a premise about store behaviour. If
the lab test falsifies it, the decisions resting on it re-open:
[0023](0023-grant-unit-is-the-path.md) (grant unit), the Secret Subtree
one-path-per-reader-set layout, and the roll-impact computation — a spec edit
across chapters 10 and 16 plus the subtree layout, roughly a day's work.
Becomes irreversible once: the Secret Subtree is laid out one path per reader
set and production consumers reference those paths — re-merging documents to
exploit a key-scoped capability would then mean rewriting every grant and
placeholder that names them.

## Consequences

- `keys:` documents and validates but confers nothing; an author must never
  read it as an access boundary — paid by service authors.
- The grant unit must be the path, and any two secrets with different reader
  sets must live at different paths — the Secret Subtree split decided in
  [0023](0023-grant-unit-is-the-path.md) — paid by joris in the layout pass.
- Existing shared documents (`platform/postgres`, `platform/observability`)
  must be split before the blast radius closes; until then every reader holds
  neighbouring credentials — paid by the migration owner.
- Roll-impact reporting computes over the readers of a path, never over
  declared key sets — paid by the toolkit renderer.
- One path per reader set multiplies paths, policies and sync objects as
  reader sets diverge — paid by the platform in object count and Vault policy
  churn.
