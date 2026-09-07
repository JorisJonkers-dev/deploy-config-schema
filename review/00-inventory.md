# 00 — Path inventory

Built by the orchestrator from paths only. No ADR, spec, or design-doc contents
were read. Anything marked UNCERTAIN was not verified — do not inherit it as fact.

Repo: `deploy-config-schema` (npm package `@jorisjonkers-dev/deploy-config-schema`, v0.22.0).
Branch under review: `v1-pre-release`. Working tree clean except untracked `.idea/`.

## Nature of the repository (path-level observation only)

This is a **schema / CLI / renderer** package — TypeScript source under `src/`,
JSON Schemas under `schemas/`, a CLI at `bin/deploy-config-schema.js`, and a
large corpus of YAML fixtures. It is **not** itself a deployed cluster workload.
The Kubernetes/Flux YAML present is *fixture and golden-output* material, i.e.
the artefacts this tool renders or imports. Reviewers whose lens assumes a
deployed service should read this constraint first and adjust — the "runtime"
under review is the rendered output, not this package.
UNCERTAIN: whether a separate repo consumes these renders.

## ADRs — `docs/adr/` (20 files, no index/README)

- docs/adr/0001-blueprint-pack-distribution.md
- docs/adr/0002-three-layer-meta-model.md
- docs/adr/0003-contention-decides-authority.md
- docs/adr/0004-flat-service-identity.md
- docs/adr/0005-credential-provisioning.md
- docs/adr/0006-reconcile-unit-is-derived.md
- docs/adr/0007-configuration-and-assets.md
- docs/adr/0008-runtime-mechanics-derived-from-intent.md
- docs/adr/0009-node-facts-and-placement.md
- docs/adr/0010-exposure-by-audience.md
- docs/adr/0011-dependency-edges.md
- docs/adr/0012-observability-by-class.md
- docs/adr/0013-schema-version-lockstep.md
- docs/adr/0014-co-testing-by-relationship.md
- docs/adr/0015-composition-by-oci-fragments.md
- docs/adr/0016-deliverables-and-ledgers.md
- docs/adr/0017-resolved-deployment-publish-back.md
- docs/adr/0018-derived-value-overrides.md
- docs/adr/0019-push-delivery-via-aggregators.md

Note: numbering runs 0001–0019 with no gaps. There is **no** `docs/adr/README.md`
or index file. The most recent commit on this branch is
`4999f69 docs: establish the v1 meta-model vocabulary and decisions (#57)`.

## Design docs / specification

Normative spec (`spec/v1/`):
- spec/v1/00-overview.md
- spec/v1/10-service-intent.md
- spec/v1/16-dependencies.md
- spec/v1/20-resolved-deployment.md
- spec/v1/30-deliverables.md
- spec/v1/40-composition.md
- spec/v1/50-lifecycle.md
- spec/v1/60-setup.md

Other prose:
- docs/adapters.md
- docs/deployment-parity-report.md
- README.md, CONTEXT.md, CONTRIBUTING.md, SECURITY.md, CLAUDE.md, CHANGELOG.md

Spec examples (normative-adjacent, worth reading with the spec):
- spec/v1/examples/aggregator.yml
- spec/v1/examples/auth-api.service.yml, auth-api.base.env
- spec/v1/examples/knowledge.service.yml, knowledge-api.base.env,
  knowledge-ingest-worker.base.env
- spec/v1/examples/platform-postgres.service.yml, platform-postgres.base.env
- spec/v1/examples/negative/duplicate-service-id/{README.md,intent-a/service.yml,intent-b/service.yml}
- spec/v1/examples/rendered/deployer-rbac.yaml
- spec/v1/examples/rendered/reapply-cronjob.yaml
- spec/v1/examples/renovate.json
- spec/v1/examples/workflows/{aggregator-deploy.yml,aggregator-gate.yml,compose.yml,service-publish-fragment.yml}

## Kubernetes manifests / Helm / Kustomize

No Helm `Chart.yaml` anywhere. No Kustomize overlay tree for this repo's own
deployment. All Kubernetes YAML is fixture or golden-output:

Rendered/golden output (the tool's own emitted manifests — highest-value target
for manifest review, since these are what the tool produces):
- fixtures/deployment/golden/cluster/flux/apps/edge/traefik-ingressroutes.yaml
- fixtures/deployment/golden/cluster/flux/apps/stateless/kustomization.yaml
- fixtures/deployment/golden/cluster/flux/apps/stateless/web-api/kustomization.yaml
- fixtures/deployment/golden/cluster/flux/apps/stateless/web-api/workload.yaml
- fixtures/deployment/golden/cluster/flux/clusters/production/kustomizations.yaml
- test/fixtures/deployment/parity/rendered/**  (api.yaml, kustomization.yaml,
  service.json, cluster/source.yaml, clusters/production/root.yaml,
  edge/ingressroute.yaml, monitoring/servicemonitor.yaml,
  network/networkpolicy.yaml, observability/gatus.yaml, rbac/role.yaml,
  secrets/vso.yaml)
- test/fixtures/deployment/parity/current/**  (same file set — the "before" side)
- test/fixtures/kubernetes-parity/postgres-derived.yaml
- test/fixtures/kubernetes-parity/website-api-storage-derived.yaml
- spec/v1/examples/rendered/deployer-rbac.yaml
- spec/v1/examples/rendered/reapply-cronjob.yaml

Blueprint packs (hand-authored Kustomize trees shipped as fixtures):
- test/fixtures/blueprint-packs/packs/edge/**
- test/fixtures/blueprint-packs/packs/edge-middleware/**
- test/fixtures/blueprint-packs/packs/flux-core/{cert-manager,external-dns-cloudflare,metallb,traefik-lan,traefik-public,vso}/**
  (each: kustomization.yaml, namespace.yaml, release.yaml, source.yaml)
- test/fixtures/blueprint-packs/packs/observability/**
  (alerts/platform-alerts.yaml, alloy, dcgm-exporter, gatus/{config,deployment,
  endpoints-placeholder,kustomization,pvc,service}.yaml, grafana, grafana-operator,
  helm-repositories.yaml, loki, metrics-stack, pyroscope, tempo, namespace.yaml)
- test/fixtures/blueprint-packs/packs/rabbitmq-data-service/**
  (internal-credentials.yaml, release.yaml, servicemonitor.yaml, source.yaml, …)

Pack descriptors:
- fixtures/flux-packs/*.json (11 files: edge-pack, edge-middleware-pack,
  flux-core-{cert-manager,external-dns-cloudflare,metallb,traefik-lan,traefik-public,vso},
  observability-{gatus,stack}-pack, rabbitmq-data-service-pack)

Import-side fixtures:
- test/fixtures/deployment/import/flux-tree/**
- test/fixtures/deployment/import/fleet.yaml

## Schemas and "migrations"

Schemas (`schemas/`, 24 files) — generated from Zod, see below:
adapter-compat, artifact-contract, cluster-composition-lock, cluster-context,
cluster-state, collection-index, collection, deploy-config, deployment-env,
deployment-lock, deployment-sources, deployment, gate-summary, host-inventory,
kustomization-health, node-contract, node-inventory, platform,
raw-manifests-guard, reachability, readiness-scorecard, state-move-plan,
round3/{fleet-inventory,service-intent,vault-dynamic-secrets}.

Zod sources: src/schemas/*.ts (deploy-config, deployment, fleet-inventory,
health-timeout-map, index, platform, service-intent, support,
vault-dynamic-secrets, generated-json.js).

Generation + check: `scripts/generate-schemas.ts` (npm `build:schemas` /
`check:schemas --check`), `scripts/validate-schema.js`.

**Database migrations: NOT FOUND.** There is no SQL, no ORM, no migration
directory. The "data model" under review is the schema/artifact contract and its
lockfiles (`deployment.lock.yml`, `node-contract.lock.yml`,
`cluster-composition-lock`, `images.lock.json`) — schema evolution and version
compatibility are the migration story here.
UNCERTAIN: reviewers should confirm this rather than assume.

## Module boundary configuration

**NOT FOUND.** No packwerk.yml, no package.yml, no Nx/Turbo project graph, no
eslint import-boundary plugin visible in `eslint.config.js` (path only — not read).
Boundaries, if any, exist only as directory structure under `src/`:
adapters/, artifact/, blueprints/, cluster-context/, collections/, deployment/,
deployment/render/, hosts/, minimal/, render-plan/, schemas/.
tsconfig.json is a single project (no project references seen at path level).

## CI, deploy scripts, runbooks

- .github/workflows/ci.yml (3 jobs, all `runs-on: ubuntu-latest`)
- .github/workflows/release.yml (release-please; see release-please-config.json,
  .release-please-manifest.json)
- .github/workflows/add-to-project.yml
- .github/workflows/repository-hygiene.yml
- .github/CODEOWNERS, .github/rulesets/main.json
- .gitleaks.toml, renovate.json, .npmrc
- scripts/copy-dist-assets.js, scripts/generate-schemas.ts, scripts/validate-schema.js
- Consumer-side CI templates: spec/v1/examples/workflows/*.yml
- **Runbooks: NOT FOUND.** No `runbooks/`, `ops/`, or operational procedure doc.
  Lifecycle prose lives in spec/v1/50-lifecycle.md and spec/v1/60-setup.md
  (UNCERTAIN — titles only, contents unread).

Publish target: GitHub Packages (`https://npm.pkg.github.com`), license
`LicenseRef-JorisJonkers-Proprietary-1.0`. Node engine `>=20`.
Test gate: c8 coverage, lines 90 / branches 80.

## Monitoring / alerting config

- test/fixtures/blueprint-packs/packs/observability/alerts/platform-alerts.yaml
- test/fixtures/blueprint-packs/packs/observability/** (Grafana, Loki, Tempo,
  Pyroscope, Alloy, metrics-stack, Gatus)
- Gatus endpoint rendering: src/adapters/gatus.ts,
  src/adapters/gatus-endpoint-fragment.ts, src/deployment/render/gatus.ts
- ServiceMonitor rendering: src/deployment/render/servicemonitor.ts
- schemas/readiness-scorecard.schema.json, schemas/gate-summary.schema.json,
  schemas/kustomization-health.schema.json
- No Prometheus rule file for this package's own operation.

## Target k3s version / node count / datastore

- **k3s version: NOT FOUND.** No `.tool-versions`, no version pin in
  package.json, CI, schemas, or any non-doc fixture. Greps for `k3sVersion`,
  `kubernetesVersion`, `kubeVersion`, `k8sVersion` returned nothing repo-wide.
- **Distribution kind** is declared per-platform in fixtures:
  `fixtures/platform/single-node.platform.yaml:6` and
  `fixtures/platform/full-tree.platform.yaml:6` both say `kind: k3s`.
- **Node roles** appear as labels/roles `k3s-control-plane` and `k3s-worker` in
  fixtures/platform/{single-node,full-tree,multi-site}.platform.yaml.
  Fixture names imply topologies of one node, a full tree, and multi-site.
  Actual node counts were not counted — read the fixtures if your lens needs them.
- **Datastore (embedded SQLite / etcd / external SQL): NOT FOUND** anywhere
  discoverable by path or grep.
- docs/adr/0009-node-facts-and-placement.md and README.md mention k3s
  (grep hit, contents unread) — those are the places to look first.

Reviewers depending on version, node count, or datastore must treat them as
**blocking unknowns** and mark dependent findings Confidence: Speculative.

## Orchestrator failure log

(Empty at Phase 0. Any subagent that fails twice is recorded here.)

### Phase 2 record

All six critiques returned on the first attempt. No relaunches. No agent failed twice.

Skill availability reported by the subagents:
- `engineering:architecture` — NOT INSTALLED (lens 1)
- `engineering:system-design` — NOT INSTALLED (lenses 2 and 3)
- `engineering:tech-debt` — NOT INSTALLED (lens 2)
- `engineering:code-review` — NOT INSTALLED (lens 3)
- `engineering:deploy-checklist`, `engineering:incident-response` — see line 2 of review/05-ops.md
- `kubernetes-skill` — see line 2 of review/04-k3s.md
- Lens 6 was instructed to load none.

Deviation: lens 2 (review/02-patterns.md) substituted `codebase-design` as its
checklist after its named skills were unavailable. The prompt forbade
substitution. The consolidator should weigh 02-patterns.md accordingly.
