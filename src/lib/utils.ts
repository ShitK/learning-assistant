export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
