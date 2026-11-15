import { useEffect, type ReactNode } from "react";
import { useGlobeBus } from "../../app/globeBus";
import type { Planet } from "../../globes/protocol";
import { useGlobes } from "../../store/globes";
import { cx } from "../ui";

export interface Annotation {
  id: string;
  lat: number;
  lon: number;
  content: ReactNode;
  tone?: "mars" | "earth" | "neutral";
  /** Leader-line direction from the point to the label. */
  side?: "ne" | "nw" | "se" | "sw";
  /** Half-size in px of a box drawn around the point (e.g. the AOI) that the label must sit outside. */
  clearPx?: number;
}

/** Vertical leader reach: the default, or far enough that a ~40 px label clears the box around the point. */
export function leaderDy(clearPx = 0) {
  return Math.max(DY, clearPx > 0 ? clearPx + 32 : 0);
}

const DX = 44, DY = 38;

/**
 * HTML annotations pinned to planetary coordinates with thin leader lines. Positions come from the
 * globe frame (projected anchors), so labels follow camera motion and hide behind the limb.
 */
export function AnnotationLayer({ planet, items, className }: { planet: Planet; items: Annotation[]; className?: string }) {
  const bus = useGlobeBus();
  const anchors = useGlobes((s) => s.anchors[planet]);
  const key = items.map((i) => `${i.id}:${i.lat.toFixed(5)}:${i.lon.toFixed(5)}`).join("|");
  useEffect(() => {
    bus.send(planet, { t: "trackAnchors", anchors: items.map(({ id, lat, lon }) => ({ id, lat, lon })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, planet, key]);
  useEffect(() => () => bus.send(planet, { t: "trackAnchors", anchors: [] }), [bus, planet]);

  return (
    <div className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden={items.length === 0}>
      {items.map((it) => {
        const a = anchors[it.id];
        if (!a || !a.visible) return null;
        const side = it.side ?? "ne";
        const sx = side.includes("e") ? 1 : -1;
        const sy = side.includes("n") ? -1 : 1;
        const lx = a.x + sx * DX, ly = a.y + sy * leaderDy(it.clearPx);
        const stroke = it.tone === "earth" ? "var(--color-earth)" : it.tone === "neutral" ? "var(--color-ink)" : "var(--color-mars)";
        return (
          <div key={it.id}>
            <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
              <polyline points={`${a.x},${a.y} ${a.x + sx * DX * 0.55},${ly} ${lx},${ly}`} fill="none" stroke={stroke} strokeOpacity="0.85" strokeWidth="1" />
              <circle cx={a.x} cy={a.y} r="3.5" fill="none" stroke={stroke} strokeWidth="1.25" />
            </svg>
            <div className="absolute" style={{ left: lx, top: ly, transform: `translate(${sx > 0 ? "6px" : "calc(-100% - 6px)"}, -50%)` }}>
              {it.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
