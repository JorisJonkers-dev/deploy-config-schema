# Deploy Configuration

The language for describing what a service needs in order to run, and for
turning that into the files a GitOps cluster reconciles. One vocabulary, so a
concern is declared once and every other mention of it is derived.

## Language

### The three layers

**Layer**:
One of the three levels of the meta-model: Service Intent, Resolved Deployment,
Deliverable Set. Reserved for this meaning only.
_Avoid_: stage, phase, tier, level

**Service Intent**:
The hand-authored declaration of what a service requires, written in the repo
that owns the service. Contains requirements, never mechanisms.
_Avoid_: config, deployment spec, service config

**Resolved Deployment**:
The derived model produced by combining Service Intent with the Cluster
Context, fleet facts and image locks. Every platform decision is recorded here
and nowhere else. Never hand-authored.
_Avoid_: IR, intermediate representation, compiled config

**Deliverable Set**:
The files written for a target platform. Contains no decisions — only the
serialization of a Resolved Deployment.
_Avoid_: manifests, output, render, artifact

### Identity and grouping

**Service**:
The aggregate root of Service Intent, and the only thing another service may
reference. Owned by exactly one repository; a repository may own several.
_Avoid_: app, application, project, deployable

**Workload**:
A single running shape belonging to a Service — one Deployment, StatefulSet or
Job. Holds runtime shape, not identity.
_Avoid_: container, pod, instance, component

**Service Id**:
The one short, estate-unique string that names a Service. The only identity
another Service may write down.
_Avoid_: service name, app name, slug

**Alias**:
A deliberate divergence between a Service Id and a coordinate derived from it —
a namespace, workload or image name that differs for a recorded reason.
_Avoid_: override, rename, exception

**Domain**:
The ownership grouping a Service belongs to, and the owner of any shared
credential paths its providers expose. `data`, `mail`, `media`,
`observability`, `utility`, `agents`, `knowledge`, `edge`.
_Avoid_: group, area, collection, layer

**Reconcile Unit**:
A grouping of Deliverables that the cluster applies as one ordered step.
Derived from the dependency graph, never declared.
_Avoid_: layer, kustomization, apps-core, stage

**Tier**:
A named class of external exposure, carrying the hostname policy and the set of
authentication modes it permits. Reserved for exposure only.
_Avoid_: layer, channel, zone

### Authority

**Contended Value**:
A value that must be unique across the estate, or that draws on a shared finite
resource. The platform assigns it; Service Intent may only express a need for
it.
_Avoid_: shared value, global value, platform value

**Need**:
An expression in Service Intent of a requirement the platform must satisfy,
stated without naming the mechanism that satisfies it.
_Avoid_: requirement, request, intent

### Secrets

**Secret Store**:
The HashiCorp Vault instance holding credentials, addressed by KV-v2 data paths
such as `secret/data/platform/postgres`. Always named in full; never shortened
to "the vault".
_Avoid_: vault, the vault, secret manager

**Knowledge Vault**:
The Obsidian note repository behind the `knowledge` service, addressed by note
paths such as `_inbox/2026-06-04/plain.md`. Unrelated to the Secret Store
despite the shared word; a `vaultPath` in `knowledge` is one of these.
_Avoid_: vault, the vault

**Claim**:
A reference in Service Intent to a Secret Store path a Workload requires,
written as the full KV-v2 data path plus the keys within it. Fails the build if
no Secret Subtree declares that path.
_Avoid_: secret ref, credential ref, binding

**Secret Subtree**:
The portion of the Secret Store declared by one Domain — its paths, keys,
engines, and the Services permitted to read or write them. Composed with its
siblings into the whole tree; no repository holds all of it.
_Avoid_: vault config, secrets config, claims registry

**Claim Mode**:
How a claimed secret reaches the Workload. One of four: `env` (projected into a
Secret and bound to named environment variables), `fetch` (retrieved at runtime
by the application itself), `file` (written to a path on disk), `write` (a path
prefix the application creates entries under).
_Avoid_: delivery, injection, provisioning, binding

**Rotation Tolerance**:
What a Workload can survive when a secret it holds is replaced: `restart`,
`reload` or `none`. Declared by the Service and validated against its Claim
Mode — `reload` is achievable only under `fetch`, because a pod's environment is
fixed for its lifetime.
_Avoid_: ttl, rotation policy, refresh

### Configuration

