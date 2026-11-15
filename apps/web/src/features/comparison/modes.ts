/** Comparison modes: the order of the segmented switch and the title each mode's panel carries. */

export type CompareMode = "spatial" | "measurements" | "evidence" | "relevance" | "relief";

export interface ModeSpec {
  value: CompareMode;
  /** Switch label (short, set in caps). */
  label: string;
  /** Narrow-phone label (< 380 px), when the full one would not fit five cells across. */
  short?: string;
  /** Section title of the expanded panel. */
  title: string;
}

export const COMPARE_MODES: readonly ModeSpec[] = [
  { value: "spatial", label: "Spatial", title: "Spatial" },
  { value: "measurements", label: "Measurements", short: "Measure", title: "Terrain measurements" },
  { value: "evidence", label: "Evidence", title: "Scientific evidence" },
  { value: "relevance", label: "Relevance", title: "Exploration relevance" },
  // Slot for the relief viewer (see relief.tsx). It is offered only once a viewer is wired; until then
  // the mode is left out of the switch entirely, never shown as a placeholder.
  { value: "relief", label: "3D relief", short: "3D", title: "3D relief" },
];

/** The modes the switch offers. "3D relief" appears only when a relief viewer is wired. */
export function visibleModes({ relief }: { relief: boolean }): ModeSpec[] {
  return COMPARE_MODES.filter((m) => m.value !== "relief" || relief);
}

/**
 * Keyboard movement in the mode switch (horizontal ARIA tabs, selection follows focus): arrows wrap,
 * Home/End jump to the ends. Returns null for any other key or when the current mode is not offered.
 */
export function nextMode(modes: readonly CompareMode[], current: CompareMode, key: string): CompareMode | null {
  const i = modes.indexOf(current);
  const n = modes.length;
  if (i < 0 || n === 0) return null;
  if (key === "ArrowRight") return modes[(i + 1) % n];
  if (key === "ArrowLeft") return modes[(i - 1 + n) % n];
  if (key === "Home") return modes[0];
  if (key === "End") return modes[n - 1];
  return null;
}
