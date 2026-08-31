---
status: proposed
---

# System tests are owned by Aggregators, not by services

An **Aggregator** is its own repository declaring which Services it
exercises and which Services' deployments it gates. A Service declares no
co-test list. A Service's pre-deploy gate runs every project naming it, against
the pinned image set.

## Why

A co-test set cannot be derived from outbound dependencies. Of roughly
twenty-five classes in `stack-integration-tests`, twelve are `auth-api`
relationship tests — `AuthFlow`, `DownstreamOidcAuthorization`,
`ForwardAuthChain`, `ForwardAuthRedirect`, `GrafanaOidc`, `N8nOidc`,
`OAuth2Flow`, `RabbitMqOidc`, `Registration`, `SessionSecurity`, `Totp`,
`TotpReLogin` — and every one exercises `auth-api` *with its consumers*. A
Service never knows its own consumers, so a `coTestWith` list on `auth-api` would
require editing `auth-api` whenever any new consumer appears, which is the
provider-enumerates-consumers shape already rejected in ADR-0005.

Putting the declaration on the test project inverts it: the project that
understands a relationship declares the relationship.

The existing suite is not being deleted. ADR-0010 in the workspace decided to
wire it in, and recorded why the tests are not rotten: *"CI compiles and lints
all 32 classes on every PR; only execution is missing, because `tasks.test` calls
`excludeTags("system")`. Two dedicated tasks and two reusable workflows already
exist… Both have zero runs, ever - the only missing piece is a caller."* The 147
tests move into relationship-scoped projects rather than being rewritten.

## It also became the deploy unit

ADR-0019 makes the Aggregator the thing that applies to the cluster, so it
carries two lists:

- `exercises` — many-to-many. `auth-api` is exercised by its pairing with
  `auth-ui` and by the OIDC federation set, and the twelve auth relationship
  classes span both.
- `deploys` — one-to-one across the estate. Exactly one project may apply a given
  Service.

That distinction is what makes overlap safe: many gates, one applier. It is
enforced by `E_NO_DEPLOYER` and `E_MULTIPLE_DEPLOYERS` at composition, and
independently by the API server, because the `deploys` list generates the
Aggregator's RBAC — a workflow applying a Service it does not own gets a 403.

Every domain needs a default Aggregator, or a Service in none of them cannot deploy
at all. The media services need one: `jellyfin`, `sonarr`, `radarr`, `prowlarr`,
`bazarr`, `qbittorrent` and `immich` have zero test classes between them.

## Consequences

- A Service's gate must discover which Aggregators name it, which requires the
  composition mechanism in ADR-0015. Aggregators are participants like any
  other fragment publisher.
- `tests/stack-integration-tests` is decomposed. The auth federation suite is the
  natural first project and carries twelve of the classes.
- A relationship with no Aggregator has no gate, and nothing announces that.
  The participants list is the only place that absence can be made visible.
