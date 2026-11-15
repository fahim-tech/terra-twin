/**
 * Geometry of the similarity legend ramp. Everything is derived from the legend record
 * (`/api/visualization/legend`): its domain, colour stops and display opacity — nothing is assumed.
 */

export interface RampTick {
  /** Value on the legend's own scale. */
  value: number;
  /** Position along the ramp: 0 = left end, 1 = right end. */
  at: number;
}

/** Evenly spaced ticks across a legend domain. Empty when the domain is unusable. */
export function rampTicks(domain: readonly [number, number], count = 5): RampTick[] {
  const [a, b] = domain;
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a) || !Number.isInteger(count) || count < 2) return [];
  return Array.from({ length: count }, (_, i) => ({ value: a + ((b - a) * i) / (count - 1), at: i / (count - 1) }));
}

/** Fewest decimals that print every tick exactly (capped at `max`): 0, 0.25, 0.5 … → 2. */
export function tickDigits(ticks: readonly RampTick[], max = 3): number {
  for (let d = 0; d < max; d++) {
    if (ticks.every((t) => Math.abs(Number(t.value.toFixed(d)) - t.value) < 1e-9)) return d;
  }
  return max;
}

/** Where a value sits along the ramp (0..1, clamped); null when the value or the domain is unusable. */
export function rampPosition(domain: readonly [number, number], value: number | null | undefined): number | null {
  const [a, b] = domain;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) return null;
  return Math.min(1, Math.max(0, (value - a) / (b - a)));
}

/** Left-to-right CSS gradient through colour stops given as [fraction along the ramp (0..1), colour]. */
export function rampGradient(stops: readonly (readonly [number, string])[]): string | null {
  if (!stops.length) return null;
  const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 10000) / 100}%`;
  return `linear-gradient(to right, ${stops.map(([v, c]) => `${c} ${pct(v)}`).join(", ")})`;
}
