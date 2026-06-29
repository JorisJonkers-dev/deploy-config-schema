import YAML from "yaml";
import type { KubernetesObject } from "../model.js";

export function renderYamlDocument(value: unknown): string {
  return YAML.stringify(value, { indent: 2, lineWidth: 0, sortMapEntries: false, singleQuote: true });
}

export function renderYamlDocuments(values: KubernetesObject[]): string {
  return values.map((value) => renderYamlDocument(value).trimEnd()).join("\n---\n") + "\n";
}
