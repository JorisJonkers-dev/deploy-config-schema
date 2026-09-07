# Negative fixture — `E_DUPLICATE_SERVICE_ID`

Two Intent Fragments declaring the same Service Id. Composition must reject
this union, **with this error code**.

Each fragment is otherwise valid and schema-complete, so the union reaches the
identity check rather than failing earlier for an unrelated reason. That is
load-bearing: a fixture rejected by `E_SCHEMA_VERSION_MISMATCH` on the way in
proves the version check can fail and says nothing about identity.

## The assertion asserts the code, not the exit status

The compose workflow applies this fixture on every run
([`../../workflows/compose.yml`](../../workflows/compose.yml)) and greps the
error code out of the output. A step that accepted any non-zero exit was the
same defect the fixture exists to catch, one level up: the estate's proof that
its identity invariant can fail would quietly have become a proof that
something else can fail, and nobody would be told the difference.

The estate agent contract puts it as *"verify the value, not the command"* — an
exit code is not evidence that a consumer saw what you intended. An assertion
that silently stopped running looks identical to one that passes, which is how
`E_ROUTE_AUTH_MODE_NOT_IN_TIER` came to be implemented, error-coded, and
vacuous for three of four routed services.

One negative fixture per invariant is the target. This is the first.
