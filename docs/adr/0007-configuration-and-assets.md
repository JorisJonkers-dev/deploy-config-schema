---
status: proposed
---

# Configuration declares its source; code is not configuration

Every environment value a Workload receives declares where it comes from —
`literal`, `dependency`, `profile`, or a Claim — in the same shape Claims use.
Values that the platform derives may not be authored: writing `DB_HOST` or
`OTEL_EXPORTER_OTLP_ENDPOINT` by hand is a build error, and overriding a Runtime
Profile value requires naming the profile it overrides. File-shaped
configuration is carried as an **Asset**: a declarative settings file in the
consuming application's own format, with optional placeholder substitution.
Scripts and programs are not Assets — they belong in an image.

## Why

Configuration was nominally declared and actually hand-written. All three
service repositories ship a `platform/production.env` containing nothing but
comments — *"Non-secret production environment values… Rendered into the workload
fragment by deploy-config-schema"* — while `knowledge-api`'s live manifest
hand-writes roughly thirty environment variables. The `.env` extension was
itself a lie: in `homelab-collections` those files are YAML
`DeploymentEnvironment` documents whose `spec.values` carries `namespace` and
`paritySource`, not configuration at all.

The thirty variables fall into three classes with three different rightful
owners, which is why they accumulated in one place:

- **App knobs** — `SPRING_PROFILES_ACTIVE`, `KB_RECALL_DEFAULT_MODE`,
  `KNOWLEDGE_MODE: lite`. Uncontended, service-owned.
- **Dependency coordinates** — `DB_HOST`, `DB_PORT`, `DB_NAME`,
  `RABBITMQ_HOST`, `RABBITMQ_PORT`. Entirely derivable from `dependsOn`.
- **Runtime boilerplate** — ten `OTEL_*` variables, byte-identical across
  `auth-api`, `agents-api` and `knowledge-api` except `OTEL_SERVICE_NAME`, which
  is the workload name. `knowledge-ingest-worker`, being Python, carries a
  different but equally fixed set. Two Runtime Profiles, one derived value,
  sixty duplicated lines.

Derived values are *forbidden* rather than *defaulted* because a permitted
override is indistinguishable from a stale copy. Forbidding them is what stops
the duplication returning.

Coordinates must bind through a declared name because consumers disagree:
`knowledge` reads `DB_HOST`/`DB_PORT`/`DB_NAME` while `n8n` reads
`DB_POSTGRESDB_HOST`/`DB_POSTGRESDB_PORT`/`DB_POSTGRESDB_DATABASE` plus
`DB_TYPE`, from the same Postgres.

## Assets, and why code is excluded

Eighteen `ConfigMap` objects existed, and they were three unrelated things:

- **Six fixed files**, zero derived values: `postgresql.conf`,
  `enabled_plugins`, `cors.ini` + `single-node.ini`, `gatus` `config.yaml`,
  `hermes` `sources.conf`, `stalwart` `config.json`.
- **Five derived catalogs**, which are Deliverables rather than configuration:
  `gatus-endpoints` (41 derived references in 288 lines),
  `platform-edge-route-catalog` (30/163), `platform-edge-catalog` (28/146),
  `grafana-datasources` (6/104), and `postgres-init-script` (18/98 — it creates
  one database and user per consuming service, which the dependency graph
  already knows). Three of these are three of the seven places
  `kb.jorisjonkers.dev` was declared.
- **Seven mixed files**, a large static body threaded with a few derived
  values — `rabbitmq.conf` most starkly, with exactly one derived line out of
  twenty-four: `auth_oauth2.issuer = https://auth.jorisjonkers.dev`, a hostname
  belonging to another service.

Baking the fixed six into images was considered and rejected on evidence: every
one of those services runs a third-party image (`pgvector/pgvector:pg17`,
`rabbitmq:4.2-management-alpine`, `twinproduction/gatus`,
`stalwartlabs/stalwart`, `couchdb`). Only ten images in the estate are
first-party, and none are these. Baking would mean a derived image, build
pipeline, registry entry and Renovate rule per service, a rebuild on every
upstream bump, and — because `rabbitmq.conf` carries a derived hostname —
turning a route change into an image rebuild.

Scripts are the opposite case. `garage` and `hermes` run `alpine:3.21` executing
scripts supplied by ConfigMaps: `hermes-bootstrap` is 221 lines of shell,
`n8n-hooks` is 499 lines of JavaScript. That is first-party code with no image,
no tests and no version, and it does belong in an image.

The boundary is mechanical, not a judgement: an Asset may not be executable and
must be a declarative settings file in the consuming application's own format.
`postgres-init-script`'s reliance on `/run/secrets/<name>` — a Docker Compose
convention that does not exist in Kubernetes — is a sign of how long that file
has gone unexamined.

## Consequences

- Four images must be built before v1 can render the current cluster:
  `hermes-bootstrap`, `garage` bootstrap, `n8n-hooks`, and whatever replaces the
  ad-hoc `alpine:3.21` workloads. `postgres-init-script` needs no image because
  it becomes derived.
- Assets are unvalidated by the platform: a malformed `postgresql.conf` renders
  successfully and fails at runtime.
- Substitution introduces a second templating surface alongside rendering, and
  it must be restricted to named placeholders with declared sources — never a
  general template language.
