/**
 * Pure helpers behind the terrain relief view: grid statistics, surface gradients, the heightfield
 * mesh, contour and axis-tick choices, camera matrices, label anchors and the 2D hillshade fallback.
 * No DOM and no WebGL. Every quantity is derived from the relief payload (rows, cols, cell_m,
 * elevation) or from the viewer's own settings (vertical exaggeration, camera); nothing is invented.
 *
 * Grid convention (asserted by the API contract): row-major, row 0 = north edge, column 0 = west edge.
 * World frame: X east, Y up, Z south; one world unit = the longer horizontal side of the window.
 */

export interface Grid {
  rows: number;
  cols: number;
  cellM: number;
  /** Elevation in metres, row-major; NaN where the cell has no elevation. */
  z: Float32Array;
}

export interface ReliefLike {
  rows: number;
  cols: number;
  cell_m: number;
  elevation: (number | null)[];
}

export function toGrid(r: ReliefLike): Grid {
  const z = new Float32Array(r.rows * r.cols);
  for (let i = 0; i < z.length; i++) {
    const v = r.elevation[i];
    z[i] = v === null || v === undefined ? NaN : v;
  }
  return { rows: r.rows, cols: r.cols, cellM: r.cell_m, z };
}

export interface GridStats {
  min: number | null;
  max: number | null;
  valid: number;
  validFraction: number;
}

/** Range over cells that have an elevation. A grid with no elevation has no range (null, never 0). */
export function gridStats(g: Grid): GridStats {
  let min = Infinity, max = -Infinity, valid = 0;
  for (const v of g.z) {
    if (!Number.isFinite(v)) continue;
    valid++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return valid ? { min, max, valid, validFraction: valid / g.z.length } : { min: null, max: null, valid: 0, validFraction: 0 };
}

function diff(lo: number, c: number, hi: number, h: number): number {
  const a = Number.isFinite(lo), b = Number.isFinite(hi);
  if (a && b) return (hi - lo) / (2 * h);
  if (b) return (hi - c) / h;
  if (a) return (c - lo) / h;
  return 0;
}

/**
 * Surface gradient per cell, interleaved [dz/dEast, dz/dNorth] in metres per metre: central
 * differences, one-sided beside an edge or a gap. Used only to light the surface.
 */
export function gradients(g: Grid): Float32Array {
  const { rows, cols, cellM, z } = g;
  const out = new Float32Array(rows * cols * 2);
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= rows || j >= cols ? NaN : z[i * cols + j]);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const c = z[i * cols + j];
      if (!Number.isFinite(c)) continue;
      const k = (i * cols + j) * 2;
      out[k] = diff(at(i, j - 1), c, at(i, j + 1), cellM); // west → east
      out[k + 1] = diff(at(i + 1, j), c, at(i - 1, j), cellM); // south (row + 1) → north (row − 1)
    }
  }
  return out;
}

// ---------------------------------------------------------------- scales: contours and ticks

/** Contour interval with its index (labelled) interval, as on topographic maps. */
const CONTOUR_STEPS: readonly [number, number][] = [
  [1, 5], [2, 10], [5, 25], [10, 50], [20, 100], [25, 100], [50, 250], [100, 500], [200, 1000], [250, 1000], [500, 2500], [1000, 5000],
];

/** Smallest standard interval that draws at most `maxLines` contours over the relief. Null for flat or empty grids. */
export function contourInterval(range: number | null, maxLines = 18): { interval: number; index: number } | null {
  if (range === null || !(range > 0)) return null;
  for (const [interval, index] of CONTOUR_STEPS) if (range / interval <= maxLines) return { interval, index };
  return { interval: 2000, index: 10000 };
}

/**
 * Elevation of the block's floor: one contour interval below the lowest contour under the terrain,
 * so the walls show a little ground below the lowest cell at every exaggeration.
 */
export function baseElevation(zMin: number, interval: number | null): number {
  if (!interval) return zMin - 1;
  return (Math.floor(zMin / interval) - 1) * interval;
}

/** d3-style 1·2·5 step for about `count` intervals over `span`. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !(count > 0)) return 0;
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const e = raw / p;
  return (e >= Math.sqrt(50) ? 10 : e >= Math.sqrt(10) ? 5 : e >= Math.sqrt(2) ? 2 : 1) * p;
}

/** Multiples of a nice step inside [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): { step: number; values: number[] } {
  const step = niceStep(hi - lo, count);
  if (!step) return { step: 0, values: [] };
  const values: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) values.push(Number(v.toFixed(9)) + 0);
  return { step, values };
}

/** Grouped integer metres/kilometres with a true minus sign. */
export function fmtNum(v: number, digits = 0): string {
  const s = v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return s.replace("-", "−");
}

/**
 * View heading for the HUD and announcements: the direction looked toward (camera azimuth + 180°),
 * whole degrees clockwise from north, three digits, 000–359.
 */
export function fmtHeading(azRad: number): string {
  const d = ((Math.round((azRad * 180) / Math.PI + 180) % 360) + 360) % 360;
  return `${String(d).padStart(3, "0")}°`;
}

