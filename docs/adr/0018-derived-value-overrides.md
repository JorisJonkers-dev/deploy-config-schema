---
status: proposed
---

# A derived value may be overridden inline, with a reason; an assignment may not

A Workload may override a derived value by naming the field, the value, and a
reason. Assignments — hostname, namespace, node, Secret Store path, Reconcile
Unit, image digest — are not overridable, because they arbitrate shared resources
and a local override would reintroduce collision.

## Why

ADR-0007 forbids authoring derived configuration and ADR-0008 forbids authoring
derived runtime mechanics. Both need an escape, because a legitimate exception
exists in the tree already: `app-ui` runs `progressDeadlineSeconds: 600` while the
three JVM services run `1800`, and its comment explains why — *"nginx pods,
~10–20Mi RAM each"*. That is not a defect in the derivation rule; a JVM cold start
and an nginx start are genuinely different, and the rule cannot be right for both
from one input.

Refusing an escape entirely was rejected for a specific reason: the alternative
is not a better rule, it is a falsified input. An owner who needs 600 and cannot
say so will misreport their Startup Budget to coax the number out of the
derivation, corrupting the one field only they could know.

Requiring a reason makes the rationale data rather than a YAML comment no tool
can read, which is what it is today.

## Consequences

- Overrides cannot be enumerated estate-wide, so a dead override looks identical
  to a load-bearing one and both persist. This is an accepted cost.
- It stays recoverable: composition already reads every Intent Fragment
  (ADR-0015), so producing a register of active overrides — and testing whether
  each still changes anything — is later available as a read over data already in
  hand, not as a new mechanism. Nothing here forecloses it.
- The derivation/assignment boundary must be explicit in the schema, not
  conventional. A field is overridable or it is not, and the list of
  non-overridable fields belongs in the specification rather than in the
  resolver's behaviour.
