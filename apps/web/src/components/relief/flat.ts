/**
 * 2D relief drawing for browsers without WebGL2 (and for print / snapshots): a north-up hillshade of
 * the same grid under the same sun, contour lines at the same interval, a framed km scale along the
 * south and west edges and a north arrow. Labels are drawn with the app's own faces.
 */
import { contourSegments, fmtNum, hillshade, TINT, type Grid, type Model } from "./reliefMath";

export const FONT_MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, monospace';
export const FONT_SANS = '"Barlow", ui-sans-serif, system-ui, sans-serif';
const INK = "242, 244, 245";

export interface FlatOptions {
  /** CSS pixels. */
  width: number;
  height: number;
  /** Device pixels per CSS pixel. */
  scale: number;
  ve: number;
  planet: "earth" | "mars";
  background?: string;
}

/** Plot square (CSS px) inside the canvas, leaving room for the scale labels. */
export function flatLayout(width: number, height: number) {
  const m = { left: 52, right: 24, top: 34, bottom: 34 };
  const side = Math.max(40, Math.min(width - m.left - m.right, height - m.top - m.bottom));
  const left = m.left + Math.max(0, (width - m.left - m.right - side) / 2);
  const top = m.top + Math.max(0, (height - m.top - m.bottom - side) / 2);
  return { left, top, side };
}

export function drawFlat(ctx: CanvasRenderingContext2D, model: Model, grid: Grid, o: FlatOptions): void {
  const s = o.scale;
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, o.width, o.height);
  if (o.background) {
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, o.width, o.height);
  }
  const { left, top, side } = flatLayout(o.width, o.height);
  const pxPerM = side / Math.max(model.widthM, model.heightM);
  const w = model.widthM * pxPerM, h = model.heightM * pxPerM;

  // "No data" hatch under the image: shows through cells without elevation.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, w, h);
  ctx.clip();
  ctx.fillStyle = "rgb(8, 9, 10)";
  ctx.fillRect(left, top, w, h);
  ctx.strokeStyle = `rgba(${INK}, 0.12)`;
  ctx.lineWidth = 1;
  for (let d = -h; d < w + h; d += 7) {
    ctx.beginPath();
    ctx.moveTo(left + d, top + h);
    ctx.lineTo(left + d + h, top);
    ctx.stroke();
  }
  ctx.restore();

  const img = new ImageData(hillshade(grid, o.ve, TINT[o.planet]), grid.cols, grid.rows);
  const tile = document.createElement("canvas");
  tile.width = grid.cols;
  tile.height = grid.rows;
  tile.getContext("2d")!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tile, left, top, w, h);

  // Contours, index contours brighter.
  const cell = model.cellM * pxPerM;
  if (model.contour) {
    const { interval, index } = model.contour;
    for (let lv = Math.ceil(model.zMin / interval) * interval; lv <= model.zMax; lv += interval) {
      const segs = contourSegments(grid, lv);
      if (!segs.length) continue;
      const major = Math.abs(lv / index - Math.round(lv / index)) < 1e-9;
      ctx.strokeStyle = `rgba(${INK}, ${major ? 0.55 : 0.2})`;
      ctx.lineWidth = major ? 1.2 : 0.8;
      ctx.beginPath();
      for (let k = 0; k < segs.length; k += 4) {
        ctx.moveTo(left + (segs[k] + 0.5) * cell, top + (segs[k + 1] + 0.5) * cell);
        ctx.lineTo(left + (segs[k + 2] + 0.5) * cell, top + (segs[k + 3] + 0.5) * cell);
      }
      ctx.stroke();
    }
  }

  // Frame and km scale (distance from the south-west corner).
  ctx.strokeStyle = `rgba(${INK}, 0.55)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
  ctx.fillStyle = `rgba(${INK}, 0.85)`;
  ctx.font = `11px ${FONT_MONO}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  const bottom = top + h;
  model.kmTicks.x.forEach((km, i, a) => {
    const x = Math.round(left + km * 1000 * pxPerM) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + 5);
    ctx.stroke();
    ctx.fillText(i === a.length - 1 ? `${fmtNum(km)} km E` : fmtNum(km), x, bottom + 8);
  });
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  model.kmTicks.z.forEach((km, i, a) => {
    const y = Math.round(bottom - km * 1000 * pxPerM) + 0.5;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left - 5, y);
    ctx.stroke();
    ctx.fillText(i === a.length - 1 ? `${fmtNum(km)} N` : fmtNum(km), left - 8, y);
  });

  // North arrow above the top edge (row 0 is north).
  const cx = left + w / 2;
  ctx.beginPath();
  ctx.moveTo(cx, top - 6);
  ctx.lineTo(cx, top - 22);
  ctx.moveTo(cx - 4, top - 17);
  ctx.lineTo(cx, top - 22);
  ctx.lineTo(cx + 4, top - 17);
  ctx.strokeStyle = `rgba(${INK}, 0.85)`;
  ctx.stroke();
  ctx.font = `600 11px ${FONT_SANS}`;
  ctx.textAlign = "left";
  ctx.fillText("N", cx + 7, top - 17);
  ctx.restore();
}
