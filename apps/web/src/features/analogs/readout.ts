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

/**
 * The app's one wording for a research window that belongs to a tied set: it names the set and its size,
 * never a position in it (“2 of 3” would read as a rank the research does not support), so every member
 * gets the same words. Every view that names a tie member says this.
 */
export function tiedWindows(n: number): string {
  return `One of ${n} tied windows`;
}

/** How every view lists a tied set: unordered, by position. */
export const TIE_ORDER = "listed west to east";

/** The full form, where there is room for the listing order: “One of 3 tied windows (listed west to east)”. */
export function tiedWindowsListed(n: number): string {
  return `${tiedWindows(n)} (${TIE_ORDER})`;
}

/**
 * The note a selected research window carries when it belongs to a tied set (tiedWindows). Null when the
 * decision is not a tie or the window is not one of its members.
 */
export function tieNote(decision: { type: string; members: readonly string[] }, windowId: string | null | undefined): string | null {
  if (decision.type !== "tied_set" || !windowId || !decision.members.includes(windowId)) return null;
  return tiedWindows(decision.members.length);
}
