---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/30-deliverables.md#ledgers
rests-on: ["0003"]
---

# Every accepted hole is a bidirectional ledger

## Rests on

Under [0003](0003-three-layer-meta-model.md) layer 3 is a total function of the
Resolved Deployment, so every live object the render does not produce can be
named as a predicate over the cluster inventory — kind, namespace, and a name or
name pattern — and so matched or found unmatched by machine. False if: an
accepted hole exists whose excuse cannot be written as such a predicate, leaving
the entry neither confirmable nor falsifiable without a human reading the
cluster. Settled by: run the ledger check against the pinned inventory twice —
once with one live entry deleted (must exit non-zero with
`E_UNATTRIBUTED_OBJECT`) and once with a fabricated entry appended (must exit
non-zero as a stale entry). Both halves must fire on all three ledgers as they
stand.

## Why

The bidirectional ledger is not invented here. It is the design already running
in `catalog/accepted-fragment-drift.yml`, whose header states the property
exactly: *"`fragment-drift.sh` fails on anything absent from this file, and also
fails on an entry here that no longer matches anything — so the list cannot
quietly outlive the thing it excuses. Every entry is a deferred fix, not a
permanent exemption."* That is the best-designed artefact in the estate, and the
only thing this decision does is generalise it to every other accepted gap.

Both halves are load-bearing because the gaps are large and are meant to shrink.
Of 450 live objects, 364 are derivable from Service Intent, 41 are pack-delivered
and 45 are authored content; of the 364, chapter 30 recorded **328 with a
producing adapter and 36 without** (`spec/v1/30-deliverables.md:77-89`) — a count
[0052](0052-registered-adapters-are-v1.md) shows is wrong on two of its four rows,
so the gap is re-derived from `adapterContract()` before it is planned against;
whatever its size, it is large enough that the ledger must shrink on its own.
Class C is 31 `GrafanaDashboard` and 14 `GrafanaFolder`; chapter 50 assigns every
one of them — 14 as Assets, 3 to the Runtime Profile, 14 to the observability
pack, 2 derived per Service — so class C is ledgered only until those owners land,
not permanently. A list failing only on absence would carry those entries after the adapters closing them are
registered under [0052](0052-registered-adapters-are-v1.md), and no build would
say so. The stale half makes the ledger shrink on its own.

Three accepted holes in this specification take the shape: Registered Unmanaged
Surfaces ([0019](0019-registered-unmanaged-surfaces.md)), participant dormancy
([0038](0038-participants-list-staleness.md)), and any override of a derived
value ([0031](0031-derived-overrides-with-reason.md)). Each entry carries an
owner, a reason and a review date, and a date in the past fails the build like an
unmatched entry: a review date with no consequence is an adjective. One live
drift entry marks where the limit genuinely is: `agent-gateway` cannot be probed
because it is *"a sidecar jar inside agent-runner pods, not a workload of its
own"*, and its per-runner Services are created and destroyed by `agents-api` at
runtime. Some objects are outside any declarative model; the ledger is where they
belong, with a reason rather than with silence.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| One-way allowlist (fail only on the unlisted) | Free — it is the check minus one comparison | The class A gap and the drift entries survive their own causes; finding that out costs a manual audit of every entry against the live inventory, which is the work the check exists to remove |
| No ledger: every unattributed object fails the build | The whole class A gap closed before v1 renders anything, plus every class-C owner — Assets, Runtime Profile, observability pack — landed first | Blocks v1 on work v1 is not about; until those owners land the build is permanently red or permanently suppressed |
| Exemptions as annotations on the live objects | Cheaper to add: one `kubectl annotate`, no file, no PR | The exemption lives where anyone with cluster write can create it, has no owner or review date, and never appears in a diff — attribution ([0054](0054-adapter-attribution.md)) would be asserted against a list nobody reviewed |

## Reversibility

Undo cost today: three YAML files and the check that reads them; the stale half
is one set comparison, so dropping it is under an hour and changes no rendered
object. Blast radius is the build signal only. Becomes irreversible once the
ledgers hold more entries than anyone will read in one sitting — the class A gap
opens at whatever the re-derived count is — since from there, removing the stale half leaves no way to
tell a deferred fix from a permanent exemption short of re-deriving coverage by
hand.

## Consequences

- Accepting a hole costs an owner, a reason and a review date at the moment of
  acceptance, not later — paid by the service owner taking the exception.
- Closing a hole is two changes, register and delete, and forgetting the second
  breaks the build — paid by whoever registers the adapter.
- Class C entries expire only when their chapter-50 owner lands, so they sit in
  the ledger longest — paid by the estate owner.
- The check reads the pinned `ClusterState` snapshot
  ([0034](0034-cluster-state-pinned-input.md)), so a ledger verdict is exactly as
  fresh as that snapshot — paid by whoever trusts a green build.
- With one human across three identities in `git shortlog` (35 commits), every
  review date is a note to self; the build failure, not the review, is what
  actually enforces the deadline — paid by the single owner.
