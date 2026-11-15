import { useEffect, useMemo } from "react";
import { useGlobeBus } from "../../app/globeBus";
import type { Planet } from "../../globes/protocol";
import { R_EARTH_MEAN_M, R_MARS_M, squareFootprint } from "../../lib/geodesy";
import { useGlobes } from "../../store/globes";
import { footprintDimension, kmLabel } from "./gauge";

/** Anchor ids for the square's corners, in the ring order squareFootprint returns (NE, SE, SW, NW). */
export const CORNERS = ["cmp:ne", "cmp:se", "cmp:sw", "cmp:nw"] as const;
const SLASH = 3.5;

/**
 * Dimension line under the compared footprint on one globe: extension lines from the square's two
 * lower corners as projected on screen (globe anchors, so it follows tilt, heading and zoom) and the
 * footprint size as the record states it (`label`, the same figure as the footprint line; defaults to
 * the drawn size). Hidden while a corner is off-screen or the square is too small to label. Fills the
 * planet's own frame: anchors are in that frame's pixels.
 */
export function FootprintGauge({ planet, lat, lon, km, label }: { planet: Planet; lat: number; lon: number; km: number; label?: string }) {
  const bus = useGlobeBus();
  // The globe draws the same square: squareFootprint on the planet's mean sphere.
  const corners = useMemo(() => squareFootprint(lat, lon, km, planet === "mars" ? R_MARS_M : R_EARTH_MEAN_M), [planet, lat, lon, km]);
  useEffect(() => {
    bus.send(planet, { t: "trackAnchors", anchors: corners.map((c, i) => ({ id: CORNERS[i], lat: c.lat, lon: c.lon })) });
  }, [bus, planet, corners]);
  useEffect(() => () => bus.send(planet, { t: "trackAnchors", anchors: [] }), [bus, planet]);

  const anchors = useGlobes((s) => s.anchors[planet]);
  const dim = footprintDimension(CORNERS.map((id) => anchors[id]));
  if (!dim) return null;
  const [x1, y1, x2, y2] = dim.line;
  // Architectural ticks: short 45° slashes where the extension lines cross the dimension line.
  const sx = ((dim.u[0] - dim.n[0]) / Math.SQRT2) * SLASH;
  const sy = ((dim.u[1] - dim.n[1]) / Math.SQRT2) * SLASH;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <g stroke="var(--color-ink)" strokeWidth="1" fill="none" shapeRendering="geometricPrecision">
          {dim.ext.map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} strokeOpacity="0.55" />)}
          <line x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity="0.8" />
          <line x1={x1 - sx} y1={y1 - sy} x2={x1 + sx} y2={y1 + sy} strokeOpacity="0.95" />
          <line x1={x2 - sx} y1={y2 - sy} x2={x2 + sx} y2={y2 + sy} strokeOpacity="0.95" />
        </g>
      </svg>
      <span className="num absolute whitespace-nowrap bg-space/85 px-1.5 py-[3px] text-[11px] leading-none text-ink"
        style={{ left: dim.label.x, top: dim.label.y, transform: `translate(-50%, -50%) rotate(${dim.label.angle}deg)` }}>
        {label ?? kmLabel(km)}
      </span>
    </div>
  );
}