**Runtime Profile**:
A named bundle of environment values the platform injects for a runtime family,
selected by the Service's declared `runtime`. Its values may not be authored by
a Service.
_Avoid_: defaults, base config, boilerplate

**Dependency Coordinate**:
A connection detail of a depended-upon Service — host, port, database name —
derived from the dependency graph and bound to whatever variable name the
consuming application expects.
_Avoid_: connection string, endpoint, service url

**Asset**:
A declarative settings file in a consuming application's own format, carried by
reference and mounted into a Workload, optionally with named placeholders
substituted. Never executable, and never a program.
_Avoid_: configmap, config file, mounted config

**Substitution**:
Replacement of a named placeholder in an Asset with a value from a declared
source. Restricted to named placeholders; not a template language.
_Avoid_: templating, interpolation, rendering

**Cluster Target**:
A cluster a Service can be deployed to, and the only axis along which declared
values may vary. There is one today, `production`. Not an environment name;
`staging`, `development` and `runtime` named no cluster that existed.
_Avoid_: environment, env, stage, target

**Change Response**:
What a Workload requires when an Asset or config value it reads changes:
`restart`, `reload` or `none`. Declared by the Service, defaulting to `restart`.
The counterpart of Rotation Tolerance for non-secret inputs.
_Avoid_: reload policy, refresh, onChange behaviour

**Startup Budget**:
How long a Workload may take to become ready from a cold start. Declared by the
Service; probe thresholds and the progress deadline are derived from it.
_Avoid_: startup timeout, grace period, initial delay

**Durability Class**:
What a volume's data is worth: `reconstructible` (rebuildable, never backed up),
`recoverable` (backed up with retention), `irreplaceable` (backed up with an
off-cluster copy, and relocation needs owner approval). Declared by the Service
because only it knows.
_Avoid_: retention policy, backup class, persistence

**Audience**:
Who a surface is reachable by: `anonymous`, `authenticated`, `internal`, `lan`.
The single vocabulary for exposure, used by both Services and Tiers, replacing
`authMode`, `auth.scope` and tier `authModes`.
_Avoid_: authMode, auth scope, access level, visibility

**Exposure**:
A Workload's declaration that one of its ports is reachable by an Audience,
optionally with per-path Audiences. Carries no hostname; the hostname is
assigned.
_Avoid_: route, ingress, endpoint

**Registered Unmanaged Surface**:
A hostname the model does not deploy but must still account for, carrying an
owner, a reason and a review date. Reachability must equal the derived set plus
the registered set exactly.
_Avoid_: exception, allowlist entry, external route

**Capability**:
A property a node advertises, named in the node declaration and required or
preferred by a Workload. Never a label; labels are derived from capabilities.
_Avoid_: label, selector, taint, node property

**Surface**:
A named connection point a Service offers — `postgres`, `amqp`, `http` — declared
once by the provider and referenced by name in every consumer's Dependency Edge.
_Avoid_: port, endpoint, connection

**Dependency Edge**:
A consumer's declaration that it uses one of a provider's Surfaces, and whether
it is required. Drives reconcile ordering, Dependency Coordinates, network policy
and co-test membership.
_Avoid_: dependency, link, reference

**Alert Class**:
How urgent a Workload's failure is: `none`, `business-hours`, `urgent`, `page`.
Declared by the Service; notifier routing is derived, because a notifier is a
shared resource.
_Avoid_: severity, priority, notifier

**Adapter**:
The component owning one target subsystem's output — Kubernetes objects, Traefik
routes, VSO objects, Gatus endpoints, Prometheus objects, Flux Kustomizations.
Every Deliverable belongs to exactly one.
_Avoid_: renderer, emitter, plugin

**Fragment**:
One Adapter's output for one Service. The unit of attribution and of drift
comparison.
_Avoid_: manifest, output, chunk

**Intent Fragment**:
The OCI artifact a domain repository publishes carrying its own declarations.
Composed with its siblings at render time; the resolved digests are recorded in
the lock as an output.
_Avoid_: package, bundle, module

**Bidirectional Ledger**:
A list of accepted exceptions that fails the build both when something is missing
from it and when one of its entries no longer matches anything. Every entry
carries an owner, a reason and a review date, so the list cannot outlive what it
excuses.
_Avoid_: allowlist, exemption list, ignore file

**System Test Project**:
A repository owning the tests for a relationship between Services, declaring
which Services it exercises and whose deployments it gates. Services declare no
co-test list.
_Avoid_: integration tests, e2e suite, test repo
