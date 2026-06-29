# deploy-config-schema

JSON Schemas and CLI tooling for JorisJonkers-dev deployment configuration.

## What It Is

`deploy-config-schema` provides the internal TypeScript package, public JSON
Schemas, validators, render helpers, and command contracts used by deployment
and infrastructure repositories.

## Install

```bash
npm install @jorisjonkers-dev/deploy-config-schema
```

The package is published under the short JorisJonkers-dev npm coordinate. A brand-new GitHub Packages npm package on this personal account defaults private; the owner must set it public once after the first publish.

## Commands

Validate config and generated artifact documents:

```bash
npx deploy-config-schema validate deploy-config samples/deploy-config.yaml
npx deploy-config-schema validate platform fixtures/platform/single-node.platform.yaml
npx deploy-config-schema validate auto platform.yaml service-intent.yaml fleet-inventory.yaml vault-dynamic-secrets.yaml
```

`validate auto` infers the artifact kind from the file name and, when needed, from the top-level document shape. The JSON response is deterministic and CI-friendly:

```json
{
  "valid": true,
  "diagnostics": [],
  "results": [
    { "file": "platform.yaml", "kind": "platform", "valid": true, "diagnostics": [] }
  ]
}
```

Validate standalone generated artifacts explicitly:

```bash
npx deploy-config-schema validate service-intent fixtures/round4/service-intent-renderable.sample.yaml
npx deploy-config-schema validate fleet-inventory fixtures/round3/fleet-inventory.sample.yaml
npx deploy-config-schema validate vault-dynamic-secrets fixtures/round3/vault-dynamic-secrets.sample.yaml
```

Validate Deployment inputs:

```bash
npx deploy-config-schema validate deployment fixtures/deployment/deployment.yml
npx deploy-config-schema validate deployment-sources fixtures/deployment/deployment-sources.yml
npx deploy-config-schema validate deployment-lock fixtures/deployment/deployment.lock.yml
npx deploy-config-schema validate node-contract fixtures/deployment/node-contract.lock.yml
npx deploy-config-schema validate collection fixtures/deployment/collection.yml
npx deploy-config-schema validate reachability fixtures/deployment/reachability.yml
npx deploy-config-schema validate state-move-plan fixtures/deployment/state-move-plan.yml
```

Deployment command contracts are available for source resolution, lock image
extraction, bundle packing, compiler scaffolding, import, render, and parity:

```bash
npx deploy-config-schema lock images --lock deployment.lock.yml --format image-tags
npx deploy-config-schema compile --env production --sources deployment-sources.yml --lock deployment.lock.yml --node-contract inventory/node-contract.lock.yml --reachability catalog/reachability.yml --out cluster/flux --check
```

Render a full generated tree from `platform.yaml`:

```bash
npx deploy-config-schema render-tree platform.yaml --output .
```

Check generated-file drift in CI without writing files:

```bash
npx deploy-config-schema render-tree platform.yaml --output . --check
npm run check-drift -- platform.yaml --output .
```

The check re-renders deterministically and exits nonzero with `E_RENDER_DIFF` if any managed generated file is missing or byte-different from the fresh render.

Render public Traefik IngressRoutes:

```bash
npx deploy-config-schema render traefik-public samples/deploy-config.yaml
```

Render generic route/probe/catalog/image outputs from service-intent input:

```bash
npx deploy-config-schema render gatus fixtures/round4/service-intent-renderable.sample.yaml --input service-intent
```

Write rendered output to a path:

```bash
npx deploy-config-schema render traefik-public samples/deploy-config.yaml --output traefik-ingressroutes.yaml
```

Available adapters:

- `traefik-public`: implemented.
- `traefik-lan`: implemented.
- `gatus`: implemented.
- `edge-catalog`: implemented.
- `edge-route-catalog`: implemented.
- `image-metadata`: implemented.

See [docs/adapters.md](docs/adapters.md) for adapter scope and follow-ups.

## Local Development

```bash
npm ci
npm test
npm run validate:schema
npm run validate:sample
npm run validate:artifacts -- platform.yaml service-intent.yaml fleet-inventory.yaml vault-dynamic-secrets.yaml
npm run check-drift -- platform.yaml --output .
npm run render:sample
```

## Boundaries

This repository defines versioned schemas and command surfaces. It does not
apply generated manifests, operate a cluster, manage secrets, or perform the
owner-gated production Flux source switch.

Deployment compiler work has begun with schemas, validation, source/lock helpers,
bundle manifests, compile scaffolding, and parity normalization. Full Flux,
Kubernetes, Traefik, Gatus, VSO, NetworkPolicy, and Longhorn renderers remain
follow-up implementation work.

## Links

- [Organization profile](https://github.com/JorisJonkers-dev)
- [Security policy](https://github.com/JorisJonkers-dev/.github/security/policy)
- [Changelog](./CHANGELOG.md)
- [License](./LICENSE)

Copyright (c) Joris Jonkers. Source available for viewing only; use, copying,
modification, redistribution, deployment, or reuse is not licensed. See
[LICENSE](./LICENSE).
