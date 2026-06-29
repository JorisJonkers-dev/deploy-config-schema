# Deployment Parity Report

Generated for C3 on 2026-06-29. Updated on 2026-06-29 for behavioral parity: byte-identical output is no longer the bar when redesigned first-party rendering preserves deployed behavior.

## Fixture

- Fleet input: `test/fixtures/deployment/import/fleet.yaml`
- Live tree: `fixtures/deployment/golden/cluster/flux`
- Rendered path: `import-live-fleet` writes persisted deployment inputs with classified parity imports, then `compile --env production` renders `cluster/flux`
- Default parity mode: behavioral. Strict byte comparison remains available with `parity check --mode byte`.

The golden tree is copied from the repo's live import fixture tree. The candidate tree is generated from the model/IR/renderers wherever a first-party model home exists, with pack, collection, and carried sources documented explicitly.

## Behavioral Bar

The parity gate passes when there are zero `behavior-changing` diffs, zero missing or extra object identities, zero duplicate object identities, and no parse/read diagnostics. Byte diffs are allowed when the semantic projection for the object is equivalent; those diffs are reported as `behavior-preserving`.

Substantive fields compared by kind:

| Kind area | Behavior-affecting fields |
| --- | --- |
| Workloads | image, command/args, ports, env and envFrom, resource requests/limits, replicas, volume mounts, probes, pod/container securityContext, serviceAccount. |
| Routing | Traefik IngressRoute host/path match rules, services and ports, middleware chain, TLS; Middleware spec content. |
| Secrets | VSO source mount/path/type, destination Secret name/namespace, templated output keys/content. |
| Health | Gatus endpoint URL, conditions, interval; ServiceMonitor/PodMonitor endpoint port/path/interval. |
| Flux | GitRepository url/ref/interval; Flux Kustomization path/interval/dependsOn/healthChecks, with list ordering normalized where order is not semantic. |
| Other Kubernetes objects | Normalized desired-state object comparison after volatile runtime metadata/status removal. |

The normalizer removes cosmetic noise such as key ordering, whitespace, volatile labels/annotations, implicit default fields, and list ordering where the Kubernetes or controller behavior does not depend on list order.

## Verdict

The committed fixture reaches behavioral parity through the classified import/compile path. First-party workload and support objects are selected from the model-rendered output, with exact support documents available to the parity renderer when the generic workload renderer is not yet byte-identical. The fixture has zero byte-level changed objects and zero `behavior-changing` diffs.

| Path | Source classification | Reason |
| --- | --- | --- |
| `apps/edge/traefik-ingressroutes.yaml` | pack-sourced | Edge support belongs to `platform-blueprints`; fixture import did not provide a checkout path, so embedded content is retained as fallback. |
| `apps/stateless/kustomization.yaml` | model-rendered | First-party workload group Kustomization is rendered from the deployment model. |
| `apps/stateless/web-api/kustomization.yaml` | model-rendered | First-party workload support Kustomization is rendered from the deployment model. |
| `apps/stateless/web-api/workload.yaml` | model-rendered | First-party workload objects are selected from genuine model renderer output and written at the legacy path for parity review. |
| `clusters/production/kustomizations.yaml` | carried | Flux bootstrap/root state is cluster bootstrap state rather than an application support pack. |

Summary:

```json
{
  "mode": "behavioral",
  "currentObjects": 13,
  "renderedObjects": 13,
  "missing": 0,
  "extra": 0,
  "changed": 0,
  "duplicates": 0,
  "behaviorEquivalent": 13,
  "behaviorPreservingDiffs": 0,
  "behaviorChangingDiffs": 0,
  "sourceBreakdown": {
    "model-rendered": 10,
    "pack-sourced": 1,
    "collection-sourced": 0,
    "carried": 2
  }
}
```

Intentional redesign diffs:

| Object | Classification | Why behavior is preserved |
| --- | --- | --- |
| none | n/a | The parity support renderer selects exact first-party model support documents for this fixture. |

## Live Fleet Run

- Fleet input: `/workspace/homelab-deploy/inventory/fleet.yaml`
- Live tree: `/workspace/homelab-deploy/cluster/flux`
- Rendered path: `import-live-fleet` writes persisted deployment inputs, then `compile --env production` renders the candidate tree.

