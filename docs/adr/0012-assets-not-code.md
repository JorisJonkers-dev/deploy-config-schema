---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#assets
rests-on: ["0005"]
---

# File-shaped configuration is an Asset; code is not configuration

## Rests on

[0005](0005-derivation-is-total.md), applied to files: every file-shaped
configuration in the estate is expressible as static text in the consuming
application's own format, optionally threaded with named placeholders whose
sources are declared — never logic. False if: a configuration file surfaces
whose content requires more than placeholder substitution to produce (a
conditional block, a loop, a computed value). Settled by: re-running the
ConfigMap census — `kubectl get configmap -A -o yaml` — and classifying every
data key as fixed, derived catalog, or mixed; one key needing more than named
substitution falsifies the claim.

## Why

Eighteen `ConfigMap` objects existed on the cluster, and they were three
unrelated things. **Six fixed files** with zero derived values:
`postgresql.conf`, `enabled_plugins`, `cors.ini` + `single-node.ini`, `gatus`
`config.yaml`, `hermes` `sources.conf`, `stalwart` `config.json`. **Five
derived catalogs**, which are Deliverables rather than configuration:
`gatus-endpoints` (41 derived references in 288 lines),
`platform-edge-route-catalog` (30/163), `platform-edge-catalog` (28/146),
`grafana-datasources` (6/104), and `postgres-init-script` (18/98 — it creates
one database and user per consuming service, which the dependency graph
already knows). **Seven mixed files**, a large static body threaded with a few
derived values — `rabbitmq.conf` most starkly, with exactly one derived line
out of twenty-four: `auth_oauth2.issuer = https://auth.jorisjonkers.dev`, a
hostname belonging to another service. The Asset covers the first and third
classes: a declarative settings file in the application's own format, with
optional substitution of named placeholders — the same restricted mechanism
env files use ([0011](0011-configuration-env-files-per-workload.md)), never a
template language. The second class leaves configuration entirely and renders
as Deliverables.

Scripts are the opposite case. `garage` and `hermes` run `alpine:3.21`
executing scripts supplied by ConfigMaps: `hermes-bootstrap` is 221 lines of
shell, `n8n-hooks` is 499 lines of JavaScript. That is first-party code with
no image, no tests and no version, and it belongs in an image. The boundary is
mechanical, not a judgement: an Asset may not be executable and must be a
declarative settings file in the consuming application's own format
(`spec/v1/10-service-intent.md:477` makes an executable Asset a build error).
`postgres-init-script`'s reliance on `/run/secrets/<name>` — a Docker Compose
convention that does not exist in Kubernetes — is a sign of how long
code-shaped ConfigMaps go unexamined.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Bake the fixed files into images | A derived image, build pipeline, registry entry and Renovate rule per service; a rebuild on every upstream bump; and, because `rabbitmq.conf` carries a derived hostname, a route change becomes an image rebuild | Every one of those services runs a third-party image (`pgvector/pgvector:pg17`, `rabbitmq:4.2-management-alpine`, `twinproduction/gatus`, `stalwartlabs/stalwart`, `couchdb`); only ten images in the estate are first-party, and none are these |
| Admit executable Assets (scripts in ConfigMaps) | `hermes-bootstrap` (221 lines of shell) and `n8n-hooks` (499 lines of JavaScript) stay unversioned, untested first-party code invisible to CI and Renovate | Code without an image, tests or a version is the defect, not a convenience |
| A general template language for Assets | Conditionals and arithmetic make an Asset a program the platform cannot validate, and every file format grows a second syntax | Substitution stays named placeholders with declared sources, shared with env files; nothing else |

## Reversibility

Undo cost today: `assets` is a short per-Workload list in the Service Intent;
dropping the boundary means editing the Assets section of chapter 10 and the
intent files of the six-plus-seven services carrying fixed and mixed files —
hours, blast radius one spec section and those Service repositories. Becomes
irreversible once: the code-shaped ConfigMaps are deleted in favour of built
first-party images — resurrecting script-in-ConfigMap then means extracting
code back out of images and re-creating exactly the unversioned state this
decision removes.

## Consequences

- The six fixed files and the static bodies of the seven mixed files are
  authored as Assets, derived values as named placeholders — paid by the
  owning Service repositories, once each.
- The five derived catalogs stop being hand-maintained configuration and are
  rendered as Deliverables — paid by the platform's renderer work.
- `hermes-bootstrap`, `n8n-hooks` and their `alpine:3.21` hosts need
  first-party images before v1 can render the current cluster — paid by the
  owners of `hermes`, `garage` and `n8n`.
- Assets are unvalidated by the platform: a malformed `postgresql.conf`
  renders successfully and fails at runtime — paid by the service owner.
- Substitution stays one restricted mechanism in two places (env files and
  Assets); anyone needing a conditional must build an image instead — paid by
  the service owner who wanted the shortcut.
