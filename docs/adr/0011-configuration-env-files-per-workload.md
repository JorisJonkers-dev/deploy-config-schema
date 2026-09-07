---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/10-service-intent.md#configuration
rests-on: ["0005"]
---

# Configuration is per-Workload env files with named placeholders

Configuration is authored as env files in real dotenv format, **per Workload**:
`platform/env/<workload>/base.env` carries what does not vary, one overlay per
Cluster Target (`platform/env/<workload>/<cluster>.env`) carries only what
differs, overlay winning key by key. A literal is written literally; a value the
platform derives is written as a **named placeholder** the renderer resolves —
`${dependency:…}` for a Dependency Coordinate, `${secret:…}` for a secret
([0027](0027-secret-reference-join-key.md)). Writing a derived value as a literal
is a build error; overriding a derived value uses the Workload's declared
override mechanism ([0031](0031-derived-overrides-with-reason.md)), never the env
file. The old configuration ADR scoped these files per Service while the spec and
the worked examples (`knowledge-api.base.env`, `knowledge-ingest-worker.base.env`)
were per Workload; the review caught the drift (finding X4) and this sentence
closes it, matching the per-Workload identity of
[0024](0024-identity-per-workload.md).

## Rests on

Every non-secret value a Workload's environment needs is either service-owned (a
literal the author knows) or a total function of the Intent and pinned inputs
([0005](0005-derivation-is-total.md)). False if: a Workload requires an
environment variable that is neither author-known nor producible by any
`${dependency:…}` or `${secret:…}` source, forcing a hand-maintained copy of a
derived value. Settled by: rendering the three service repositories' Workloads
and diffing each rendered environment against `knowledge-api`'s roughly thirty
hand-written live variables; any live variable no literal or placeholder can
reproduce falsifies the claim.

## Why

Configuration was nominally declared and actually hand-written. All three service
repositories ship a `platform/production.env` containing nothing but comments —
*"Non-secret production environment values… Rendered into the workload fragment
by deploy-config-schema"* — while `knowledge-api`'s live manifest hand-writes
roughly thirty environment variables. Those thirty fall into three classes with
three rightful owners: **app knobs** (`SPRING_PROFILES_ACTIVE`,
`KNOWLEDGE_MODE=lite` — uncontended, service-owned literals), **dependency
coordinates** (`DB_HOST`, `DB_PORT`, `RABBITMQ_HOST` — entirely derivable from
`dependsOn`), and **runtime boilerplate** (ten `OTEL_*` variables byte-identical
across `auth-api`, `agents-api` and `knowledge-api` except `OTEL_SERVICE_NAME`;
`knowledge-ingest-worker`, being Python, carries a different but equally fixed
set — two Runtime Profiles, one derived value, sixty duplicated lines).

Dotenv won over a typed source-declaring map on estate evidence: it is the one
`.env` format in the estate that already carries real configuration —
`tools/stalwart-provisioner/deploy/production.env` holds
`STALWART_PROVISIONER_LOG_LEVEL=info` and `STALWART_PROVISIONER_DRY_RUN=false` —
while the other two formats sharing the extension carry nothing: six service-repo
files are comments only, and twenty collection files are YAML
`DeploymentEnvironment` documents whose `spec.values` holds `namespace` and
`paritySource`. Base-plus-overlay formalises what `stalwart-provisioner`
half-invented: its `production.env` and `staging.env` are byte-identical.

Derived values are *forbidden as literals* rather than *defaulted* because a
permitted override is indistinguishable from a stale copy; a placeholder is the
only way to reference one. Placeholders are named-source references and never a
template language — no conditionals, no arithmetic. The key stays the consumer's
choice while the source stays declared: `knowledge` writes
`DB_HOST=${dependency:platform-postgres.host}` where `n8n` writes
`DB_POSTGRESDB_HOST=${dependency:platform-postgres.host}` for the same Postgres.
File-shaped configuration is an Asset ([0012](0012-assets-not-code.md)), not an
env file.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Per-Service env files (the old ADRs' scoping) | Workloads share an environment they do not have — `knowledge-api` and `knowledge-ingest-worker` overlap on RabbitMQ coordinates and nothing else — and the Workload-level joins catching dead grants and unauthorised secret references lose their subject | Finding X4: spec and examples were already per Workload; the joins are the only checks between a `secrets` list and an unauthorised read |
| Typed source-declaring map in `service.yml` | A new schema for what dotenv already expresses; a format the estate has zero instances of | The estate's only real config-bearing `.env` file is already dotenv |
| Defaulted-but-overridable derived values | Every override must be audited against staleness by hand | A permitted override is indistinguishable from a stale copy |
| General template language in env files | Configuration becomes a program; values stop being statically derivable and diffable | Placeholders are named-source references, nothing else |

## Reversibility

Undo cost today: rewrite a handful of env files across three service repositories
plus `spec/v1/examples/`, and swap the renderer's dotenv parsing — hours, blast
radius confined to layer-1 authoring; the rendered artifact does not change shape.
Becomes irreversible once: blueprint packs distribute the format and participant
repositories beyond the first three author against it — a change then needs a
coordinated migration across every participant.

## Consequences

- Sixty duplicated OTEL lines leave the service repositories; runtime boilerplate
  derives from centrally maintained Runtime Profiles — paid by the platform owner.
- An effective value takes two files to determine (`base.env` plus overlay); the
  counterfactual is `stalwart-provisioner`'s byte-identical pair — paid by
  whoever debugs a value on-call.
- Coordinates shared between sibling Workloads are written once per Workload, not
  once per Service; placeholders cannot go stale — paid by service authors.
- Hand-written derived literals must be deleted before a repository's first
  render succeeds — paid by service owners at migration time.
- The renderer partitions keys by destination: literals become plain env entries,
  `${secret:…}` keys follow [0026](0026-delivery-env-file-self.md); the author
  never partitions — paid by the toolkit maintainer.
