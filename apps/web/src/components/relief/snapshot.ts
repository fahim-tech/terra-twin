/**
 * Static relief image for reports: renders the same scene as the live view once, off screen, and
 * burns in the scale labels and a caption (vertical exaggeration, contour interval, provenance) so the
 * picture stays self-describing wherever it is placed. Falls back to the 2D hillshade without WebGL2.
 */
import type { Relief } from "../../types/contracts";
import { drawFlat, FONT_MONO, FONT_SANS } from "./flat";
import { ReliefRenderer, reliefContext } from "./reliefGl";
import { axisPlacement, buildModel, camera, fmtNum, homePose, labelAnchors, layoutLabels, representationNote, toGrid } from "./reliefMath";

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
  zoom?: number;
  /** Force the 2D hillshade. */
  mode?: "auto" | "2d";
}

export interface Snapshot { dataUrl: string; width: number; height: number; mode: "3d" | "2d" }

const BG = "#030405";

export async function renderReliefSnapshot(relief: Relief, o: SnapshotOptions): Promise<Snapshot | null> {
  const grid = toGrid(relief);
  const model = buildModel(grid);
  if (!model) return null;
  try { await document.fonts?.ready; } catch { /* labels fall back to system faces */ }
  const W = o.width ?? 960, H = o.height ?? 600, s = o.scale ?? 2, ve = o.ve ?? 4;
  const out = document.createElement("canvas");
  out.width = Math.round(W * s);
  out.height = Math.round(H * s);
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  const captionH = 40;
  const sceneH = H - captionH;
  ctx.fillStyle = BG;
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
        const pose = { az: o.azDeg !== undefined ? (o.azDeg * Math.PI) / 180 : home.az, el: o.elDeg !== undefined ? (o.elDeg * Math.PI) / 180 : home.el, zoom: o.zoom ?? home.zoom, ve };
        const cam = camera(model, pose, W, sceneH);
        r.draw({ cam, ve, planet: o.planet, place: axisPlacement(cam), dpr: s }, glCanvas.width, glCanvas.height);
        ctx.drawImage(glCanvas, 0, 0);
        ctx.save();
        ctx.scale(s, s);
        ctx.textBaseline = "middle";
        for (const l of layoutLabels(model, labelAnchors(model), cam, W, sceneH)) {
          ctx.font = l.kind === "north" ? `600 12px ${FONT_SANS}` : `${l.kind === "km" ? 10.5 : 11}px ${FONT_MONO}`;
          ctx.fillStyle = l.kind === "km" ? "rgba(242,244,245,0.75)" : "rgba(242,244,245,0.95)";
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
    drawFlat(flat.getContext("2d")!, model, grid, { width: W, height: sceneH, scale: s, ve, planet: o.planet, background: BG });
    ctx.drawImage(flat, 0, 0);
  }

  // Caption: what the picture is, in the app's label style; long lines are cut with an ellipsis.
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = "rgba(242,244,245,0.09)";
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
  ctx.fillStyle = "rgba(242,244,245,0.92)";
  ctx.fillText(fit(`${relief.id.toUpperCase()}  ·  VERTICAL EXAGGERATION ×${ve}${contour}  ·  ${mode === "3d" ? "3D VIEW" : "HILLSHADE, NORTH UP"}`, W - 24), 12, sceneH + 14);
  ctx.font = `10px ${FONT_MONO}`;
  ctx.fillStyle = "rgba(166,174,182,0.95)";
  const as = representationNote(relief.planet, relief.source.representation);
  ctx.fillText(fit(`${relief.rows} × ${relief.cols} cells @ ${relief.cell_m.toFixed(2)} m · ${relief.source.title} · ${as}`, W - 24), 12, sceneH + 29);
  ctx.restore();
  return { dataUrl: out.toDataURL("image/png"), width: W, height: H, mode };
}
