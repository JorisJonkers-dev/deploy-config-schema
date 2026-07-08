export const HEALTH_TIMEOUT_CLASS_MAP: Record<string, string> = {
  "stateless": "5m",
  "stateful": "10m",
  "control-plane": "15m",
};

export function validateHealthTimeoutClass(cls: string): void {
  if (!(cls in HEALTH_TIMEOUT_CLASS_MAP)) {
    throw new Error(`E_UNKNOWN_HEALTH_TIMEOUT_CLASS: '${cls}' is not a valid health timeout class. Allowed: ${Object.keys(HEALTH_TIMEOUT_CLASS_MAP).join(", ")}`);
  }
}

export type WorkloadWithHealth = {
  health?: { timeoutClass?: string };
};

export function resolveHealthTimeout(workloads: WorkloadWithHealth[]): string {
  const priority = ["control-plane", "stateful", "stateless"];
  for (const cls of priority) {
    if (workloads.some((w) => w.health?.timeoutClass === cls)) {
      return HEALTH_TIMEOUT_CLASS_MAP[cls];
    }
  }
  return HEALTH_TIMEOUT_CLASS_MAP["stateless"];
}
