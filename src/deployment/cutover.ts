import { compareParityTrees, type ParityReport } from "./parity.js";
import type { Diagnostic } from "./model.js";

export type CutoverPlanOptions = {
  current: string;
  candidate: string;
  profile?: string;
};

export type CutoverPlan = {
  apiVersion: "deployment.jorisjonkers.dev/cutover-plan";
  kind: "CutoverPlan";
  profile: string;
  applying: false;
  current: string;
  candidate: string;
  parity: ParityReport;
  commands: string[];
  diagnostics: Diagnostic[];
};

export function createCutoverPlan(options: CutoverPlanOptions): CutoverPlan {
  const parity = compareParityTrees({ current: options.current, rendered: options.candidate });
  const diagnostics = parity.ok
    ? []
    : [{ code: "E_CUTOVER_PARITY_FAILED", path: "/", message: "candidate tree is not in parity with current tree" }];
  return {
    apiVersion: "deployment.jorisjonkers.dev/cutover-plan",
    kind: "CutoverPlan",
    profile: options.profile ?? "flux",
    applying: false,
    current: options.current,
    candidate: options.candidate,
    parity,
    commands: [
      `deploy-config-schema parity check --rendered ${options.current} --compiled ${options.candidate} --profile ${options.profile ?? "flux"}`,
      "review the parity report before switching any external source",
      "apply source changes with caller-owned deployment tooling only after owner approval",
    ],
    diagnostics,
  };
}