/** View pitch for the HUD: the camera's elevation as a downward (negative) angle, whole degrees, one true minus sign. */
export function fmtPitch(elRad: number): string {
  const d = Math.round((-elRad * 180) / Math.PI) + 0; // + 0 folds −0 into 0
  return `${d < 0 ? "−" : ""}${Math.abs(d)}°`;
}

// ---------------------------------------------------------------- geometry

export interface Model {
  rows: number;
  cols: number;
  cellM: number;
  widthM: number;
  heightM: number;
  /** World units per metre (horizontal). */
  scale: number;
  /** Half extents of the window in world units (X, Z). */
  hx: number;
  hz: number;
  zMin: number;
  zMax: number;
  zBase: number;
  contour: { interval: number; index: number } | null;
  kmTicks: { x: number[]; z: number[]; stepKm: number };
  elevTicks: number[];
  /** Terrain vertices, interleaved: x, z (world), elevation (m), dz/dEast, dz/dNorth. */
  terrain: Float32Array;
  terrainIndex: Uint32Array;
  /** Walls (two triangles per edge segment), interleaved: x, z, elevation (m), outward normal x, z. */
  walls: Float32Array;
  /** Block floor, x, z pairs (two triangles). */
  floor: Float32Array;
  lines: LineSet;
  stats: GridStats;
}

export interface LineSet {
  /** x, elevation (m), z per vertex; segments as vertex pairs. Ranges are [first vertex, count]. */
  data: Float32Array;
  ranges: Record<"grid" | "floor" | "ticks" | "north", [number, number]>;
  /** Box vertical at each corner: NW, NE, SE, SW. */
  verticals: [number, number][];
  /** Box top edge of each side: N, E, S, W. */
  tops: [number, number][];
  /** Elevation-scale tick segments for each corner: NW, NE, SE, SW. */
  elevRanges: [number, number][];
}

/** Corners of the window in world units, in order NW, NE, SE, SW. */
export function corners(hx: number, hz: number): [number, number][] {
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
}

const TICK = 0.016;

/**
 * Heightfield mesh over the full window. Vertices sit at cell centres, plus a ring at the window edge
 * that repeats the edge cell's value (a cell is an area aggregate, so its value holds out to its own
 * edge); the surface therefore spans exactly cols × cell_m by rows × cell_m. A triangle is drawn only
 * if its three vertices have elevations, so gaps stay gaps.
 */
export function buildModel(g: Grid): Model | null {
  const stats = gridStats(g);
  if (stats.min === null || stats.max === null) return null;
  const { rows, cols, cellM, z } = g;
  const widthM = cols * cellM, heightM = rows * cellM;
  const scale = 1 / Math.max(widthM, heightM);
  const hx = (widthM / 2) * scale, hz = (heightM / 2) * scale;
  const contour = contourInterval(stats.max - stats.min);
  const zBase = baseElevation(stats.min, contour?.interval ?? null);
  const grad = gradients(g);

  const LR = rows + 2, LC = cols + 2;
  const xs = new Float64Array(LC), zs = new Float64Array(LR);
  for (let b = 0; b < LC; b++) xs[b] = (b === 0 ? 0 : b === LC - 1 ? widthM : (b - 0.5) * cellM) * scale - hx;
  for (let a = 0; a < LR; a++) zs[a] = (a === 0 ? 0 : a === LR - 1 ? heightM : (a - 0.5) * cellM) * scale - hz;
  const cellOf = (a: number, b: number) => Math.min(rows - 1, Math.max(0, a - 1)) * cols + Math.min(cols - 1, Math.max(0, b - 1));

  const terrain = new Float32Array(LR * LC * 5);
  const ok = new Uint8Array(LR * LC);
  for (let a = 0; a < LR; a++) {
    for (let b = 0; b < LC; b++) {
      const v = a * LC + b, c = cellOf(a, b), e = z[c];
      const o = v * 5;
      terrain[o] = xs[b];
      terrain[o + 1] = zs[a];
      if (Number.isFinite(e)) {
        ok[v] = 1;
        terrain[o + 2] = e;
        terrain[o + 3] = grad[c * 2];
        terrain[o + 4] = grad[c * 2 + 1];
      }
    }
  }
  const idx: number[] = [];
  for (let a = 0; a < LR - 1; a++) {
    for (let b = 0; b < LC - 1; b++) {
      const v00 = a * LC + b, v01 = v00 + 1, v10 = v00 + LC, v11 = v10 + 1;
      const n = ok[v00] + ok[v01] + ok[v10] + ok[v11];
      if (n === 4) idx.push(v00, v10, v11, v00, v11, v01);
      else if (n === 3) {
        const q = [v00, v10, v11, v01].filter((v) => ok[v]);
        idx.push(q[0], q[1], q[2]);
      }
    }
  }

  // Walls: down from the edge ring to the floor, one quad per edge segment with both ends valid.
  const wall: number[] = [];
  const edge = (vs: number[], nx: number, nz: number) => {
    for (let k = 0; k < vs.length - 1; k++) {
      const p = vs[k], q = vs[k + 1];
      if (!ok[p] || !ok[q]) continue;
      const P = [terrain[p * 5], terrain[p * 5 + 1], terrain[p * 5 + 2]], Q = [terrain[q * 5], terrain[q * 5 + 1], terrain[q * 5 + 2]];
      const top = (u: number[]) => [u[0], u[1], u[2], nx, nz], bot = (u: number[]) => [u[0], u[1], zBase, nx, nz];
      wall.push(...top(P), ...top(Q), ...bot(Q), ...top(P), ...bot(Q), ...bot(P));
    }
  };
  const row = (a: number) => Array.from({ length: LC }, (_, b) => a * LC + b);
  const col = (b: number) => Array.from({ length: LR }, (_, a) => a * LC + b);
  edge(row(0), 0, -1); // north
  edge(row(LR - 1), 0, 1); // south
  edge(col(0), -1, 0); // west
  edge(col(LC - 1), 1, 0); // east

  const floor = new Float32Array([-hx, -hz, hx, -hz, hx, hz, -hx, -hz, hx, hz, -hx, hz]);
  // One km step for both floor axes so the two scales read alike; counted from the south-west corner.
  const stepKm = niceStep(Math.max(widthM, heightM) / 1000, 5);
  const kmTicks = { x: ticksWithStep(widthM / 1000, stepKm), z: ticksWithStep(heightM / 1000, stepKm), stepKm };
  const elevTicks = niceTicks(zBase, stats.max, 4).values;
  const model: Model = {
    rows, cols, cellM, widthM, heightM, scale, hx, hz, zMin: stats.min, zMax: stats.max, zBase, contour, kmTicks, elevTicks,
    terrain, terrainIndex: Uint32Array.from(idx), walls: Float32Array.from(wall), floor,
    lines: { data: new Float32Array(0), ranges: { grid: [0, 0], floor: [0, 0], ticks: [0, 0], north: [0, 0] }, verticals: [], tops: [], elevRanges: [] },
    stats,
  };
  model.lines = buildLines(model);
  return model;
}

