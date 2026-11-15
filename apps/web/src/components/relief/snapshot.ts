/**
 * Static relief image for reports: renders the same scene as the live view once, off screen, and
 * burns in the scale labels and (unless the host captions it) a caption (vertical exaggeration, contour
 * interval, provenance) so the picture stays self-describing wherever it is placed. Falls back to the 2D
 * hillshade without WebGL2. A "paper" still is drawn for print: white ground, dark linework and labels, the
 * depth cue fading toward the paper, so no block of render sky prints on white.
 */
import type { Relief } from "../../types/contracts";
import { drawFlat, FONT_MONO, FONT_SANS } from "./flat";
import { ReliefRenderer, reliefContext } from "./reliefGl";
import { axisPlacement, buildModel, camera, fitZoom, fmtNum, homePose, labelAnchors, layoutLabels, representationNote, toGrid } from "./reliefMath";

export interface SnapshotOptions {
  planet: "earth" | "mars";
  /** Vertical exaggeration (default 4). */
  ve?: number;
  /** CSS pixels of the image (rendered at `scale` device pixels per CSS pixel). */
  width?: number;
  height?: number;
  scale?: number;
  /** Camera azimuth (from the block to the camera) and elevation in degrees. */
  azDeg?: number;
  elDeg?: number;
  /** Camera distance as a multiple of the every-side framing; "fit" frames this one view as closely as its scales allow. */
  zoom?: number | "fit";
  /** Force the 2D hillshade. */
  mode?: "auto" | "2d";
  /** "dark" (default): the app's scene on its near-black ground. "paper": a print still on white. */
  theme?: "dark" | "paper";
  /** Burn the caption strip in (default true); a host that captions the still itself turns it off. */
  caption?: boolean;
}

export interface Snapshot { dataUrl: string; width: number; height: number; mode: "3d" | "2d" }

const GROUND = { dark: "#030405", paper: "#ffffff" } as const;
/** Label ink per ground: [elevation and north, km scale, caption title, caption detail]. */
const LABEL = {
  dark: ["rgba(242,244,245,0.95)", "rgba(242,244,245,0.75)", "rgba(242,244,245,0.92)", "rgba(166,174,182,0.95)"],
  paper: ["rgba(17,17,17,0.92)", "rgba(17,17,17,0.72)", "rgba(17,17,17,0.9)", "rgba(68,68,68,0.95)"],
} as const;

export async function renderReliefSnapshot(relief: Relief, o: SnapshotOptions): Promise<Snapshot | null> {
  const grid = toGrid(relief);
  const model = buildModel(grid);
  if (!model) return null;
  try { await document.fonts?.ready; } catch { /* labels fall back to system faces */ }
  const W = o.width ?? 960, H = o.height ?? 600, s = o.scale ?? 2, ve = o.ve ?? 4;
  const ground = o.theme ?? "dark";
  const ink = LABEL[ground];
  const out = document.createElement("canvas");
  out.width = Math.round(W * s);
  out.height = Math.round(H * s);
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  const captionH = o.caption === false ? 0 : 40;
  const sceneH = H - captionH;
  ctx.fillStyle = GROUND[ground];
  ctx.fillRect(0, 0, out.width, out.height);

  let mode: "3d" | "2d" = "2d";
  if (o.mode !== "2d") {
    const glCanvas = document.createElement("canvas");
    glCanvas.width = Math.round(W * s);
    glCanvas.height = Math.round(sceneH * s);
    const gl = reliefContext(glCanvas, true);
    if (gl) {
      let r: ReliefRenderer | null = null;
      try {
        r = new ReliefRenderer(gl);
        r.setModel(model);
        const home = homePose(ve);
        const base = { az: o.azDeg !== undefined ? (o.azDeg * Math.PI) / 180 : home.az, el: o.elDeg !== undefined ? (o.elDeg * Math.PI) / 180 : home.el, zoom: home.zoom, ve };
        const pose = { ...base, zoom: o.zoom === "fit" ? fitZoom(model, base, W, sceneH) : o.zoom ?? home.zoom };
        const cam = camera(model, pose, W, sceneH);
        r.draw({ cam, ve, planet: o.planet, place: axisPlacement(cam), dpr: s, ground }, glCanvas.width, glCanvas.height);
        ctx.drawImage(glCanvas, 0, 0);
        ctx.save();
        ctx.scale(s, s);
        ctx.textBaseline = "middle";
        for (const l of layoutLabels(model, labelAnchors(model), cam, W, sceneH)) {
          ctx.font = l.kind === "north" ? `600 12px ${FONT_SANS}` : `${l.kind === "km" ? 10.5 : 11}px ${FONT_MONO}`;
          ctx.fillStyle = l.kind === "km" ? ink[1] : ink[0];
          ctx.textAlign = l.align;
          ctx.fillText(l.text, l.x + (l.align === "right" ? -4 : l.align === "left" ? 4 : 0), l.y);
        }
        ctx.restore();
        mode = "3d";
      } catch (err) {
        console.warn("[relief snapshot] WebGL2 render failed, drawing the 2D hillshade", err);
      } finally {
        r?.dispose();
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    }
  }
  if (mode === "2d") {
    const flat = document.createElement("canvas");
    flat.width = Math.round(W * s);
    flat.height = Math.round(sceneH * s);
    drawFlat(flat.getContext("2d")!, model, grid, { width: W, height: sceneH, scale: s, ve, planet: o.planet, background: GROUND[ground], ground });
    ctx.drawImage(flat, 0, 0);
  }

  if (captionH) {
    // Caption: what the picture is, in the app's label style; long lines are cut with an ellipsis.
    ctx.save();
    ctx.scale(s, s);
    ctx.fillStyle = ground === "paper" ? "rgba(17,17,17,0.18)" : "rgba(242,244,245,0.09)";
    ctx.fillRect(0, sceneH, W, 1);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const fit = (text: string, max: number) => {
      if (ctx.measureText(text).width <= max) return text;
      let t = text;
      while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
      return `${t.trimEnd()}…`;
    };
    const contour = model.contour ? `  ·  CONTOURS ${fmtNum(model.contour.interval)} m, INDEX ${fmtNum(model.contour.index)} m` : "";
    ctx.font = `600 10.5px ${FONT_SANS}`;
    ctx.fillStyle = ink[2];
    ctx.fillText(fit(`${relief.id.toUpperCase()}  ·  VERTICAL EXAGGERATION ×${ve}${contour}  ·  ${mode === "3d" ? "3D VIEW" : "HILLSHADE, NORTH UP"}`, W - 24), 12, sceneH + 14);
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillStyle = ink[3];
    const as = representationNote(relief.planet, relief.source.representation);
    ctx.fillText(fit(`${relief.rows} × ${relief.cols} cells @ ${relief.cell_m.toFixed(2)} m · ${relief.source.title} · ${as}`, W - 24), 12, sceneH + 29);
    ctx.restore();
  }
  return { dataUrl: out.toDataURL("image/png"), width: W, height: H, mode };
}
