/**
 * Geometry for the footprint dimension: an engineering-drawing dimension line that hangs below the
 * compared square as projected on screen (so it follows camera tilt and heading), labelled with the
 * footprint size from the record.
 */

export interface ScreenPoint { x: number; y: number; visible: boolean }
export type Segment = [x1: number, y1: number, x2: number, y2: number];

export interface Dimension {
  /** Extension lines from the edge's two corners out to just past the dimension line. */
  ext: [Segment, Segment];
  /** The dimension line itself, parallel to the edge. */
  line: Segment;
  /** Centre of the label and its rotation in degrees (kept upright, −90..90). */
  label: { x: number; y: number; angle: number };
  /** Projected edge length, px. */
  length: number;
  /** Unit vector along the edge (left to right) and the unit normal pointing away from the square. */
  u: [number, number];
  n: [number, number];
}

export interface DimensionOptions {
  /** Distance of the dimension line from the edge, px. */
  offset?: number;
  /** Gap between a corner and its extension line, px. */
  gap?: number;
  /** How far the extension lines run past the dimension line, px. */
  overshoot?: number;
  /** Below this projected edge length the dimension is not drawn, px. */
  minLength?: number;
}

/**
 * Dimension for the lowest edge (on screen) of a projected square. `corners` are the square's four
 * corners in ring order. Returns null when any corner is hidden (behind the limb or off-screen) or
 * the edge is too short to label.
 */
export function footprintDimension(corners: readonly (ScreenPoint | null | undefined)[], opts: DimensionOptions = {}): Dimension | null {
  const { offset = 16, gap = 5, overshoot = 5, minLength = 40 } = opts;
  if (corners.length !== 4 || corners.some((c) => !c || !c.visible || !Number.isFinite(c.x) || !Number.isFinite(c.y))) return null;
  const pts = corners as ScreenPoint[];
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  let edge = 0;
  let lowest = -Infinity;
  for (let i = 0; i < 4; i++) {
    const my = (pts[i].y + pts[(i + 1) % 4].y) / 2;
    if (my > lowest) { lowest = my; edge = i; }
  }
  let a = pts[edge];
  let b = pts[(edge + 1) % 4];
  if (b.x < a.x) [a, b] = [b, a]; // left to right, so the label reads upright
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < minLength) return null;
  // Unit normal of the edge, turned to point away from the square's centre.
  let nx = -dy / length;
  let ny = dx / length;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
  const at = (p: { x: number; y: number }, d: number): [number, number] => [p.x + nx * d, p.y + ny * d];
  const ext = [a, b].map((p) => [...at(p, gap), ...at(p, offset + overshoot)] as Segment) as [Segment, Segment];
  return {
    ext,
    line: [...at(a, offset), ...at(b, offset)] as Segment,
    label: { x: mx + nx * offset, y: my + ny * offset, angle: (Math.atan2(dy, dx) * 180) / Math.PI },
    length,
    u: [dx / length, dy / length],
    n: [nx, ny],
  };
}

/** Footprint size for the label: the record's kilometres, at most one decimal, never padded. */
export function kmLabel(km: number): string {
  return `${km.toLocaleString("en-US", { maximumFractionDigits: 1 })} km`;
}
