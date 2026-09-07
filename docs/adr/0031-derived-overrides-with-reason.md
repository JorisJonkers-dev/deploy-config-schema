---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/20-resolved-deployment.md#overrides
rests-on: ["0005"]
---

# A derived value is overridable with a reason; an assignment is not

## Rests on
Exceptions to a correct derivation rule are real but rare — few enough to name
one at a time. False if: rendering the estate needs more than one override per
Service, which would mean the rule is wrong rather than the workload unusual.
Settled by: render every Service, diff the derived rollout and configuration
values against the live manifests, and count the fields where the live value
differs *and* the owner can defend the difference — today that count is one.

## Why
[0030](0030-runtime-mechanics-derived.md) forbids authoring derived runtime
mechanics and [0011](0011-configuration-env-files-per-workload.md) forbids
authoring derived configuration. Both need an escape, because a legitimate
exception already exists in the tree: `app-ui` runs
`progressDeadlineSeconds: 600` while the three JVM services run `1800`, and its
comment explains why — *"nginx pods, ~10–20Mi RAM each"*. That is not a defect
in the derivation rule. A JVM cold start and an nginx start are genuinely
different, and one rule over one input cannot be right for both.

Refusing an escape entirely was rejected for a specific reason: the alternative
is not a better rule, it is a falsified input. The derived deadline is
`startupBudget × 3, floored`, and the same budget sets the startup probe's
period and failure threshold. An owner who needs 600 and cannot say so declares
a 200-second Startup Budget to coax the number out — corrupting the one field
only they could know, and mis-deriving the probe along with the deadline. The
lie is invisible; an override is not.

Requiring a reason makes the rationale data rather than a YAML comment no tool
can read, which is what it is today. Assignments — hostname, namespace, node,
Secret Store path, Reconcile Unit, image digest — stay outside the hatch: they
arbitrate shared resources under [0004](0004-contention-decides-authority.md),
and a local override would reintroduce exactly the collision arbitration
exists to prevent. The boundary is therefore explicit in the schema, not
conventional: a field is overridable or it is not, and the non-overridable list
belongs in chapter 20 rather than in the resolver's behaviour.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| No escape hatch — the pure rule | `app-ui` runs a 1800 s deadline (three times its real budget: a wedged roll takes 30 min to fail instead of 10), or its owner reports a false 200 s Startup Budget | The falsified input corrupts the one field only the owner knows and silently mis-derives the startup probe too; it is unauditable in a way an override is not |
| Per-Service exceptions in the toolkit's rule table | Platform owner edits and releases the toolkit for every exception; ~30 repositories wait on a toolkit release for a one-line tuning change | Moves Service knowledge into the platform and puts a release in the path of every exception |
| Overrides with no required reason | Nothing to build; a bare number in the fragment | That is precisely today's unreadable YAML comment; the reason is the only thing a later register can use to decide whether an override still earns its place |
| Assignments overridable as well | Two Services can claim one hostname, one node label, one Secret path | Reintroduces the collisions arbitration exists to prevent, at the layer with no arbiter |

## Reversibility
Undo cost today: delete the `overrides` array from the layer-1 schema, delete
the resolver branch that applies it, and fix the one field in the estate that
uses it — hours, blast radius one Workload. Becomes irreversible once: overrides
are numerous and unenumerated across the ~30 layer-1 repositories; withdrawing
the hatch then means tracing each one back to a derivation-rule change, with
the recorded reason as the only surviving record of why the value was chosen.

## Consequences
- Every exception carries machine-readable rationale instead of a comment —
  writing it paid by the overriding Workload's owner, once per override.
- Overrides cannot be enumerated estate-wide, so a dead override looks
  identical to a load-bearing one and both persist; this is an accepted cost —
  paid by the platform owner at the first estate-wide tuning change.
- Chapter 16's "no declaration has out-degree zero" property cannot run over
  overrides: the one surface permitting hand-tuning is the one surface the
  dead-declaration check is switched off — accepted, paid by joris.
- It stays recoverable: composition already reads every Intent Fragment
  ([0037](0037-composition-oci-fragments.md)), so a register of active
  overrides — and a test of whether each still changes anything — is a later
  read over data already in hand, not a new mechanism; build cost paid by the
  toolkit owner when the count justifies it.
- The overridable/non-overridable flag must be set on every new derived field
  and every new assignment — paid by the schema author, on each addition.
- A Service wanting a different hostname, node or namespace must go through
  arbitration and [0033](0033-assignments-published-back.md) rather than
  override locally — paid by that Service's owner in turnaround time.