function ticksWithStep(spanKm: number, step: number): number[] {
  if (!step) return [];
  const out: number[] = [];
  for (let v = 0; v <= spanKm + 1e-9; v += step) out.push(Number(v.toFixed(9)));
  return out;
}

/** Bounding box, survey ticks, floor reference grid and north arrow, as line segments. */
export function buildLines(m: Model): LineSet {
  const d: number[] = [];
  const seg = (x1: number, e1: number, z1: number, x2: number, e2: number, z2: number) => d.push(x1, e1, z1, x2, e2, z2);
  const mark = () => d.length / 3;
  const { hx, hz, zBase, zMax, scale } = m;

  // Floor reference grid: the km tick step, continued 60 % beyond the window, anchored on the SW corner.
  let s = mark();
  const stepW = m.kmTicks.stepKm * 1000 * scale;
  if (stepW > 0) {
    const reach = Math.max(hx, hz) * 2.2;
    for (let k = Math.floor((-reach + hx) / stepW); -hx + k * stepW <= reach; k++) seg(-hx + k * stepW, zBase, -reach, -hx + k * stepW, zBase, reach);
    for (let k = Math.floor((-reach + hz) / stepW); hz - k * stepW >= -reach; k++) seg(-reach, zBase, hz - k * stepW, reach, zBase, hz - k * stepW);
  }
  const grid: [number, number] = [s, mark() - s];

  // Bounding box, split so the view can draw only the floor and the two back panes (front edges
  // would cross the terrain): floor outline, one vertical per corner, one top edge per side.
  s = mark();
  const c = corners(hx, hz);
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = c[i], [x2, z2] = c[(i + 1) % 4];
    seg(x1, zBase, z1, x2, zBase, z2);
  }
  const floor: [number, number] = [s, mark() - s];
  const verticals: [number, number][] = c.map(([x, z]) => {
    const at = mark();
    seg(x, zBase, z, x, zMax, z);
    return [at, 2];
  });
  // Sides in the order N, E, S, W: corner i to corner i + 1.
  const tops: [number, number][] = c.map(([x1, z1], i) => {
    const at = mark();
    const [x2, z2] = c[(i + 1) % 4];
    seg(x1, zMax, z1, x2, zMax, z2);
    return [at, 2];
  });

  // km ticks on all four floor edges (labels go on the two nearest the camera).
  s = mark();
  for (const km of m.kmTicks.x) {
    const x = -hx + km * 1000 * scale;
    seg(x, zBase, -hz, x, zBase, -hz - TICK);
    seg(x, zBase, hz, x, zBase, hz + TICK);
  }
  for (const km of m.kmTicks.z) {
    const z = hz - km * 1000 * scale;
    seg(-hx, zBase, z, -hx - TICK, zBase, z);
    seg(hx, zBase, z, hx + TICK, zBase, z);
  }
  const ticks: [number, number] = [s, mark() - s];

  // North arrow on the box's top plane, out from the north edge (row 0 is north, asserted by the
  // contract). It sits at the highest elevation, so the terrain never hides it.
  s = mark();
  const z0 = -hz - 0.03, z1 = -hz - 0.11;
  seg(0, zMax, z0, 0, zMax, z1);
  seg(0, zMax, z1, -0.016, zMax, z1 + 0.026);
  seg(0, zMax, z1, 0.016, zMax, z1 + 0.026);
  const north: [number, number] = [s, mark() - s];

  const elevRanges: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    s = mark();
    const [x, z] = c[i];
    const ox = Math.sign(x) * Math.SQRT1_2 * TICK, oz = Math.sign(z) * Math.SQRT1_2 * TICK;
    for (const e of m.elevTicks) seg(x, e, z, x + ox, e, z + oz);
    elevRanges.push([s, mark() - s]);
  }
  return { data: Float32Array.from(d), ranges: { grid, floor, ticks, north }, verticals, tops, elevRanges };
}

