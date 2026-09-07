---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/30-deliverables.md#attribution
rests-on: ["0003"]
---

# Every Deliverable is attributed to exactly one Adapter

## Rests on

Attribution is derivable from the registry rather than reconstructed from rendered
output: every registered adapter declares its own output path, and the exported
`adapterContract()` carries name, target, input, status and path for all sixteen.
False if: an adapter can be registered without a declared output path, or a
rendered file lands at a path no registered adapter declares. Settled by:
`node -e "import('./dist/src/index.js').then(m=>console.log(m.adapterContract().implemented.map(a=>a.name+' '+a.defaultPath).join('\n')))"`
— run 2026-08-31 against `src/adapters/registry.ts:36-188`: 16 definitions, each
carrying `defaultPath`, and `registry.ts:231-235` throws `adapter definition missing defaultPath`.

## Why

Every file in the Deliverable Set is produced by exactly one Adapter, as one
Fragment per Adapter per Service. The adapter and fragment layer already exists
and works — sixteen registered adapters, `adapter-compat`, parity checking with a
behavioural profile, a deterministic render hash, and an artifact contract.
Replacing it with direct rendering would discard attribution, and attribution is
what lets a diff say which subsystem produced a file. It is also what makes the
prune inventory of [0042](deferred/0042-apply-before-prune-inventory.md) derivable and the
coverage assertion of [0055](0055-bidirectional-ledgers.md) checkable: both ask
"who produced this object", and only a per-adapter owner answers.

A target-neutral deliverable IR was considered and rejected. Consul and Nomad
appear in this estate only in a `flux-modules` denylist and in a reserved
`extensions.nomad` slot annotated *"Reserved extension area for future Nomad
inputs. No renderer consumes it in this feature."* (`src/schemas/generated-json.js:548`;
`src/artifact-validator.ts:186` enforces `renderer_status: design_only`). An
abstraction with one consumer is shaped entirely by that consumer, so it would be
Kubernetes-shaped and wrong for Nomad at the moment Nomad arrived. If a second
target ever exists, that is the time to lift the abstraction, with two real
consumers to shape it.

One owner per path is asserted today and enforced nowhere. Five of the sixteen
registered names end in `-fragment` and shadow an earlier adapter — chapter 30
names four such pairs and misses `kubernetes-workload-fragment`; the twins avoid
a literal collision only because they write under `fragments/` while the first
generation writes under `platform/cluster/flux/`. Three adapters (`kubernetes`,
`flux-packs`, `flux-source`) declare the same `platform/cluster/flux/apps` prefix.
`E_PATH_COLLISION` appears once in the whole tree, at
`spec/v1/40-composition.md:150`, with zero occurrences under `src/`.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Target-neutral deliverable IR, per-target backends | A third layer between intent and YAML, plus a backend per target; the sixteen adapters are rewritten against it | One consumer shapes the abstraction entirely — it would be Kubernetes-shaped and wrong for Nomad on arrival. Lift it when a second target exists |
| Direct rendering, no adapter layer | Deletes ~16 registry entries and the artifact contract; saves the port work of [0053](0053-adapter-port-contract.md) | Discards attribution: a diff can no longer say which subsystem produced a file, and the prune inventory becomes hand-maintained |
| Post-hoc attribution — annotate rendered objects, scan the output tree | An annotation convention plus a scanner; no registry change | Attribution becomes a property of output that can be lost by any edit, rather than a property of the producer that the build can check |
| Shared ownership of a path, merged at render | No collapse of the `-fragment` twins; keeps both generations alive | Two producers for one file means no answer to "who produced this", and merge order becomes load-bearing |

## Reversibility

Undo cost today: attribution is one declared field per registry entry plus a
uniqueness check over sixteen paths — dropping it touches `src/adapters/registry.ts`
and the coverage assertion, hours of work, no cluster blast radius.
Becomes irreversible once: the ledgers, the coverage assertion and the prune
inventory are keyed on the producing adapter and a live cluster is reconciled
against them. From then, removing attribution means re-deriving ownership for
every live object by hand.

## Consequences

- Each Adapter must become total for its target subsystem, and today none are — paid by the adapter owner.
- The totality gap must be measured **per adapter against the registered generation** ([0052](0052-registered-adapters-are-v1.md)) before any schedule is committed; the old count of 342 files under `fleet-infra/cluster` measured the cluster tree instead of the registry and is not the number to plan against — paid by the programme.
- The five `-fragment` twins must collapse to one owner per kind, and `E_PATH_COLLISION` must be implemented, before the coverage assertion can be enforced — paid by the toolkit maintainer.
- A file no adapter claims cannot ship silently: it becomes a ledger entry with an owner and a reason ([0055](0055-bidirectional-ledgers.md)) — paid by the Service owner.
- One Fragment per Adapter per Service multiplies fragment count by the adapter set, and every one is pushed and pulled by composition ([0037](0037-composition-oci-fragments.md)) — paid by the registry and the composition step.
- A reviewer reading a Deliverable diff can name the producing subsystem without reading render code — paid by the adapter owner, who must declare and defend a unique `defaultPath` on every registry entry.
