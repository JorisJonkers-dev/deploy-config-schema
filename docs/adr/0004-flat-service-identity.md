---
status: proposed
---

# One flat Service Id, with deliberate renames as data

A Service is identified by a single short string, unique across the estate, and
that string is the only identity another Service may reference. Namespace,
workload name and image reference are derived from it by rule. A divergence is
expressed as an `alias` carrying the reason for it.

## Why

Six coordinates currently name one thing: the `home-portal` repository holds a
document named `app-ui`, in namespace `app-system`, with a workload `app-ui`
running the image `home-portal`, whose route declares `owner: home-portal`.
`fleet-infra/docs/live-divergence.md` records the reason — *"the service
repository is home-portal; live called the image app-ui. A rename, not a
different image"* — and `stalwart` / `stalwart-provisioner` is a second case.

Renames are permanent in this estate, not migration artifacts. A model with no
field for one forces the explanation into prose, where it is re-litigated at
every render and re-discovered by every reviewer. An `alias` with a `reason`
turns a documentation row into a validated field.

## Considered options

- **Domain-qualified id** (`data/platform-postgres`), mirroring the vault claim
  format and the collection layout. Rejected: moving a Service between domains
  would rename it and break every inbound reference and Vault path.
- **Location-derived URN** (`svc:<org>/<repo>`), unique by construction and
  self-resolving. Rejected: `homelab-collections` holds three Services in one
  repository, so the repo coordinate does not identify a Service.

## Consequences

- Uniqueness is enforced by an estate-wide check, not by construction. Two
  repositories can claim one id until that check runs.
