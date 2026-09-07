# Deferred — delivery and co-testing

These thirteen ADRs are **not part of the v1 model**. On 2026-09-07 the owner
split them out: *how the estate deploys, and how dependency on other units for
testing gates a deploy, are defined separately from the model.* They are
parked here as direction work — argued, evidenced, reviewed — for the separate
delivery-and-testing definition to take up, amend, or discard.

Status of everything in this directory:

- Not in the model register ([../README.md](../README.md)), not linted, not
  normative. Their `normative:` pointers name spec sections the v1 spec will
  **not** carry; the future delivery definition owns those.
- The model's complete interface to this work is three demands, all decided in
  the model: all-or-nothing [Release Unit](../0060-release-unit.md) cutover,
  destructive operations gated by
  [Durability Class](../0015-durability-class-per-volume.md), and rendering
  only from [pinned inputs](../0006-pinned-inputs.md).
- The experiment that informs whether push delivery is needed at all is
  [workspace#45](https://github.com/JorisJonkers-dev/workspace/issues/45)
  (write the caller for the existing system-test workflows); see
  [0008](0008-tested-equals-deployed-requires-push.md). It gates nothing in v1.
- Two items here describe **live defects whose fixes proceed regardless** of
  any delivery decision: the unpinned foundation charts in
  [0048](0048-class-b-pinning.md), and this repository's own unpinned CI.

## Inventory

| # | decides | one line |
|---|---|---|
| [0008](0008-tested-equals-deployed-requires-push.md) | premise | tested-equals-deployed cannot be had from pull alone — untested, falsifiable via workspace#45 |
| [0041](0041-push-delivery-boundary.md) | delivery | class A pushed by aggregators, class B stays with Flux |
| [0042](0042-apply-before-prune-inventory.md) | delivery | apply first, prune last, from an inventory of rendered kinds |
| [0043](0043-delete-authority-durability-gate.md) | delivery | deletion gated by Durability Class; no automatic PVC deletes |
| [0044](0044-reconcile-cronjob.md) | delivery | reconciliation as an in-cluster CronJob per aggregator |
| [0045](0045-break-glass-reporting.md) | delivery | break-glass exists, sticks, and reports itself |
| [0046](0046-distinct-field-managers.md) | delivery | one field manager per applier, serialised by a lease |
| [0047](0047-namespace-per-deployer.md) | delivery | a namespace has exactly one deployer |
| [0048](0048-class-b-pinning.md) | delivery | the foundation pinned like everything else — live defect today |
| [0049](0049-aggregator-owned-tests.md) | co-testing | system tests owned by the project that understands the relationship |
| [0050](0050-exercises-and-deploys.md) | co-testing | exercises many-to-many, deploys exactly-one |
| [0051](0051-vcluster-substrate.md) | co-testing | the test substrate is measured before it gates |
| [0058](0058-delivery-machinery-observability.md) | delivery | the delivery machinery watches itself |
