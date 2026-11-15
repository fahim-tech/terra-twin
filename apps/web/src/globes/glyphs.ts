/**
 * HUD marker glyphs, drawn once to canvas and handed to Cesium billboards as data URLs (cached by URL in
 * Cesium's texture atlas, so switching between them is free).
 *
 * Places and the user's point are square or diamond glyphs; data points (cells, windows, pool, leaders)
 * stay true circles, as in a chart. A selected glyph gains corner registration brackets, like the framed
 * surfaces of the shell. A dark halo keeps every glyph legible over bright terrain.
 */
import type { MarkerKind } from "./protocol";

export const GLYPH_INK = "#f2f4f5";
export const GLYPH_SPACE = "#020304";
export const GLYPH_MARS = "#ec7f53";
export const GLYPH_EARTH = "#4fc9bb";
const REFERENCE = "#d9b07a";
const CONTROL = "#8e99a6";

/** Kinds drawn as HUD glyphs on the ground; the rest are data points (Cesium circles) until stemmed. */
export const GLYPH_KINDS: ReadonlySet<MarkerKind> = new Set(["research_site", "selection", "reference", "control"]);

export interface Glyph { url: string; size: number }

const SCALE = 2; // drawn at 2× so the glyphs stay crisp on high-density screens
const cache = new Map<string, Glyph>();

export function glyph(kind: MarkerKind, selected: boolean): Glyph {
  const key = `${kind}:${selected ? 1 : 0}`;
  let g = cache.get(key);
  if (!g) {
    g = draw(kind, selected);
    cache.set(key, g);
  }
  return g;
}

function draw(kind: MarkerKind, selected: boolean): Glyph {
  const framed = selected || kind === "selection";
  const size = framed ? 28 : 16;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  const c = size / 2;
  ctx.lineJoin = "miter";

  /** Stroke a path twice: a dark halo, then the line itself. */
  const stroke = (path: () => void, color: string, width: number, halo = 2.5) => {
    ctx.beginPath(); path();
    ctx.strokeStyle = "rgba(2,3,4,0.7)"; ctx.lineWidth = width + halo; ctx.stroke();
    ctx.beginPath(); path();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  const fill = (path: () => void, color: string) => {
    ctx.beginPath(); path();
    ctx.fillStyle = color; ctx.fill();
  };
  const square = (s: number) => () => ctx.rect(c - s / 2, c - s / 2, s, s);
  const diamond = (r: number) => () => { ctx.moveTo(c, c - r); ctx.lineTo(c + r, c); ctx.lineTo(c, c + r); ctx.lineTo(c - r, c); ctx.closePath(); };
  const circle = (r: number) => () => ctx.arc(c, c, r, 0, Math.PI * 2);

  switch (kind) {
    case "research_site":
      fill(square(7), "rgba(2,3,4,0.45)");
      stroke(square(7), selected ? GLYPH_INK : "rgba(242,244,245,0.9)", 1.25);
      break;
    case "selection":
      fill(diamond(6.5), GLYPH_MARS);
      stroke(diamond(6.5), GLYPH_INK, 1.5);
      break;
    case "reference":
      fill(square(7), REFERENCE);
      stroke(square(7), GLYPH_SPACE, 1, 1.5);
      break;
    case "control":
      fill(square(7), "rgba(2,3,4,0.45)");
      stroke(square(7), CONTROL, 1.25);
      stroke(() => { ctx.moveTo(c - 3.5, c + 3.5); ctx.lineTo(c + 3.5, c - 3.5); }, CONTROL, 1, 1);
      break;
    case "candidate":
      fill(circle(4.5), GLYPH_EARTH);
      stroke(circle(4.5), GLYPH_INK, 1.5);
      break;
    case "leader":
      fill(circle(4.5), GLYPH_INK);
      stroke(circle(5.5), GLYPH_EARTH, 2);
      break;
    case "pool":
      fill(circle(2), "rgba(201,211,220,0.5)");
      break;
  }

  if (framed) {
    // Corner registration brackets around the glyph (the selected / active target).
    const b = 11, l = 4.5;
    const corners = () => {
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(c + sx * b, c + sy * (b - l));
        ctx.lineTo(c + sx * b, c + sy * b);
        ctx.lineTo(c + sx * (b - l), c + sy * b);
      }
    };
    stroke(corners, kind === "selection" ? GLYPH_MARS : GLYPH_INK, 1.25, 2);
  }
  return { url: canvas.toDataURL("image/png"), size };
}

/** Vertical fade for scan-volume walls: opaque at the ground, clear at the top (canvas row 0 = top). */
export function wallGradient(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,0.18)");
  g.addColorStop(0.55, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  return canvas;
}
