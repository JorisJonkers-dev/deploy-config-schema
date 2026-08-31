# Negative fixture — `E_DUPLICATE_SERVICE_ID`

Two Intent Fragments declaring the same Service Id. Composition must reject
this union.

The compose workflow applies this fixture on every run, because
`CLAUDE.md` is explicit: *"check your own gate can fail before trusting that it
passed."* An assertion that silently stopped running looks identical to one that
passes — which is how `E_ROUTE_AUTH_MODE_NOT_IN_TIER` came to be implemented,
error-coded, and vacuous for three of four routed services.

One negative fixture per invariant is the target. This is the first.
