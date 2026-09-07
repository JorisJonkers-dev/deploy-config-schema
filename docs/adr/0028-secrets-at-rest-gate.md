---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/60-setup.md#secrets-at-rest
rests-on: ["0002"]
---

# Secrets at rest gate env and file delivery

## Rests on

With `--secrets-encryption` enabled on the pinned k3s version, a Secret written
afterwards is ciphertext in the datastore file, so a reader of that file or of a
backup of it cannot recover the value. False if: a Secret created after enabling
is still recoverable from that file, or the flag cannot be enabled on the
pinned version without a datastore rewrite that loses data. Settled by: enable
the flag, `kubectl create secret generic canary --from-literal=k=<sentinel>`,
then `sudo strings <datastore file> | grep <sentinel>` returning nothing while
`kubectl get secret canary` still returns it — file per the datastore kind
recorded by [0057](0057-datastore-and-restore.md). The premise is
[0002](0002-kubernetes-as-substrate.md): this claim is a property of the
Kubernetes datastore, not of a Vault grant, and 0057 is what supplies the
`secretsEncryption` fact the gate reads.

## Why

The old credential-provisioning ADR closed its consequences with this:
*"`delivery: env` and `delivery: file` require Kubernetes secrets-at-rest
encryption before they ship. No `--secrets-encryption` configuration exists in
`nix-config` or the bootstrap tree, so a Kubernetes Secret is currently
plaintext base64 in etcd, while the agent-inject path being replaced never
touches etcd. `self` and `custody` are unaffected — nothing is persisted."*
Shipping `delivery: env` before the flag lands is therefore not an unmet goal
but a **security regression against what runs today**.

The exposure is not marginal. `delivery: env` is what every worked example
except `auth-api` uses — `spec/v1/examples/knowledge.service.yml` carries it at
lines 29, 35 and 90 plus a `delivery: file` SSH key at line 124, and
`spec/v1/examples/platform-postgres.service.yml` at line 114, while `auth-api`'s
three grants are all `self`. And the item has been written three times without
acquiring an owner: the old ADR ended it *"This is its own decision and its own
work item"*, naming no owner, number or date; `spec/v1/00-overview.md` lines
158–161 repeat it as open item 2, and `spec/v1/60-setup.md` line 145 as an
unticked pre-apply checkbox. This is that work item: owner **joris**, target
**before any `delivery: env` ships**.

The gate is mechanical because three prose restatements failed.
`secretsEncryption: true` becomes a fact of the pinned Cluster Context, beside
the datastore kind and k3s flags [0057](0057-datastore-and-restore.md) makes
required fields, and the renderer refuses `delivery: env` and
`delivery: file` against a context lacking it with `E_SECRETS_AT_REST_REQUIRED`.
Reading a pinned input rather than the live cluster keeps the check inside
layer-2 purity ([0034](0034-cluster-state-pinned-input.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Ship `env`/`file` now, keep secrets-at-rest as a checklist line | every Secret rendered before the flag lands is plaintext base64 in the datastore and in every backup taken meanwhile; closing it later needs a `secrets-encrypt reencrypt` pass **and** rotation of everything already written, since the old copies sat readable | the checklist has now been written three times (old ADR, `00-overview` open item 2, `60-setup` pre-apply list) and produced no owner and no date; nothing mechanical stopped a render |
| Restrict v1 to `delivery: self` until encryption lands | each consumer must speak Vault itself — `auth-api` does via spring-cloud-vault, the knowledge ingest worker and the postgres init path do not; the hand-written injector annotations in twelve files stay in service indefinitely | it makes the toolkit unable to express the estate's most common delivery ([0026](0026-delivery-env-file-self.md)) and defers the encryption work rather than dating it |
| Check at apply time (admission policy or a deployer-side probe) | the failure surfaces per Service in a cluster after a merge, and the deployer needs a live cluster read that layer-2 purity forbids | the pinned context already carries the fact; checking it at render costs one predicate and keeps the failure in the author's loop |

## Reversibility

Undo cost today: one predicate in the renderer, one required context field, one
error code and its negative fixture — under an hour, and nothing rendered
changes, because the gate only ever refuses. The encryption is the
asymmetric half: once Secrets are encrypted the datastore reads only with
`/var/lib/rancher/k3s/server/cred/encryption-config.json`, and disabling the
flag costs a re-encrypt pass and a restart per server. Becomes irreversible
once: backups exist under encryption and the restore rehearsal of
[0057](0057-datastore-and-restore.md) depends on that key file — the gate stays
cheap to delete, key custody does not.

## Consequences

- `delivery: env` and `delivery: file` cannot ship until the flag is on and a
  pinned context advertises it — paid by joris, before the first such Service.
- Until then `delivery: self` is the only delivery for a sensitive value, so a
  consumer that cannot speak Vault has no path — paid by the authors of
  `knowledge` and `platform-postgres`.
- Every pinned Cluster Context gains one more required fact, asserted rather
  than measured: omitting it fails every env-delivering Service at once, and a
  false `true` defeats the gate silently, so the settling command is run per
  cluster and recorded — paid by the context maintainer.
- The encryption key file becomes restore-critical: a backup without it restores
  nothing readable — paid by joris under the restore rehearsal.
- The gate closes the datastore-file and backup path only; a token with API read
  still gets plaintext, so path grants ([0009](0009-vault-read-is-per-path.md))
  and RBAC stay the real boundary — paid by reviewers reading it as more.
