---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/16-dependencies.md#network-policy
rests-on: ["0005", "0002"]
---

# Network policy is default-deny, derived from the edge set

## Rests on
The flows a workload legitimately needs are exactly its declared edges plus a
fixed platform baseline that no Service authors. False if: a flow observed
during the audit window matches no edge and no baseline rule, yet is legitimate
— the correct fix being a new baseline rule, not a missing edge. Settled by:
render the estate's policy set, load it into the non-enforcing stage
[0036](0036-cni-selection.md) selects, and diff 14 days of observed flows against
the rendered allow set; statically, a `conftest` rule asserting every rendered
NetworkPolicy carrying `Egress` in `policyTypes` also matches UDP/53.

## Why
Opt-in enforcement has already been measured on this estate and it lost. Three
NetworkPolicy objects exist for roughly thirty workloads, so the cluster is
effectively open east-west; three of thirty is the realistic adoption rate for
an opt-in control, and the number is the argument. Default-deny is only
expressible because the edge set is complete: an edge names the provider, the
surface and necessity ([0020](0020-dependency-edges-carry-surface.md)), so the
allow set is derived, not authored — what [0005](0005-derivation-is-total.md)
requires, on the substrate [0002](0002-kubernetes-as-substrate.md) keeps for its
enforcement boundary.

Audit-first is a dependency, not a mitigation. The earlier decision rested the
whole safety net on shipping "in audit mode first", and `spec/v1/60-setup.md:153`
made `default-deny NetworkPolicy is in **audit** mode, not enforce` a hard
precondition for the first production apply. `networking.k8s.io/v1` has no audit,
dry-run or log-only mode — a policy is enforced the moment it selects a pod — and
k3s enforces with an embedded kube-router controller that has none either. A grep
for `cilium|calico|kube-router|flannel` across `src/`, `spec/`, `schemas/`,
`fixtures/` and `docs/` returns zero hits, and no decision picked a CNI: the
precondition could never be ticked. It becomes satisfiable only via
[0036](0036-cni-selection.md), a CNI with a non-enforcing policy stage; until that
lands, default-deny does not ship. Promotion also gets the number the estate
lacked — `spec/v1/00-overview.md:162-163` recorded only that "The criterion for
promoting to enforce is unstated": **zero undeclared flows over 14 days**.

The derivation also carries a platform baseline no Service authors, and the dead
renderer generation shows why. `providerPolicy` in
`src/deployment/render/networkpolicy.ts:86-102` emits an egress policy whose only
rule is to the provider's pod; once any policy with `policyTypes: [Egress]`
selects a pod, all unmatched egress is denied, including UDP/53 to `kube-dns`.
No DNS allow rule exists anywhere in that file, so the consumer cannot resolve
the provider's own `svc.cluster.local` name — the address the coordinate
derivation hands it — and fails with a DNS timeout diagnosed as "Postgres is
down". Cluster DNS and the scrape path the same file omits are baseline rules
the spec chapter carries.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep policy opt-in, one flag per Service | Zero migration, no baseline needed, no CNI dependency | Measured: three policies for ~30 workloads is what opt-in produces here |
| Default-deny straight to enforce, no audit stage | Unblocks now; no CNI evaluation | Severs the undeclared east-west paths this estate is known to contain, at first render, on one node with no second control plane to debug from |
| One allow-all-within, deny-across policy per namespace | One object per namespace; no edge set needed | `aliases.namespace` lets two Services share a namespace, so the namespace is not the trust boundary ([0047](deferred/0047-namespace-per-deployer.md)) |
| Replace the audit stage with flow logs off the existing Alloy/Loki pack | A pipeline to build; weeks of work | A flow log says a connection happened, not that the rendered policy would have dropped it — it cannot produce the promotion number |

## Reversibility
Undo cost today: nothing renders a default-deny policy yet, so undo is deleting
the baseline, the edge-to-policy derivation in one networking adapter, and the
promotion gate — hours, blast radius zero: the three hand-written cluster
policies are untouched either way.

Becomes irreversible once: enforcement is on estate-wide. A change to the edge
shape then re-renders every workload's policy at once, and the only path back is
allow-all per namespace — open east-west in one step, no intermediate posture.

## Consequences
- Every legal flow must be declared before promotion; an undeclared path becomes
  a broken workload at enforce — paid by the consuming Service's owner.
- Cluster DNS and the scrape path are baseline rules in the derivation, so no
  workload can lose DNS by forgetting one — paid by the renderer, which owns a
  rule no author can see, and by anyone needing an exception to it.
- Default-deny cannot ship before [0036](0036-cni-selection.md); the setup
  checklist item stays untickable until then — now a stated dependency rather
  than a silent one — paid by whoever owns the CNI evaluation.
- The 14-day window replaces a judgement call with a number, at two weeks of
  calendar before enforce — paid by the security posture in the gap.
- A typo in a `surface` name narrows the allow set silently and renders a valid
  policy — paid by the on-call, who sees a connection timeout, not an error code.
- Roughly thirty workloads each gain policy objects where three exist today —
  paid by the deployer's apply time and the API server's object count.
