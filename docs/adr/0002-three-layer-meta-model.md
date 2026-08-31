---
status: proposed
---

# A three-layer meta-model, with the middle layer as a contract

Deployment configuration is modelled as three layers: **Service Intent**
(hand-authored, requirements only), **Resolved Deployment** (derived from Intent
plus cluster context, fleet facts and image locks; holds every platform
decision), and **Deliverable Set** (serialization only, no decisions). The
Resolved Deployment gets its own schema and its own version, and is reviewable
and diffable in CI.

## Why

Two layers were tried and produced three mutually incompatible documents all
claiming `deployment.jorisjonkers.dev/v2`: the service-repo authoring shape
(`spec.workloads` as a list), the collection shape (`spec.services` as a map),
and the resolved shape (`schemas/deployment.schema.json`, `spec.workloads` as a
map with `credentials[].claim`, `hooks` and `safety`). The estate documented the
consequence as a trap rather than fixing it — `validate deployment <file>`
resolves to the third and rejects the first on `/apiVersion`.

Naming the middle layer makes two rules enforceable rather than aspirational:
Service Intent contains no mechanisms, and the Deliverable Set contains no
decisions. Every field is then assignable to exactly one layer, and a reviewer
can read a diff of the Resolved Deployment to see what the platform decided on
their behalf.

## Considered options

- **Two layers, resolution private to the renderer.** Fewest moving parts and
  nothing extra to version. Rejected: it is the shape that produced the three
  rival schemas, and it leaves no vocabulary for deciding where a field belongs.
- **Three layers, middle layer documented but unversioned.** Keeps the
  vocabulary, drops the enforcement. Rejected: without a CI artifact the rule
  cannot fail, and a rule that cannot fail is a preference.

## Consequences

- A third schema to version and keep honest.
- `validate deployment` must be renamed per layer; the current name is ambiguous
  by construction.
