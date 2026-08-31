---
status: proposed
---

# Declarations compose from published OCI fragments; the lock is an output

Each domain repository publishes its own declarations — Service Intents, its
Secret Subtree, node facts, test projects — as an OCI artifact on release.
Composition resolves the current set at render time, unions it, asserts
estate-wide invariants, and records every resolved digest in the lock beside the
render. A versioned participants list names every repository expected to publish,
with a staleness bound.

## Why

Seven earlier decisions depend on a global view: estate-wide Service Id
uniqueness (ADR-0004), Secret Subtree union with prefix-collision rejection
(ADR-0005), reconcile DAG construction (ADR-0006), hostname assignment and the
reachability completeness assertion (ADR-0010), inbound edges for co-test sets
(ADR-0011, ADR-0014), and test project discovery (ADR-0014). None of them work
against a single repository in isolation.

Git submodules were the obvious candidate and were rejected on the estate's own
evidence. A pointer bump is a push and a merge, so submodules do not remove the
central merge point — they make it mandatory for every change. `workspace` runs a
sync bot precisely because pointer bumps do not happen by themselves, and
`CLAUDE.md` records the lag this causes: *"The audit reads pinned pointers, not
live `main`… so a fix merged since the last sync shows as drift for up to a day."*

Live discovery by repository topic was rejected for reproducibility and for a
documented failure mode: *"A repo without one lands in `inbox/` rather than
blocking the sync — so it fails quietly."*

OCI publication is the pattern the estate already runs for exactly this purpose.
`homelab-inventory` publishes `cluster-deploy-context-public` and
`cluster-deploy-context-internal` to GHCR and consumers pin them by digest, with
no submodule anywhere. Making the lock an **output** rather than an input is what
satisfies the requirement that no repository needs a merge before a change takes
effect, while keeping a render exactly reproducible from its recorded digests.
`deployment-sources`, `deployment.lock.yml` and `cluster-composition-lock`'s
`lockChain` already provide the shape for recording it.

## Consequences

- A render is only as current as the last publish. A domain that has not
  published does not contribute.
- **That absence is dangerous here specifically because Flux prunes.** A domain
  silently omitted from a render is a domain deleted from the cluster on the next
  reconcile, and the render would look entirely valid. The participants list with
  a staleness bound is therefore not optional: `E_PARTICIPANT_MISSING` and
  `E_PARTICIPANT_STALE` are what stand between a missed publish and a deletion.
- Deriving expected participants from inbound references was considered and is
  insufficient: a leaf Service that nothing depends on can vanish without any
  reference breaking, and leaves are the majority — `immich`, `jellyfin`,
  `sonarr`, `radarr`, `bazarr`, `prowlarr`, `qbittorrent`.
- One central artifact survives, the participants list. It changes only when a
  domain is added or retired, not when a declaration changes.
- A legitimately dormant domain needs an explicit exemption with a reason.
