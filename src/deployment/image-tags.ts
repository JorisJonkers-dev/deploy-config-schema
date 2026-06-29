import type { Diagnostic } from "./model.js";

export type ImageTagValidationOptions = {
  allowedServices?: string[];
  requireAll?: boolean;
  rejectLatest?: boolean;
};

export type ImageTagValidationResult = {
  valid: boolean;
  seen: Record<string, string>;
  diagnostics: Diagnostic[];
};

export function validateImageTags(entries: string[] | string, options: ImageTagValidationOptions = {}): ImageTagValidationResult {
  const values = Array.isArray(entries) ? entries : entries.trim().split(/\s+/).filter(Boolean);
  const allowed = options.allowedServices ? new Set(options.allowedServices) : undefined;
  const seen = new Map<string, string>();
  const diagnostics: Diagnostic[] = [];

  if (values.length === 0) {
    diagnostics.push(diagnostic("E_IMAGE_TAGS_EMPTY", "/", "image tags are required"));
  }

  for (const [index, entry] of values.entries()) {
    const parsed = parseEntry(entry);
    if (!parsed.valid) {
      diagnostics.push(diagnostic(parsed.code, `/entries/${index}`, parsed.message));
      continue;
    }
    const { service, tag } = parsed;
    if (allowed && !allowed.has(service) && parsed.kind === "service") {
      diagnostics.push(diagnostic("E_IMAGE_TAG_SERVICE_UNSUPPORTED", `/entries/${index}`, `unsupported image tag service: ${service}`));
      continue;
    }
    if (allowed && !allowed.has(service) && parsed.kind === "image") {
      continue;
    }
    if (seen.has(service)) {
      diagnostics.push(diagnostic("E_IMAGE_TAG_SERVICE_DUPLICATE", `/entries/${index}`, `duplicate image tag service: ${service}`));
      continue;
    }
    if (options.rejectLatest && isLatestRef(tag)) {
      diagnostics.push(diagnostic("E_IMAGE_TAG_LATEST", `/entries/${index}`, `image tag for ${service} must not use latest`));
      continue;
    }
    seen.set(service, tag);
  }

  if (options.requireAll && allowed) {
    for (const service of [...allowed].sort()) {
      if (!seen.has(service)) {
        diagnostics.push(diagnostic("E_IMAGE_TAG_SERVICE_MISSING", `/services/${service}`, `missing required image tag service: ${service}`));
      }
    }
  }

  return {
    valid: diagnostics.length === 0,
    seen: Object.fromEntries([...seen.entries()].sort(([left], [right]) => left.localeCompare(right))),
    diagnostics,
  };
}

function parseEntry(entry: string):
  | { valid: true; kind: "service" | "image"; service: string; tag: string }
  | { valid: false; code: string; message: string } {
  const assignment = /^([a-z0-9][a-z0-9-]*)=(.+)$/.exec(entry);
  if (assignment) {
    return { valid: true, kind: "service", service: assignment[1], tag: assignment[2] };
  }
  if (!hasExplicitImageVersion(entry)) {
    return {
      valid: false,
      code: "E_IMAGE_TAG_VERSION_MISSING",
      message: `image reference must use an explicit tag or digest: ${entry}`,
    };
  }
  return { valid: true, kind: "image", service: serviceFromImageRef(entry), tag: entry };
}

export function serviceFromImageRef(ref: string): string {
  const withoutDigest = ref.split("@")[0];
  const imagePath = withoutDigest.split("/").at(-1) ?? withoutDigest;
  return imagePath.split(":")[0];
}

export function hasExplicitImageVersion(ref: string): boolean {
  const withoutDigest = ref.split("@")[0];
  const imagePath = withoutDigest.split("/").at(-1) ?? withoutDigest;
  return ref.includes("@sha256:") || imagePath.includes(":");
}

export function isLatestRef(ref: string): boolean {
  const withoutDigest = ref.split("@")[0];
  const imagePath = withoutDigest.split("/").at(-1) ?? withoutDigest;
  if (ref === "latest" || imagePath === "latest") return true;
  if (!imagePath.includes(":")) return false;
  return imagePath.split(":").at(-1) === "latest";
}

function diagnostic(code: string, path: string, message: string): Diagnostic {
  return { code, path, message };
}