/**
 * Box edges to draw for a view: the floor outline, the verticals of every corner but the one nearest
 * the camera, and the top edges of the two back sides (the convention of 3D scientific plots).
 */
export function boxEdges(place: Placement): { verticals: number[]; tops: number[] } {
  const near = (place.corner + 2) % 4;
  const back = [place.ns === "south" ? 0 : 2, place.we === "west" ? 1 : 3]; // sides N, E, S, W
  return { verticals: [0, 1, 2, 3].filter((i) => i !== near), tops: back };
}

// ---------------------------------------------------------------- camera

export type Vec3 = [number, number, number];

export function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Float32Array {
  let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  let l = Math.hypot(zx, zy, zz) || 1;
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz) || 1;
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
  ]);
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

/** World point → CSS pixels (y down). `visible` is false behind the camera. */
export function project(m: Float32Array, p: Vec3, width: number, height: number): { x: number; y: number; visible: boolean } {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  if (w <= 1e-6) return { x: 0, y: 0, visible: false };
  return { x: (x / w * 0.5 + 0.5) * width, y: (1 - (y / w * 0.5 + 0.5)) * height, visible: true };
}

export interface Pose {
  /** Camera azimuth, radians clockwise from north (the direction from the target to the camera). */
  az: number;
  /** Camera elevation above the horizon, radians. */
  el: number;
  /** Distance as a multiple of the framing distance. */
  zoom: number;
  /** Vertical exaggeration. */
  ve: number;
}

export const FOV = (30 * Math.PI) / 180;

const HOME_EL = (30 * Math.PI) / 180;
/** Home view: from the south-south-west, 30° above the horizon, looking north-north-east, box framed. */
export const homePose = (ve: number): Pose => ({ az: (205 * Math.PI) / 180, el: HOME_EL, zoom: 1, ve });

export interface Camera {
  viewProj: Float32Array;
  eye: Vec3;
  target: Vec3;
  /** World Y per metre of elevation (vertical exaggeration × horizontal scale). */
  ys: number;
  /** Heading of the view (direction looked toward), degrees clockwise from north, 0–360. */
  headingDeg: number;
}

/**
 * Camera distance at which the whole box (floor to top) fits inside `margin` of the frame when seen
 * from elevation `el` at any of eight azimuths. Depends on the exaggeration, the frame's aspect and the
 * tilt, not on the azimuth, so orbiting never changes the distance and tilting never crops the block.
 */
export function fitDistance(m: Model, top: number, aspect: number, el: number, margin = 0.84): number {
  const tanV = Math.tan(FOV / 2), tanH = tanV * aspect;
  const pts: Vec3[] = [];
  for (const [x, z] of corners(m.hx, m.hz)) for (const y of [-top * TARGET_Y, top * (1 - TARGET_Y)]) pts.push([x, y, z]);
  let need = 0;
  for (let k = 0; k < 8; k++) {
    const az = (k * Math.PI) / 4;
    const e: Vec3 = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
    // right = forward × up with forward = −e; camera up = right × forward
    let rx = e[2], rz = -e[0];
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = -rz * e[1], uy = rz * e[0] - rx * e[2], uz = rx * e[1];
    for (const p of pts) {
      const depth = p[0] * e[0] + p[1] * e[1] + p[2] * e[2];
      const h = Math.abs(p[0] * rx + p[2] * rz) / (margin * tanH);
      const v = Math.abs(p[0] * ux + p[1] * uy + p[2] * uz) / (margin * tanV);
      need = Math.max(need, depth + h, depth + v);
    }
  }
  return need;
}

/**
 * Orbit target height as a share of the box height: a little below the middle, so an oblique view
 * (whose near floor reaches lowest on screen) sits centred.
 */
const TARGET_Y = 0.32;

/**
 * Nearest camera distance that stays outside the block: beyond it the eye would be over the window and
 * below the block's top, i.e. possibly inside the terrain.
 */
export function clearDistance(m: Model, top: number, az: number, el: number): number {
  const sa = Math.abs(Math.sin(az)), ca = Math.abs(Math.cos(az)), ce = Math.cos(el), se = Math.sin(el);
  const exit = Math.min(sa > 1e-9 ? m.hx / sa : Infinity, ca > 1e-9 ? m.hz / ca : Infinity); // leave the footprint
  const over = se > 1e-9 ? (top * (1 - TARGET_Y)) / se : Infinity; // rise above the top
  return 1.02 * Math.min(ce > 1e-9 ? exit / ce : Infinity, over);
}

