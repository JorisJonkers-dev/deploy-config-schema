---
status: proposed
---

# Exposure is declared by Audience; unmanaged surfaces are registered

A Workload declares exposure as a surface with an **Audience**, and per-path
audiences where they differ. Hostname, route tier, middleware, IngressRoute,
reachability entry and health endpoint are all derived from that one
declaration. One closed Audience vocabulary is shared by Services and by route
tiers. Service Intent covers Kubernetes workloads only; any hostname the model
does not deploy is listed as a **Registered Unmanaged Surface**, and the
derivation asserts that reachability contains exactly the derived set plus the
registered set.

## Why

One hostname, `kb.jorisjonkers.dev`, was declared in seven authoritative
places. Six of them become derived under this decision: the reachability
channel, both edge catalogs, both Traefik IngressRoutes, and the Gatus endpoint.
The two conformance tests that existed only to detect disagreement between them
become unnecessary rather than merely green.

The deeper defect was that one concept had three disjoint vocabularies:

| where | values |
|---|---|
| service `route.authMode` | `anonymous`, `sso`, `forward-auth` |
| tier `authModes` | `forward-auth`, `internal`, `lan` |
| rule `auth.scope` | `anonymous`, `authenticated`, `application` |

Only `forward-auth` appeared in two of them; `sso`, `internal`, `lan`,
`authenticated` and `application` each appeared in exactly one. Because the
values were never comparable, the gate that should have caught this could not.
And it did not fire anyway: `validateDeploymentSemantics` checks `authMode`
against a tier only `if (tier && …)`, and three of the four routed services
declare no `expose.tier` at all — `auth-api` (`anonymous`), `agents-api`
(`sso`) and `home-portal` (`anonymous`), every one of them on a public
`*.jorisjonkers.dev` hostname whose only tier permits `forward-auth` alone.
`E_ROUTE_AUTH_MODE_NOT_IN_TIER` was implemented, had an error code, and was
vacuous exactly where it mattered.

A single Audience vocabulary makes that class of bug structurally impossible: a
Service and a tier can no longer describe the same thing in different words.

## Scope, and the remainder

The estate has three deployment targets, not one. `samba` exists only as a NixOS
module yet owns `samba.lan.jorisjonkers.dev`; `wolf` exists in neither target and
owns `wolf.jorisjonkers.dev`; `adguard` and `ollama` exist in both Kubernetes and
nix. Host-level services — `tailscale`, `media-storage`, `backup-storage`,
`btrfs-backup-snapshots` — have no cluster presence.

Modelling all of them was rejected: rendering NixOS is not writing a file but
producing a build and an activation, and it would have made v1 an
order of magnitude larger. So Service Intent stays Kubernetes-only.

That leaves a remainder, and an unbounded remainder is how the seven-way split
began. Registered Unmanaged Surfaces bound it: each un-deployed hostname carries
an owner, a reason and a review date, and the render asserts set equality. An
unregistered hostname is a build error. `wolf`'s status — a public hostname with
no deployment anywhere — becomes explicit data rather than an accident nobody
noticed.

## Consequences

- A Service owner cannot read their own hostname from their own repository. The
  Resolved Deployment must be published back to the owning repository. This is
  now the second decision to require that (see ADR-0003) and it is no longer
  optional.
- `authMode`, `auth.scope` and tier `authModes` are all replaced. Every routed
  service repository changes, and the two edge catalogs plus the Gatus endpoint
  ConfigMap stop being authored.
- A Registered Unmanaged Surface is an unverified assertion: nothing proves
  `samba` is actually listening where the registration claims.
