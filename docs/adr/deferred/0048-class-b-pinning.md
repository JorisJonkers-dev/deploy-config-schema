---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#foundation-pinning
rests-on: ["0002"]
---

# The foundation is pinned like everything else

## Rests on

Every chart and image in the pack-delivered foundation publishes immutable,
enumerable versions, so an exact version can be written down without freezing
the foundation — the bump arrives as a Renovate PR instead of an hourly
reconcile. False if: a foundation chart publishes only a moving reference, or
sits in a repository Renovate's Flux manager cannot enumerate. Settled by: for
each of the fifteen wildcard constants in `src/adapters/flux-utils.ts`, run
`helm search repo <chart> --versions` against the repository URL declared beside
it — each must list at least two immutable semver versions — then dry-run
Renovate over a tree rendered with those versions pinned: one bump per chart.
The premise here is [0002](../0002-kubernetes-as-substrate.md), which is what makes
a Flux `HelmRelease` the delivery mechanism for the foundation at all; this
record does not stand on push delivery
([0008](0008-tested-equals-deployed-requires-push.md)), and is a live defect
whichever way that premise falls.

## Why

`src/adapters/flux-utils.ts` sets `"*"` as the chart version default fifteen
times: cert-manager (`:615`), external-dns (`:624`), traefik-public (`:640`),
traefik-lan (`:662`), MetalLB (`:677`), VSO (`:689`), RabbitMQ (`:769`) and the
observability stack (eight more, `:825`-`:889`). A Flux `HelmRelease` with
`version: "*"` resolves to the newest published chart on every reconcile, and the
intervals beside those constants are `1h`. That is the set
`spec/v1/50-lifecycle.md:38-47` calls *"the foundation everything else stands
on"* — the Secret Store, the operator delivering every secret, both Traefiks
(*"every route"*), cert-manager, external-dns, MetalLB — and the half the
aggregator gate deliberately excludes, so nothing tests it. Class A gets a lock,
a digest, a gate and a vcluster; class B gets a wildcard on an hourly timer,
while the chapter calls the boundary *"enforced, not documented"*.

The cost is not hypothetical. `traefik-public/release.yaml` renders
`replicas: 1` with `maxSurge: 0` and `hostPort: 80/443` — a structural outage
window on every chart bump, on the single component fronting all public TLS —
while [0030](../0030-runtime-mechanics-derived.md) carries the pattern for
everything behind it: all four first-party deployments run `maxSurge: 1,
maxUnavailable: 0`, their comments recording what it cost, *"under `Recreate`
every image roll opened a zero-pod window, so a slow cold start or a flaky ghcr
image pull took the MCP fully down (503)"*. Under `"*"` that window opens
unattended, at an hour's notice, with no record of what version opened it.

The gap runs past charts. `platform-postgres.service.yml:34-35` pins the database
eight Services depend on to `pgvector/pgvector:pg17`, a mutable tag commented as
bypassing the lock, while `30-deliverables.md:224` makes a floating tag
`E_FLOATING_IMAGE`. Both production-touching workflows invoke bare `npx
deploy-config-schema`, registry-resolved at invocation, while the one workflow
that never touches production installs an exact version
(`service-publish-fragment.yml:50-57`); the in-cluster runner holding the deploy
ServiceAccount runs `actions/checkout@v4` and `oras-project/setup-oras@v1`,
floating; and this repository's CI (`.github/workflows/ci.yml:51`) pipes a
third-party script from `main` into `bash`. So class B takes class A's
discipline: exact chart versions, images by digest, Renovate bumps behind the
gate of [0040](../0040-renovate-ordering-gate.md), exact toolkit versions in
workflows, actions pinned by SHA. Pinning schedules the traefik window rather
than closing it; a VIP via MetalLB (dropping `hostPort` for `maxSurge: 1`) or an
accepted window is settled in the chapter, on `helm template` output. The
wildcards are a live defect today, fixable ahead of this record ever merging.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep `"*"` | Free, and upstream fixes land within the hour with no PR. Pays with an untested change arriving hourly on the components carrying all TLS, DNS, routing and secret delivery, a `replicas: 1, maxSurge: 0` restart on each, and no record of what ran when something broke | The estate cannot state what its foundation is running; that is not a safety boundary |
| Redescribe the boundary rather than fix it — the review's own second option: stop calling class A/class B a safety property | An hour of editing, no engineering | The description was the accurate half. Deleting it removes the only sentence making the boundary reviewable, and the foundation stays unpinned |
| Pin charts only, leave workflows and actions floating | Half a day, and closes the hourly-bump exposure | The highest-privilege path stays least pinned: the runner holding the deploy ServiceAccount still runs whatever `@v4` resolves to, and both production workflows still resolve the toolkit at invocation |
| Pin, then auto-merge class B bumps | Near-zero to configure; upgrade latency stays low | The gate excludes class B, so nothing tests a bump between the PR and public TLS ([0049](0049-aggregator-owned-tests.md)). Auto-merge is the current failure with a PR attached |

## Reversibility

Undo cost today: one file. All fifteen constants sit in one block in
`src/adapters/flux-utils.ts`; reverting them to `"*"` and dropping the Renovate
manager stanza is under an hour, and nothing moves until Flux next reconciles.
Becomes irreversible once: the pinned foundation trails upstream by several
minors — un-pinning then jumps many versions in one reconcile across
cert-manager, both Traefiks, MetalLB and VSO, so the way back is staged upgrades.

## Consequences

- Fifteen chart versions become a list somebody maintains: every upstream release opens a PR a human reads, atop a cadence already running 26 releases in ten weeks — paid by joris and by reviewers, who must not learn to rubber-stamp them.
- Upgrades stop arriving free: a published CVE fix waits for a merge instead of landing within the hour — paid by whoever owns foundation patch latency, which becomes a number rather than a shrug.
- Both production workflows must install an exact toolkit version from one readable place, and the runner repository needs its own Renovate configuration or its SHA pins rot — paid by whoever maintains those workflows.
- Class B becomes reviewable but stays untested: a pinned bump still reaches public TLS with no relationship test in front of it — paid by whoever reads the drift report ([0058](0058-delivery-machinery-observability.md)), and by [0051](0051-vcluster-substrate.md) if the foundation is ever brought inside the gate.
- The chart pin ships ahead of every v1 decision, so the largest exposure closes first and cheapest — paid back to the estate, at the cost of admitting the boundary shipped as a claim rather than a property.