/**
 * Orbit camera around the box at the current exaggeration, framed for the current tilt: a plan view in a
 * wide frame stands further back than the oblique home view, so the whole block stays in the frame. Zooming
 * in (a pinch or wheel past the limit included) stops where the camera would enter the block.
 */
export function camera(m: Model, pose: Pose, width: number, height: number): Camera {
  const ys = pose.ve * m.scale;
  const top = (m.zMax - m.zBase) * ys;
  const target: Vec3 = [0, top * TARGET_Y, 0];
  const aspect = Math.max(0.2, width / Math.max(1, height));
  const d = Math.max(fitDistance(m, top, aspect, pose.el) * pose.zoom, clearDistance(m, top, pose.az, pose.el));
  const ce = Math.cos(pose.el);
  const eye: Vec3 = [target[0] + d * Math.sin(pose.az) * ce, target[1] + d * Math.sin(pose.el), target[2] - d * Math.cos(pose.az) * ce];
  const view = lookAt(eye, target);
  const proj = perspective(FOV, aspect, d * 0.02, d * 6 + 4);
  const headingDeg = (((pose.az * 180) / Math.PI + 180) % 360 + 360) % 360;
  return { viewProj: multiply(proj, view), eye, target, ys, headingDeg };
}

// ---------------------------------------------------------------- probe

export interface Probe {
  row: number;
  col: number;
  /** The cell's own value in metres; null where the cell has no elevation. */
  elevation: number | null;
  /** Cell centre, km from the west and south edges. */
  eastKm: number;
  northKm: number;
  /** Hit point in world space. */
  p: Vec3;
}

/**
 * Grid cell under a screen point: the view ray is marched through the box onto the surface (bilinear
 * between cell centres, as drawn) and refined by bisection. Through a gap it lands on the floor and
 * reports that cell with no elevation. Null off the window.
 */
