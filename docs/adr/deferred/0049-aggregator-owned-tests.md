---
tier: decision
status: proposed
claim: settled
date: 2026-08-31
normative: spec/v1/50-lifecycle.md#co-testing
rests-on: ["0001"]
---

# System tests are owned by Aggregators

## Rests on

A co-test set cannot be derived from a Service's own declarations: most existing
system-test classes exercise a provider together with its consumers, and a
Service declares outbound edges only — it never names who calls it. False if:
every class in the existing suite touches only Services inside the outbound
dependency closure of one Service it names, making the set derivable and a new
document unnecessary. Settled by: for each class under
`tests/stack-integration-tests/src/test`, grep the Service hostnames it
references to obtain the set it touches, then compare that set against the
outbound `dependsOn` closure of every Service it names; the claim fails if every
set is contained in one such closure.

## Why

The suite already shows which way the edges run. Of the 32 system-tagged classes
in `tests/stack-integration-tests`, twelve are `auth-api` relationship tests —
`AuthFlow`, `DownstreamOidcAuthorization`, `ForwardAuthChain`,
`ForwardAuthRedirect`, `GrafanaOidc`, `N8nOidc`, `OAuth2Flow`, `RabbitMqOidc`,
`Registration`, `SessionSecurity`, `Totp`, `TotpReLogin` — and every one
exercises `auth-api` *with its consumers*: `auth-ui`, `home-portal`,
`agents-ui`, `grafana`, `n8n`, `platform-rabbitmq`. Five of those six appear
nowhere in `auth-api`'s own outbound edges; the sixth, `platform-rabbitmq`,
appears only as a provider of `amqp`
(`../../spec/v1/examples/auth-api.service.yml:65`), never as the OIDC consumer
`RabbitMqOidc` exercises. A provider's edge set points at what it calls, never
at what calls it.

That is the whole argument, and it needs no borrowed authority: a Service knows
what it calls and never knows what calls it — the same property chapter 40
already names, *"No Service knows its own consumers, so none of these are
locally computable"* (`../../spec/v1/40-composition.md:22`). Put the co-test
list on the provider and `auth-api` becomes a register of its own consumers:
every new routed service in the estate arrives as a pull request against the one
repository with no reason to know it exists, and a forgotten edit silently
removes a gate rather than failing anything. Putting the declaration on the test
project inverts it — the project that understands a relationship is the project
that declares it. An Aggregator is its own repository carrying an `exercises`
list; a Service declares no co-test list, and its pre-deploy gate runs every
project naming it, against the pinned image set.

Nothing is rewritten to get there. [workspace ADR-0010](https://github.com/JorisJonkers-dev/workspace/blob/main/docs/decisions/ADR-0010-system-tests-disposition.md)
recorded why the suite is not rotten: *"CI compiles and lints all 32 classes on
every PR; only execution is missing, because `tasks.test` calls
`excludeTags("system")`. Two dedicated tasks and two reusable workflows already
exist… Both have zero runs, ever - the only missing piece is a caller."* The 147
tests move into relationship-scoped projects; none is rewritten. This decision is
also independent of [0008](0008-tested-equals-deployed-requires-push.md): if that
premise falls and delivery stays a Flux pull, the question *which repository runs
the auth federation suite before `auth-api`'s image moves* still has to have
exactly one answer. Relationship ownership is what survives the premise. The
`deploys` half of the same file — one applier per Service — is
[0050](0050-exercises-and-deploys.md).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| `coTestWith` list on the provider Service | An edit to `auth-api` for every new consumer; six exist in the auth set today and each newly routed service adds another | The provider never knows its consumers, so the list rots by omission — and an omission silently deletes a gate instead of failing a check |
| Derive the co-test set from outbound dependency edges | Nothing to author: composition computes it from edges that already exist | Twelve of ~25 classes name Services outside any single provider's outbound closure; the derivation drops precisely the tests that exercise a relationship |
| Keep one monolithic suite and gate every Service on all of it | No decomposition work; one workflow caller and the gap closes | Every Service then waits on all 32 compiled classes, most unrelated to it, and one flake in the media smoke tests blocks an auth deploy |

## Reversibility

Undo cost today: `exercises` is one key in `aggregator.yml`
(`../../spec/v1/examples/aggregator.yml`) plus the composition invariant that
resolves its targets (`E_UNRESOLVED_TEST_TARGET`). Nothing has moved yet — the
suite is still one project with zero runs — so undoing means deleting a key and
a check: an hour, no cluster change, no test rewritten. Becomes irreversible
once: the 147 tests are split across the aggregator repositories and each holds
its own history and CI, and Service gates resolve their gate set through the
participants list rather than a fixed workflow name; recombining is then a
repository merge per suite plus a rewrite of every gate.

## Consequences

- A Service's gate must discover which Aggregators name it, which is only possible through composition, making [0037](../0037-composition-oci-fragments.md) and [0038](../0038-participants-list-staleness.md) prerequisites for having any gate at all — paid by joris, at build time.
- `tests/stack-integration-tests` is decomposed; the auth federation suite is the natural first project and carries twelve of the classes — paid by joris, once.
- A relationship with no Aggregator has no gate, and nothing announces that absence; the participants list is the only place it can be made visible — paid by whoever later debugs the untested relationship.
- Every domain needs a default Aggregator or a Service named by none cannot deploy at all: `jellyfin`, `sonarr`, `radarr`, `prowlarr`, `bazarr`, `qbittorrent` and `immich` have zero test classes between them and get one behind smoke tests only — paid by joris.
- Adding a consumer to a relationship becomes a pull request in the aggregator repository rather than in the consumer's own — paid by the consumer's author, on every new edge.
