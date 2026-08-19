import { test } from "node:test";
import assert from "node:assert/strict";
import { runCli } from "../src/cli.js";

const stream = () => {
  let text = "";
  return { write: (chunk) => { text += chunk; }, text: () => text };
};

// Every value-taking flag must reject a missing value with a structured E_USAGE
// diagnostic rather than silently consuming the next argument as its value.
const VALUE_FLAGS = [
  ["--output", "--output requires a path"],
  ["--manifests", "--manifests requires a directory"],
  ["--template", "--template requires a value"],
  ["--target", "--target requires a value"],
  ["--blueprints-root", "--blueprints-root requires a directory"],
  ["--blueprints-version", "--blueprints-version requires a tag or ref"],
  ["--deploy-dir", "--deploy-dir requires a directory"],
  ["--images", "--images requires a path"],
  ["--repo", "--repo requires a value"],
  ["--git-sha", "--git-sha requires a value"],
  ["--version", "--version requires a value"],
  ["--out", "--out requires a path"],
  ["--sources", "--sources requires a path"],
  ["--lock", "--lock requires a path"],
  ["--env", "--env requires a value"],
  ["--node-contract", "--node-contract requires a path"],
  ["--reachability", "--reachability requires a path"],
  ["--deployment", "--deployment requires a path"],
  ["--collection", "--collection requires a path"],
  ["--collections", "--collections requires a path"],
  ["--inventory", "--inventory requires a path"],
  ["--contract", "--contract requires a path"],
  ["--labels-out", "--labels-out requires a path"],
  ["--label-prefix", "--label-prefix requires a value"],
  ["--root", "--root requires a directory"],
  ["--fleet", "--fleet requires a path"],
  ["--flux-tree", "--flux-tree requires a directory"],
  ["--flux-modules", "--flux-modules requires a directory"],
  ["--collections-root", "--collections-root requires a directory"],
  ["--current", "--current requires a directory"],
  ["--rendered", "--rendered requires a directory"],
  ["--compiled", "--compiled requires a directory"],
  ["--candidate", "--candidate requires a directory"],
  ["--profile", "--profile requires a value"],
  ["--generated-at", "--generated-at requires a value"],
];

test("every value-taking flag reports a structured usage error when its value is missing", async () => {
  for (const [flag, message] of VALUE_FLAGS) {
    const stdout = stream();
    const stderr = stream();
    const code = await runCli(["validate", flag], { stdout, stderr });
    assert.equal(code, 1, `${flag} should exit 1`);
    const diagnostics = JSON.parse(stderr.text()).diagnostics;
    assert.equal(diagnostics[0].code, "E_USAGE", `${flag} should raise E_USAGE`);
    assert.equal(diagnostics[0].message, message);
  }
});

// A value-taking flag consumes the next token even when it looks like another
// flag, so the missing-value branch only fires at end-of-argv; the command then
// fails on its absent positionals instead.
test("a value-taking flag consumes a following flag, failing later on missing positionals", async () => {
  const stdout = stream();
  const stderr = stream();
  const code = await runCli(["validate", "--output", "--target"], { stdout, stderr });
  assert.equal(code, 1);
  const diagnostics = JSON.parse(stderr.text()).diagnostics;
  assert.equal(diagnostics[0].code, "E_USAGE");
  assert.match(diagnostics[0].message, /^usage: deploy-config-schema validate /);
});
