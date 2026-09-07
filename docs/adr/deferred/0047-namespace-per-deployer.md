---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#deploy-authority
rests-on: ["0002"]
---

# A namespace has exactly one deployer

## Rests on

Once every namespace has one deploying Aggregator, its deployer Role reaches
nothing outside the Services that Aggregator deploys — the Secret reach `create`
confers included. False if: `kubectl auth can-i` returns `yes` for an Aggregator
ServiceAccount against a namespace outside its own `deploys` set, or composition
still admits two Services with different deployers into one namespace. Settled
by: `kubectl auth can-i --as=system:serviceaccount:deploy-system:deployer-<agg>
-n <ns> <verb> <resource>` over every Aggregator × foreign namespace ×
`create`/`patch`/`delete` × `deployments` and `vaultstaticsecrets`, every cell
`no`, plus a composition run reporting zero `E_NAMESPACE_FOREIGN_DEPLOYER`.

## Why

The first property [0002](../0002-kubernetes-as-substrate.md) keeps Kubernetes for is
"a workflow that tries to apply a Service it does not own receives a 403 rather
than producing a bad deploy" (`spec/v1/50-lifecycle.md:200`). The artefact meant
to deliver it does not: `spec/v1/examples/rendered/deployer-rbac.yaml:28-51`
grants `get, list, create, patch, update, delete` across eight apiGroups with no
`resourceNames` anywhere, scoped only by the Role's namespace (`:22`), while its
header comment declares the reach: `deploys: [auth-api, auth-ui] -> namespaces
auth-system, app-system` (`:8`). `app-system` is `home-portal`'s namespace by
chapter 20's alias catalogue (`spec/v1/20-resolved-deployment.md:131`), and
`home-portal` sits in this Aggregator's `exercises`, not its `deploys`
(`spec/v1/50-lifecycle.md:81-82`) — a different Aggregator applies it into a
namespace where this one holds `delete` on every Deployment. `aliases.namespace`
exists precisely to let Services share a namespace, so that is the sanctioned
case, and `E_MULTIPLE_DEPLOYERS` cannot see it: the invariant
(`spec/v1/40-composition.md:193`) asks whether a Service has two deployers, not
whether a namespace does. One correction to the review's wording: the file renders
a Role in `auth-system` only — two namespaces declared, one Role emitted, itself a
defect.

Withholding `secrets` verbs from that Role reads as a control and is not one.
`create`/`patch` on `deployments` (`:31-33`) suffices to read every Secret in the
namespace, because a Deployment may mount any Secret; `create`/`patch` on
`vaultstaticsecrets` (`:43-45`) suffices again, because a VaultStaticSecret may
name any Vault path the VSO role can reach and materialise it — the Vault reach
is bounded by VSO's role, not by the `deploys` list. Tightening the Role cannot
remove that escalation; the namespace is what bounds it.

So the rule is structural. One Aggregator deploys into a namespace; the `rbac`
adapter renders one Role and RoleBinding per namespace in that set;
`aliases.namespace` may not cross a deployer boundary, and composition rejects
one that does with `E_NAMESPACE_FOREIGN_DEPLOYER`, alias surviving as a rename
inside one deployer's own namespaces. This is the other half of making
[0002](../0002-kubernetes-as-substrate.md)'s first property real;
[0046](0046-distinct-field-managers.md) is the half for the drift signal.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Admission control: a validating webhook checking the deployer label on every write | a webhook to author, deploy and keep available on a cluster with one control-plane host — fail-closed stops every deploy while it is down, fail-open removes the control silently, and there is no second node to run it on | Strictly stronger, and rejected only for now: the availability cost lands on the single node [0002](../0002-kubernetes-as-substrate.md) names as the estate's shape. Revisit if namespaces prove unpartitionable; the in-server CEL variant drops that cost but still needs the ownership fact modelled. |
| `resourceNames` pinning the Role to the rendered object set | the `rbac` adapter regenerates a Role naming every object on every render, and the Role must be applied before the objects it names | Fails outright: `resourceNames` cannot restrict `create` — the name is unknown at authorization time — and `create` is exactly the verb yielding the namespace-wide Secret read. It also breaks `list`. |
| Keep the `deploy.jorisjonkers.dev/deployer` label as the boundary | nothing to build | The label is mutable and is the same query the prune pass runs; applied to another Aggregator's object, the wrong prune pass deletes it and RBAC permits it. |

## Reversibility

Undo cost today: hours for the mechanism — delete one composition invariant, let
the `rbac` adapter widen the Role again. The namespace moves it forces cost more:
a namespace change is a DNS change (`<service>.<namespace>.svc`), so consumers,
dependency edges and NetworkPolicies follow, and the blast radius is exactly the
Services sharing a namespace across deployers — today, `app-system`. Becomes
irreversible once: those Services have moved and are addressed at the new names.

## Consequences

- `aliases.namespace` narrows to a rename inside one deployer's own namespaces,
  and Services sharing one across deployers must move — paid by joris, once.
- The namespace-wide Secret read is contained, not removed: a compromised deploy
  workflow still gets every Secret its own Services hold, and withholding
  `secrets` verbs stops being describable as a control — paid by the estate, as
  accepted residual risk.
- Namespace count rises to at least one per deployer, multiplying per-namespace
  foundation objects, and [0002](../0002-kubernetes-as-substrate.md)'s first
  property becomes measurable — paid by joris, who owns both.
- The `rbac` adapter must emit one Role and RoleBinding per deployed namespace,
  which the worked example does not — paid by the adapter, as a fixed defect.