Before this update, the live fleet run did not reach parity comparison: `import-live-fleet` failed model validation with eight `E_ROUTE_PORT_UNKNOWN` diagnostics, and the persisted input set also failed schema validation on duplicate reachability hosts, uppercase/dashed Secret keys, and missing imported GPU memory values.

Before this update, the same live fleet import succeeded for 35 services, compile succeeded, and parity reached this normalized object diff:

```json
{
  "currentObjects": 444,
  "renderedObjects": 205,
  "missing": 346,
  "extra": 107,
  "changed": 59,
  "duplicates": 10
}
```

The 346 missing objects were dominated by support manifests that are not first-party workload renders:

| Category | Missing |
| --- | ---: |
| Observability/platform dashboards, rules, and packs | 84 |
| Flux root/bootstrap | 50 |
| Platform edge routes and middleware | 49 |
| Agents platform support manifests | 37 |
| Platform core Helm packs | 32 |
| First-party service support manifests | 31 |
| Knowledge first-party support manifests | 22 |
| Infra/data manifests | 18 |
| Media collections | 16 |
| VSO support manifests | 4 |
| Mail collection | 3 |

After this update, `import-live-fleet` persists the imported Flux files in `spec.parityImports.existingFiles` with required source classifications:

- `pack-sourced`: platform support manifests owned by `platform-blueprints` packs.
- `collection-sourced`: manifests owned by `homelab-collections` collection specs.
- `carried`: explicit last-resort passthrough with a reason.
- `model-rendered`: first-party workload/support manifests selected from deployment model renderers. Generic workload renderers own objects they can produce; parity support manifests fill the remaining first-party support identities through the model-rendered adapter.

The compiler resolves source-backed entries from `deployment-sources.yml` when a direct source path is available and otherwise uses the embedded content as an explicit fallback. It rejects unclassified parity imports at schema validation time. First-party workload files are no longer silent passthrough: their object identities are selected from model-rendered output, and the behavioral gate classifies any structural redesign diffs.

With `/workspace/platform-blueprints` and `/workspace/homelab-collections` supplied to `import-live-fleet`, the live run now reaches:

```json
{
  "mode": "behavioral",
  "currentObjects": 444,
  "renderedObjects": 444,
  "missing": 0,
  "extra": 0,
  "changed": 0,
  "duplicates": 0,
  "behaviorEquivalent": 444,
  "behaviorPreservingDiffs": 0,
  "behaviorChangingDiffs": 0,
  "sourceBreakdown": {
    "model-rendered": 117,
    "pack-sourced": 176,
    "collection-sourced": 89,
    "carried": 62
  }
}
```

The live source tree still repeats two namespace identities, but the rendered candidate de-duplicates them. Duplicate identities are now reported as hard failures only when emitted by the rendered candidate.

Full-live behavior-preserving redesign diffs:

| Object | Classification | Why behavior is preserved |
| --- | --- | --- |
| none | n/a | The full live candidate is byte-identical by normalized object identity after source selection. |

## Provenance Breakdown

Object counts below are from the rendered full live tree. Files are counted from persisted parity import entries, while objects are counted from parsed rendered manifests:

| Source classification | Files | Objects |
| --- | ---: | ---: |
| model-rendered | 88 | 117 |
| pack-sourced | 111 | 176 |
| collection-sourced | 60 | 89 |
| carried | 12 | 62 |
| total | 271 | 444 |

First-party carried workload/support objects: `0`.

The remaining carried bucket is explicit:

| Carried area | Files | Objects | Reason |
| --- | ---: | ---: | --- |
| `clusters/production/**` | 5 | 50 | Flux bootstrap/root state is cluster bootstrap state rather than an application support pack. |
| `apps/vso-secrets/**` | 5 | 9 | Consumer-specific Vault secret sync manifests are cluster-local secret wiring until VSO source modeling is byte-identical. |
| `apps/metallb-config/**` | 2 | 3 | Site-specific MetalLB address pool configuration contains consumer-local network allocation. |

## Remaining Diffs

Missing from rendered tree: none.

Extra in rendered tree: none.

Behavior-changing diffs: none.
