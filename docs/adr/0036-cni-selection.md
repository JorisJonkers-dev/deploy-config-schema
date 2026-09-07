---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/60-setup.md#cni
rests-on: ["0002"]
---

# The CNI is chosen for a non-enforcing policy stage

## Rests on

Cilium fits these nodes on the pinned k3s version, and its audit stage reports
an undeclared flow without dropping it. False if: steady-state agent memory or
CPU per node displaces workloads on the single control-plane host, or the agent
will not come up on the pinned version with flannel and the bundled policy
controller disabled. Settled by: a lab-cluster evaluation on that version —
install with `--flannel-backend=none --disable-network-policy`, sample
`cilium-agent` memory and CPU per node over 24 h, then apply a default-deny
policy in audit mode and confirm an undeclared connection both succeeds and
appears in the flow log as a would-be-deny.

## Why

The old dependency-edges ADR rested the whole mitigation for default-deny on a
stage that does not exist: *"Default-deny must ship in audit mode first. Any
connection that exists but is not declared breaks the moment enforcement
lands"* — on a cluster it says *"is known to contain undeclared paths"*, with
three NetworkPolicy objects for roughly thirty workloads. The setup checklist
made that stage a hard precondition for the first production apply
(`60-setup.md:153`). But `networking.k8s.io/v1` NetworkPolicy has no audit,
dry-run or log-only mode — a policy is enforced the moment it selects a pod —
and k3s enforces policy with a bundled kube-router controller, which has none
either. The checklist carried an item that can never be ticked.

No decision ever picked a CNI. A repo-wide grep for
`cilium|calico|kube-router|flannel` returns zero hits outside the review files,
and the pack set (`fixtures/platform/full-tree.platform.yaml:26-32`) is
cert-manager, external-dns, two Traefiks, MetalLB and VSO. Nothing in the repo
records what runs; on the k3s default — flannel plus the bundled controller —
nothing enforces and nothing audits, and
`kubectl get ds -n kube-system -o name | grep -Ei 'cilium|calico'` returning
empty settles that this is the case here. A non-enforcing
stage is a vendor capability — Cilium's audit mode, Calico's staged policies —
so the gap was never an unstated threshold; there is nothing to promote *from*.

Cilium supplies both halves of what [0035](0035-network-policy-default-deny.md)
needs: an audit stage that logs what a policy would drop instead of dropping it,
and Hubble flow records, which make the promotion criterion — zero undeclared
flows over 14 days — an evidence question rather than a calendar one. That is
not free: the estate is one control-plane node plus one or two workers, and that
node also runs the API server, the datastore and the deploy runner. The
direction is fixed; the fit is open.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the k3s default (flannel plus the bundled policy controller) | nothing to install; `60-setup.md:153` is deleted instead of satisfied, and default-deny across ~30 workloads with 3 existing policies lands as enforce at the first render, on a node with no second control plane to debug from | it ships precisely the failure the old ADR named and then claimed to have mitigated |
| Calico | comparable install and per-node cost; staged policies give the non-enforcing stage | no per-flow observation surface, so the 14-day zero-undeclared-flows criterion needs a second tool or packet capture to evaluate |
| Ship enforce, gated on a hand-built flow inventory | days of sampling per workload, repeated whenever the estate changes | a snapshot, not continuous evidence; a path appearing after the sample is a production outage — the risk the audit stage exists to remove |

## Reversibility

Undo cost today: the CNI appears in no schema and no adapter, and no rendered
object references it — undoing is one k3s server flag set, a flannel reinstall,
the `## CNI` section of `../../spec/v1/60-setup.md`, and this file. Hours on a
lab cluster; on the production node, a datapath swap with an east-west outage.

Becomes irreversible once: policies are authored against Cilium-specific
semantics (a `CiliumNetworkPolicy`, an L7 rule, an identity-based selector), or
once enough allows rest on flow evidence only Hubble ever collected. Until then
the renderer emits portable `networking.k8s.io/v1` objects any CNI honours.

## Consequences

- The setup checklist item becomes satisfiable but stays honestly blocked until
  the evaluation reports, and [0035](0035-network-policy-default-deny.md) cannot
  ship enforce before then — paid by whoever wants the first production apply.
- The renderer keeps emitting `networking.k8s.io/v1` and nothing CNI-specific,
  so the audit stage is platform configuration, never artefact content — paid by
  the toolkit, which forgoes L7 and identity rules in v1.
- One more component joins the 41 foundation objects that exist to make the
  other 364 possible (`../../spec/v1/50-lifecycle.md`), with its own CRDs and
  upgrade cadence — paid by the operator, under [0048](deferred/0048-class-b-pinning.md).
- Installing it restarts the control-plane node's k3s server with flannel and
  the bundled controller disabled, interrupting east-west traffic on the machine
  that also runs the datastore and the deploy runner — paid by the operator.
- The platform facts [0057](0057-datastore-and-restore.md) makes required must
  carry the CNI and its flags, or the pinned context cannot tell the renderer
  whether an audit stage exists — paid by the schema.