export function pickCell(m: Model, g: Grid, cam: Camera, px: number, py: number, width: number, height: number): Probe | null {
  const tanV = Math.tan(FOV / 2), tanH = tanV * (width / Math.max(1, height));
  const f = norm([cam.target[0] - cam.eye[0], cam.target[1] - cam.eye[1], cam.target[2] - cam.eye[2]]);
  const r = norm([-f[2], 0, f[0]]);
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const nx = (2 * px) / width - 1, ny = 1 - (2 * py) / height;
  const d = norm([f[0] + r[0] * nx * tanH + u[0] * ny * tanV, f[1] + r[1] * nx * tanH + u[1] * ny * tanV, f[2] + r[2] * nx * tanH + u[2] * ny * tanV]);
  const top = (m.zMax - m.zBase) * cam.ys;
  // Slab intersection with the box.
  let t0 = 0, t1 = Infinity;
  const lo: Vec3 = [-m.hx, 0, -m.hz], hi: Vec3 = [m.hx, top, m.hz];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) { if (cam.eye[k] < lo[k] || cam.eye[k] > hi[k]) return null; continue; }
    let a = (lo[k] - cam.eye[k]) / d[k], b = (hi[k] - cam.eye[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  if (!(t1 > t0)) return null;
  const toCell = (x: number, z: number) => [(z + m.hz) / m.scale / g.cellM - 0.5, (x + m.hx) / m.scale / g.cellM - 0.5] as const;
  const surface = (x: number, z: number) => {
    const [fr, fc] = toCell(x, z);
    const r0 = Math.min(g.rows - 1, Math.max(0, Math.floor(fr))), c0 = Math.min(g.cols - 1, Math.max(0, Math.floor(fc)));
    const r1 = Math.min(g.rows - 1, r0 + 1), c1 = Math.min(g.cols - 1, c0 + 1);
    const tr = Math.min(1, Math.max(0, fr - r0)), tc = Math.min(1, Math.max(0, fc - c0));
    const z00 = g.z[r0 * g.cols + c0], z01 = g.z[r0 * g.cols + c1], z10 = g.z[r1 * g.cols + c0], z11 = g.z[r1 * g.cols + c1];
    const e = (z00 * (1 - tc) + z01 * tc) * (1 - tr) + (z10 * (1 - tc) + z11 * tc) * tr;
    return Number.isFinite(e) ? (e - m.zBase) * cam.ys : -Infinity; // a gap is open down to the floor
  };
  const at = (t: number): Vec3 => [cam.eye[0] + d[0] * t, cam.eye[1] + d[1] * t, cam.eye[2] + d[2] * t];
  const below = (t: number) => { const p = at(t); return p[1] <= Math.max(0, surface(p[0], p[2])); };
  const steps = 480;
  let prev = t0;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    if (below(t)) {
      let a = prev, b = t;
      for (let k = 0; k < 24; k++) { const mid = (a + b) / 2; if (below(mid)) b = mid; else a = mid; }
      const p = at(b);
      const [fr, fc] = toCell(p[0], p[2]);
      const row = Math.min(g.rows - 1, Math.max(0, Math.round(fr))), col = Math.min(g.cols - 1, Math.max(0, Math.round(fc)));
      const v = g.z[row * g.cols + col];
      return {
        row, col, elevation: Number.isFinite(v) ? v : null,
        eastKm: ((col + 0.5) * g.cellM) / 1000, northKm: ((g.rows - row - 0.5) * g.cellM) / 1000, p,
      };
    }
    prev = t;
  }
  return null;
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------------------------------------------------------------- labels

export interface Anchor {
  key: string;
  text: string;
  /** World x, elevation in metres, world z (convert the elevation with `worldY` before projecting). */
  p: Vec3;
  kind: "km" | "elev" | "north";
}

export interface Placement {
  /** Floor edges, nearest the camera, that carry the km labels. */
  ns: "north" | "south";
  we: "west" | "east";
  /** Corner (NW, NE, SE, SW) carrying the elevation scale: the one diagonal to where the km scales meet. */
  corner: number;
}

/** Which floor edges carry the km labels and which corner carries the elevation scale for this view. */
export function axisPlacement(cam: Camera): Placement {
  const ns: "north" | "south" = cam.eye[2] >= 0 ? "south" : "north";
  const we: "west" | "east" = cam.eye[0] <= 0 ? "west" : "east";
  const shared = ns === "north" ? (we === "west" ? 0 : 1) : we === "east" ? 2 : 3;
  return { ns, we, corner: (shared + 2) % 4 };
}

/**
 * Label anchors in world space for every candidate position (km ticks on all four edges, the elevation
 * scale at all four corners, north). The view shows the subset chosen by `axisPlacement`.
 */
export function labelAnchors(m: Model): Anchor[] {
  const out: Anchor[] = [];
  const { hx, hz, scale } = m;
  const kmLabel = (km: number, last: boolean, axis: "E" | "N") => (last ? `${fmtNum(km)} km ${axis}` : fmtNum(km));
  const off = 0.05;
  m.kmTicks.x.forEach((km, i, a) => {
    const x = -hx + km * 1000 * scale;
    out.push({ key: `km-n-${i}`, text: kmLabel(km, i === a.length - 1, "E"), p: [x, m.zBase, -hz - off], kind: "km" });
    out.push({ key: `km-s-${i}`, text: kmLabel(km, i === a.length - 1, "E"), p: [x, m.zBase, hz + off], kind: "km" });
  });
  m.kmTicks.z.forEach((km, i, a) => {
    const z = hz - km * 1000 * scale;
    out.push({ key: `km-w-${i}`, text: kmLabel(km, i === a.length - 1, "N"), p: [-hx - off, m.zBase, z], kind: "km" });
    out.push({ key: `km-e-${i}`, text: kmLabel(km, i === a.length - 1, "N"), p: [hx + off, m.zBase, z], kind: "km" });
  });
  corners(hx, hz).forEach(([x, z], ci) => {
    const ox = Math.sign(x) * 0.026, oz = Math.sign(z) * 0.026;
    m.elevTicks.forEach((e, i, a) => {
      out.push({ key: `el-${ci}-${i}`, text: i === a.length - 1 ? `${fmtNum(e)} m` : fmtNum(e), p: [x + ox, e, z + oz], kind: "elev" });
    });
  });
  out.push({ key: "north", text: "N", p: [0, m.zMax, -hz - 0.15], kind: "north" });
  return out;
}

/**
 * Is this anchor shown for the current axis placement? Km distances run from the south-west corner on
 * every edge. Seen from the south, the west or east scale's "0" would sit on the near corner beside the
 * south scale's own corner label ("0" at SW, "50 km E" at SE), so it is left to that one; seen from the
 * north, that "0" is at the far end of its edge and is shown.
 */
export function anchorShown(a: Anchor, place: Placement): boolean {
  if (a.kind === "north") return true;
  if (a.kind === "km") {
    const [, edge, i] = a.key.split("-");
    if (edge === place.we[0]) return !(i === "0" && place.ns === "south");
    return edge === place.ns[0];
  }
  return a.key.startsWith(`el-${place.corner}-`);
}

/** Label type per kind (CSS px), as the live view sets it: IBM Plex Mono advances 0.6 em per character. */
const LABEL_TYPE: Record<Anchor["kind"], { size: number; pad: number }> = {
  km: { size: 10.5, pad: 0 }, elev: { size: 11, pad: 6 }, north: { size: 12, pad: 0 },
};

/** Approximate box of a scale label in CSS px (width includes the label's side padding). */
export function labelBox(kind: Anchor["kind"], text: string): { w: number; h: number } {
  const t = LABEL_TYPE[kind];
  return { w: text.length * t.size * 0.6 + 2 * t.pad, h: t.size * 1.3 };
}

export function worldY(m: Model, elevation: number, ys: number): number {
  return (elevation - m.zBase) * ys;
}

export interface PlacedLabel {
  key: string;
  text: string;
  kind: Anchor["kind"];
  /** CSS pixels; the label box is aligned to this point as `align` says, vertically centred. */
  x: number;
  y: number;
  align: "left" | "center" | "right";
}

/** Labels keep this far (CSS px) inside the view. */
const LABEL_INSET = 4;

/**
 * Screen positions of the scale labels for one frame. Labels whose anchor is behind the camera or outside
 * the view are dropped, and a label near the border is nudged inside it; a scale too foreshortened to read
 * keeps only its ends (the unit sits on the last label), and the elevation scale keeps two heights whenever
 * they fit; elevation labels sit on the outer side of their corner. Seen from the north, both km scales
 * end on the near corner with different values, so those two labels run apart along their own edges.
 */
export function layoutLabels(m: Model, anchors: Anchor[], cam: Camera, width: number, height: number): PlacedLabel[] {
  const place = axisPlacement(cam);
  const centre = project(cam.viewProj, cam.target, width, height);
  const groups = new Map<string, { a: Anchor; x: number; y: number }[]>();
  for (const a of anchors) {
    if (!anchorShown(a, place)) continue;
    const s = project(cam.viewProj, [a.p[0], worldY(m, a.p[1], cam.ys), a.p[2]], width, height);
    if (!s.visible || s.x < 0 || s.x > width || s.y < 0 || s.y > height) continue;
    const g = a.kind === "km" ? a.key.split("-")[1] : a.kind;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ a, x: s.x, y: s.y });
  }
  // The near corner, and the far end of each labelled edge, on the floor (world y 0).
  const cx = place.we === "west" ? -m.hx : m.hx, cz = place.ns === "north" ? -m.hz : m.hz;
  const nearCorner = project(cam.viewProj, [cx, 0, cz], width, height);
  const halfStep = (m.kmTicks.stepKm * 1000 * m.scale) / 2;
  const cornerAlign = (g: string, a: Anchor): PlacedLabel["align"] | null => {
    if (place.ns !== "north" || a.kind !== "km") return null;
    const xAxis = g === "n" || g === "s";
    if (Math.abs(xAxis ? a.p[0] - cx : a.p[2] - cz) > halfStep) return null;
    const far = project(cam.viewProj, xAxis ? [-cx, 0, cz] : [cx, 0, -cz], width, height);
    return far.x < nearCorner.x ? "right" : "left"; // the text runs along its edge, away from the corner
  };
  const out: PlacedLabel[] = [];
  for (const [g, list] of groups) {
    let gap = Infinity;
    for (let i = 1; i < list.length; i++) {
      gap = Math.min(gap, g === "elev" ? Math.abs(list[i].y - list[i - 1].y) : Math.hypot(list[i].x - list[i - 1].x, list[i].y - list[i - 1].y));
    }
    const need = g === "elev" ? 15 : g === "north" ? 0 : 34;
    const endsFit = gap * (list.length - 1) >= (g === "elev" ? need : need * 2);
    list.forEach((it, i) => {
      const ends = i === list.length - 1 || (i === 0 && endsFit);
      if (gap < need && !ends) return;
      const align = it.a.kind === "elev" ? (it.x >= (centre.visible ? centre.x : width / 2) ? "left" : "right")
        : cornerAlign(g, it.a) ?? "center";
      const box = labelBox(it.a.kind, it.a.text);
      const left = align === "left" ? it.x : align === "right" ? it.x - box.w : it.x - box.w / 2;
      const dx = Math.max(0, LABEL_INSET - left) - Math.max(0, left + box.w - (width - LABEL_INSET));
      const y = Math.min(height - LABEL_INSET - box.h / 2, Math.max(LABEL_INSET + box.h / 2, it.y));
      out.push({ key: it.a.key, text: it.a.text, kind: it.a.kind, x: it.x + dx, y, align });
    });
  }
  return out;
}

