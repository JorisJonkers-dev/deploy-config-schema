---
status: proposed
---

# Deliverables are attributed to Adapters, and every hole is a bidirectional ledger

Every file in the Deliverable Set is produced by exactly one Adapter, as one
Fragment per Adapter per Service. Coverage is asserted in both directions: every
live cluster object must be produced by an Adapter or listed in a ledger with an
owner and a reason, and every ledger entry must still match something. A stale
entry fails the build.

## Why

The adapter and fragment layer already exists and works — roughly twenty
adapters, `adapter-compat`, parity checking with a behavioural profile, a
deterministic render hash, and an artifact contract. Replacing it with direct
rendering would discard attribution, and attribution is what lets a diff say
which subsystem produced a file.

A target-neutral deliverable IR was considered and rejected. Consul and Nomad
appear in this estate only in a `flux-modules` denylist and in a reserved
`extensions.nomad` slot annotated *"No renderer consumes it in this feature."* An
abstraction with one consumer is shaped entirely by that consumer, so it would be
Kubernetes-shaped and wrong for Nomad at the moment Nomad arrived. If a second
target ever exists, that is the time to lift the abstraction, with two real
consumers to shape it.

The bidirectional ledger is not invented here. It is the design already used by
`catalog/accepted-fragment-drift.yml`, whose header states the property exactly:
*"`fragment-drift.sh` fails on anything absent from this file, and also fails on
an entry here that no longer matches anything — so the list cannot quietly
outlive the thing it excuses. Every entry is a deferred fix, not a permanent
exemption."*

That is the best-designed artifact in the estate, and it generalises. Three
accepted holes elsewhere in this specification take the same shape: Registered
Unmanaged Surfaces (ADR-0010), the participants list (ADR-0015), and any escape
hatch overriding a derived value. Each becomes a ledger with an owner, a reason
and a review date, and each fails both ways. `catalog/coverage-ledger.yml`
already categorises every service as `first-party` or `collection` and is the
starting point for total coverage.

## Consequences

- **Each Adapter must become total for its target subsystem, and today none are.**
  342 files exist under `fleet-infra/cluster` and only some are attributable. The
  gap between "attributable" and "total" is the real size of the implementation
  phase, and it should be measured per adapter before committing to a schedule.
- One accepted-drift entry today is instructive about the limits: `agent-gateway`
  cannot be probed because it is *"a sidecar jar inside agent-runner pods, not a
  workload of its own"*, and the per-runner Services are created and destroyed by
  `agents-api`. Some objects are genuinely outside any declarative model, and the
  ledger is where they belong — with a reason, not silence.
