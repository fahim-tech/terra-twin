import { measuresOf } from "./candidates";

/**
 * Text forms of the figures the Earth readouts print. Missing values are said as "—" (or "not
 * available" when spoken), never as 0; a real 0 prints as 0.000.
 */

/** The similarity figure: `0.614`, or `—` when the record has none. */
export function sText(v: number | null | undefined, digits = 3): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";
}

/** Spoken form of a similarity figure for accessible names. */
export function sSpoken(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(3) : "not available";
}

/** `8/8`: the measures behind a score; the count is `—` when the record has no coverage. */
export function measuresText(coverage: number | null | undefined, total: number): string {
  return `${measuresOf(coverage, total) ?? "—"}/${total}`;
}