// ---------------------------------------------------------------- shading shared by WebGL and 2D

/**
 * Fixed cartographic light, not the real sun at the site: from the north-west (azimuth 315°) at 45°
 * altitude, the hillshade convention. The view labels it LIGHT so it is never read as solar telemetry.
 */
export const SUN = { azDeg: 315, altDeg: 45 };

/** Unit vector toward the light in world space (X east, Y up, Z south). */
export function sunVector(): Vec3 {
  const az = (SUN.azDeg * Math.PI) / 180, alt = (SUN.altDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)];
}

export const TINT: Record<"earth" | "mars", Vec3> = {
  earth: [0x4f / 255, 0xc9 / 255, 0xbb / 255],
  mars: [0xec / 255, 0x7f / 255, 0x53 / 255],
};

/** Monochrome hypsometric ramp: luminance from `lo` (lowest cell) to `hi` (highest), a share `tint` of planet colour. */
export const RAMP = { lo: 0.12, hi: 0.86, gamma: 0.9, tint: 0.34 } as const;

/** Ramp colour at t in 0–1 (the fragment shader uses the same constants). */
export function rampColor(t: number, tint: Vec3): Vec3 {
  const lum = RAMP.lo + (RAMP.hi - RAMP.lo) * Math.pow(Math.min(1, Math.max(0, t)), RAMP.gamma);
  const k = 1 - RAMP.tint;
  return [lum * (k + RAMP.tint * tint[0]), lum * (k + RAMP.tint * tint[1]), lum * (k + RAMP.tint * tint[2])];
}

