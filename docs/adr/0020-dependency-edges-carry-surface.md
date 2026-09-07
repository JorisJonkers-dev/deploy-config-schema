---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/16-dependencies.md#dependency-edges
rests-on: ["0005"]
---

# A dependency edge names the provider, the surface, and necessity

## Rests on
Every cross-service connection in the live estate is expressible as a triple —
provider Service Id, one surface that provider already declares, and whether the
consumer requires it. False if: a live connection needs an address or port that
no provider `provides` entry can name, or fans out to more than one provider
Service under a single consumer reference. Settled by: extract every host:port
literal and every endpoint-shaped environment key from the first-party
workloads' env files and configuration, and match each to a `provides` entry on
the Service that owns that address — any reference matching no declared surface
is a counterexample.

## Why
An id alone is not enough, and the only NetworkPolicy code the estate ever wrote
shows why. Nothing derives network policy in the shipping pipeline —
`render/networkpolicy.ts` is unregistered and unreachable
(`spec/v1/30-deliverables.md:83`; imported only by
`test/deployment-networkpolicy-render.test.js`), and the three live NetworkPolicy
objects are hand-authored. Even that dead attempt derived policy only from
credential claims matched to provider exports carrying an endpoint:
`src/deployment/render/networkpolicy.ts:68` returns nothing when
`!provider.endpoint`, and line 70 then filters `model.providerGraph.credentials`
by `credential.claim === provider.name || credential.claim.endsWith('.' + provider.name)`.
A dependency with no credential —
`knowledge` calling `auth-api` over HTTP — therefore produces neither a policy
nor a coordinate. That value has to live somewhere, and [0011](0011-configuration-env-files-per-workload.md)
makes writing a derived value as a literal a build error, so an id-only edge
leaves the no-credential dependency with no legal home at all: the consumer may
not author `AUTH_API_URL`, and nothing derives it for them.

Naming the surface also puts the port in one place. The provider declares its
surfaces once; every consumer refers to them by name rather than restating
`5432`, and the Service Id stays the only referencable identity
([0010](0010-flat-service-identity.md)). That single declaration is then enough
for four derivations that today are four separate hand-maintained artefacts:
Reconcile Unit ordering ([0032](0032-reconcile-unit-derived.md)), dependency
coordinates, NetworkPolicy egress, and co-test membership
([0049](deferred/0049-aggregator-owned-tests.md)). The estate's current state is the
argument for completeness: three NetworkPolicy objects exist for roughly thirty
workloads, so the cluster is effectively open east-west, and no default-deny
posture ([0035](0035-network-policy-default-deny.md)) is even expressible until
the edge set describes every legal flow.

Necessity is a third axis, not a restatement of the first two. `required: false`
yields an allow rule but no reconcile ordering and no startup gate, so an
optional dependency cannot deadlock a rollout; `required: true` — the default —
buys both. Folding reachability into ordering would force every consumer that
merely talks to a Service to also block on it.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| `dependsOn: [auth-api]`, surface inferred from the provider's sole or primary export | Zero authoring cost; ambiguous the first time a provider declares two surfaces — `platform-postgres` already exports more than a database port | Leaves the no-credential dependency with no coordinate and no policy, the exact hole the unregistered `networkpolicy.ts` attempt already had |
| Consumer restates the port: `{service: platform-postgres, port: 5432}` | One extra literal per edge; ~30 workloads to update whenever a provider moves a port | Duplicates the provider's own declaration in every consumer, so a port change is an estate-wide edit that no tool can verify |
| Provider enumerates its consumers (`allowedConsumers:`) | The provider repository gains a merge on every new consumer; two PRs in two repos per edge | A provider never knows its own consumers; the list is stale from the first unmerged branch, and staleness fails open |
| Derive the edge set from observed traffic | Needs a flow-log pipeline the cluster does not run | Captures accident as intent; cannot tell a legal flow from a leak |

## Reversibility
Undo cost today: `surface` and `required` are two fields on one list in the
Service schema plus the four derivation sites that read them; with no production
edges authored yet, removing them is a schema edit and a renderer change measured
in hours. The cost is not the edit — the undo reinstates the coordinate hole, so
every Service already migrated off a hand-written endpoint literal has to have
that literal written back by hand.

Becomes irreversible once: the derived edge set is the enforced description of
legal east-west traffic. From the moment policy runs in enforce
([0035](0035-network-policy-default-deny.md)), widening or dropping the edge
shape re-renders every workload's policy at once, and the only safe path back is
allow-all across the cluster.

## Consequences
- A provider must declare its surfaces before any consumer can name one, so a
  new edge is two changes in two repositories — paid by the consuming owner.
- A port is written once and never restated, so moving it is a one-repository
  change — paid by the provider, who now owns a name others depend on.
- Credential-free dependencies become declarable and therefore visible; the
  `knowledge` → `auth-api` edge acquires a coordinate and a policy — paid by
  every Service relying on an undeclared path.
- One `surface` name is load-bearing for four outputs, so a typo mis-renders
  ordering, coordinates, policy and co-tests at once — paid by the on-call.
- `required: false` gives an allow rule with no ordering and no startup gate, so
  the consumer must tolerate the provider being absent at start — paid by the
  consumer's own startup code.
- Undeclared east-west paths, which this estate is known to contain, stay
  invisible until enforcement — paid by whoever breaks at promotion.
