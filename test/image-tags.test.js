import { test } from "node:test";
import assert from "node:assert/strict";
import { hasExplicitImageVersion, isLatestRef, serviceFromImageRef, validateImageTags } from "../src/deployment/image-tags.js";

const codes = (result) => result.diagnostics.map((d) => d.code);

test("validateImageTags accepts a whitespace-separated string as well as an array", () => {
  const result = validateImageTags("api=v1.0.0 ui=v2.0.0");
  assert.equal(result.valid, true);
  assert.deepEqual(result.seen, { api: "v1.0.0", ui: "v2.0.0" });
});

test("validateImageTags requires at least one entry", () => {
  assert.deepEqual(codes(validateImageTags([])), ["E_IMAGE_TAGS_EMPTY"]);
  assert.deepEqual(codes(validateImageTags("   ")), ["E_IMAGE_TAGS_EMPTY"]);
});

test("validateImageTags rejects an image reference with no tag or digest", () => {
  const result = validateImageTags(["ghcr.io/example/api"]);
  assert.deepEqual(codes(result), ["E_IMAGE_TAG_VERSION_MISSING"]);
  assert.equal(result.diagnostics[0].path, "/entries/0");
});

test("validateImageTags rejects an unsupported service assignment but silently skips an unlisted image ref", () => {
  const assigned = validateImageTags(["other=v1"], { allowedServices: ["api"] });
  assert.deepEqual(codes(assigned), ["E_IMAGE_TAG_SERVICE_UNSUPPORTED"]);

  // An image reference for a service outside the allow-list is not an error: a
  // deploy bundle may legitimately carry third-party images alongside its own.
  const referenced = validateImageTags(["ghcr.io/example/other:v1"], { allowedServices: ["api"] });
  assert.equal(referenced.valid, true);
  assert.deepEqual(referenced.seen, {});
});

test("validateImageTags rejects duplicate services", () => {
  assert.deepEqual(codes(validateImageTags(["api=v1", "api=v2"])), ["E_IMAGE_TAG_SERVICE_DUPLICATE"]);
});

test("validateImageTags rejects latest only when asked, across bare, tagged and digest forms", () => {
  assert.equal(validateImageTags(["api=latest"]).valid, true);
  assert.deepEqual(codes(validateImageTags(["api=latest"], { rejectLatest: true })), ["E_IMAGE_TAG_LATEST"]);
  assert.deepEqual(codes(validateImageTags(["ghcr.io/example/api:latest"], { rejectLatest: true })), ["E_IMAGE_TAG_LATEST"]);
  assert.equal(validateImageTags(["ghcr.io/example/api@sha256:abc"], { rejectLatest: true }).valid, true);
});

test("validateImageTags reports every missing required service in sorted order", () => {
  const result = validateImageTags(["api=v1"], { allowedServices: ["ui", "api", "gatus"], requireAll: true });
  assert.deepEqual(codes(result), ["E_IMAGE_TAG_SERVICE_MISSING", "E_IMAGE_TAG_SERVICE_MISSING"]);
  assert.deepEqual(result.diagnostics.map((d) => d.path), ["/services/gatus", "/services/ui"]);
});

test("validateImageTags sorts the services it saw", () => {
  assert.deepEqual(Object.keys(validateImageTags(["ui=v1", "api=v1"]).seen), ["api", "ui"]);
});

test("serviceFromImageRef strips registry, path and digest", () => {
  assert.equal(serviceFromImageRef("ghcr.io/example/api:v1"), "api");
  assert.equal(serviceFromImageRef("ghcr.io/example/api@sha256:abc"), "api");
  assert.equal(serviceFromImageRef("api"), "api");
});

test("hasExplicitImageVersion accepts a tag or a digest and rejects a bare name", () => {
  assert.equal(hasExplicitImageVersion("ghcr.io/example/api:v1"), true);
  assert.equal(hasExplicitImageVersion("ghcr.io/example/api@sha256:abc"), true);
  assert.equal(hasExplicitImageVersion("ghcr.io/example/api"), false);
});

test("isLatestRef matches a bare latest, a latest tag, and nothing else", () => {
  assert.equal(isLatestRef("latest"), true);
  assert.equal(isLatestRef("ghcr.io/example/latest"), true);
  assert.equal(isLatestRef("ghcr.io/example/api:latest"), true);
  assert.equal(isLatestRef("ghcr.io/example/api:v1"), false);
  assert.equal(isLatestRef("ghcr.io/example/api"), false);
  assert.equal(isLatestRef("ghcr.io/example/api@sha256:abc"), false);
});