/**
 * 2D fallback: north-up RGBA image (cols × rows) of the hypsometric ramp under the same sun, with the
 * slope exaggerated by `ve`. Cells without elevation are transparent.
 */
export function hillshade(g: Grid, ve: number, tint: Vec3): Uint8ClampedArray<ArrayBuffer> {
  const st = gridStats(g);
  const out = new Uint8ClampedArray(g.rows * g.cols * 4);
  if (st.min === null || st.max === null) return out;
  const grad = gradients(g);
  const L = sunVector();
  const span = Math.max(st.max - st.min, 1e-6);
  for (let k = 0; k < g.z.length; k++) {
    const e = g.z[k];
    if (!Number.isFinite(e)) continue;
    // normal in world (X east, Y up, Z south)
    let nx = -grad[k * 2] * ve, ny = 1, nz = grad[k * 2 + 1] * ve;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const sun = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const sky = 0.5 + 0.5 * ny;
    const shade = 0.22 * sky + 0.95 * sun;
    const c = rampColor((e - st.min) / span, tint);
    out[k * 4] = Math.round(Math.min(1, c[0] * shade) * 255);
    out[k * 4 + 1] = Math.round(Math.min(1, c[1] * shade) * 255);
    out[k * 4 + 2] = Math.round(Math.min(1, c[2] * shade) * 255);
    out[k * 4 + 3] = 255;
  }
  return out;
}

/**
 * Marching squares on the cell-centre lattice: contour segments at `level` as [x1, y1, x2, y2, …] in
 * cell coordinates (x = column, y = row, cell centres at integers). Squares touching a gap are skipped.
 */
export function contourSegments(g: Grid, level: number): number[] {
  const { rows, cols, z } = g;
  const out: number[] = [];
  const t = (a: number, b: number) => (level - a) / (b - a);
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = z[i * cols + j], b = z[i * cols + j + 1], c = z[(i + 1) * cols + j + 1], d = z[(i + 1) * cols + j];
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const code = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top: [number, number] = [j + t(a, b), i], right: [number, number] = [j + 1, i + t(b, c)];
      const bottom: [number, number] = [j + t(d, c), i + 1], left: [number, number] = [j, i + t(a, d)];
      const push = (p: [number, number], q: [number, number]) => out.push(p[0], p[1], q[0], q[1]);
      const centreHigh = (a + b + c + d) / 4 >= level;
      switch (code) {
        case 1: case 14: push(left, bottom); break;
        case 2: case 13: push(bottom, right); break;
        case 3: case 12: push(left, right); break;
        case 4: case 11: push(top, right); break;
        case 6: case 9: push(top, bottom); break;
        case 7: case 8: push(left, top); break;
        case 5: if (centreHigh) { push(left, top); push(bottom, right); } else { push(left, bottom); push(top, right); } break;
        case 10: if (centreHigh) { push(left, bottom); push(top, right); } else { push(left, top); push(bottom, right); } break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- accessible summary

export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;
}

/** Description of the real values on screen, for the canvas's accessible name. */
export function ariaSummary(
  r: { id: string; lat: number; lon: number; rows: number; cols: number; cell_m: number; z_min: number | null; z_max: number | null; valid_fraction: number },
  ve: number, planet: "earth" | "mars", mode: "3d" | "2d" = "3d",
): string {
  const w = (r.cols * r.cell_m) / 1000, h = (r.rows * r.cell_m) / 1000;
  const elev = r.z_min === null || r.z_max === null
    ? "No cell has an elevation."
    : `Elevation ${fmtNum(r.z_min)} to ${fmtNum(r.z_max)} metres, relief ${fmtNum(r.z_max - r.z_min)} metres.`;
  const gaps = r.valid_fraction < 1 ? ` ${(100 * (1 - r.valid_fraction)).toFixed(1)} % of cells have no elevation and are left open.` : "";
  return `${mode === "3d" ? "3D terrain relief" : "Hillshade map, north up,"} of ${r.id}, ${planet === "mars" ? "Mars" : "Earth"}, centred ${formatLatLon(r.lat, r.lon)}. `
    + `${w.toFixed(1)} by ${h.toFixed(1)} km window, ${r.rows} by ${r.cols} cells of ${r.cell_m.toFixed(0)} m. ${elev}${gaps} `
    + `Vertical exaggeration ×${ve}. Shaded by a fixed cartographic light from ${SUN.azDeg}° at ${SUN.altDeg}°, not the real sun.`;
}

/**
 * What the grid shows, in words, for captions and legends. An Earth grid is either as measured or
 * resampled as MOLA would observe it; a Mars grid is the planet's own measurement, so the MOLA
 * observation-operator clause never applies to it.
 */
export function representationNote(planet: "earth" | "mars", representation: string): string {
  if (planet === "mars") return "Mars as measured";
  return representation === "as_measured"
    ? "Earth as measured: the MOLA observation operator is not applied"
    : "Earth as MOLA would observe it";
}
