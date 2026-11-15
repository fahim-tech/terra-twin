import { useEffect, type ReactNode } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { leaderDy } from "../../components/map/Annotations";
import { useGlobes } from "../../store/globes";
import { calloutGeometry, type CalloutSide } from "./readouts";

export interface Callout {
  id: string;
  lat: number;
  lon: number;
  content: ReactNode;
  tone: "mars" | "neutral";
  /** Leader direction from the point to the label. */
  side: CalloutSide;
  /** Half-size in px of a box drawn around the point (the AOI) that the label must clear. */
  clearPx?: number;
  /**
   * Radius in px of a marker the globe already draws on this point. The callout then adds no mark of its
   * own on the point; its leader starts just outside the marker.
   */
  markerR?: number;
}

/** Edge of the hollow square that marks a point the globe does not mark itself, px. */
const MARK = 9;
/** Edge of the solid square end marks, px. */
const END = 4;

/**
 * Mars callouts in the mission-control vocabulary: a leader with square end marks — a hollow square on a
 * point (or a solid square just outside the globe's own marker) and a solid square where the leader
 * plugs into its label plate. Positions are the globe's projected anchors (the same tracking protocol as
 * the shared AnnotationLayer, which Mars no longer mounts), so callouts follow the camera and disappear
 * behind the limb.
 */
export function Callouts({ items }: { items: Callout[] }) {
  const bus = useGlobeBus();
  const anchors = useGlobes((s) => s.anchors.mars);
  const key = items.map((i) => `${i.id}:${i.lat.toFixed(5)}:${i.lon.toFixed(5)}`).join("|");
  useEffect(() => {
    bus.send("mars", { t: "trackAnchors", anchors: items.map(({ id, lat, lon }) => ({ id, lat, lon })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, key]);
  useEffect(() => () => bus.send("mars", { t: "trackAnchors", anchors: [] }), [bus]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={items.length === 0}>
      {items.map((it) => {
        const a = anchors[it.id];
        if (!a || !a.visible) return null;
        const marked = it.markerR !== undefined;
        const g = calloutGeometry(a, it.side, leaderDy(it.clearPx), marked ? { circle: it.markerR! + 2 } : { square: MARK / 2 + 1 });
        const stroke = it.tone === "neutral" ? "var(--color-ink)" : "var(--color-mars)";
        const leader = `${g.start.x},${g.start.y} ${g.elbow.x},${g.elbow.y} ${g.end.x},${g.end.y}`;
        const sq = (p: { x: number; y: number }) => <rect x={p.x - END / 2} y={p.y - END / 2} width={END} height={END} fill={stroke} />;
        return (
          <div key={it.id}>
            <svg className="absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
              {/* A dark under-stroke keeps the hairlines legible over bright terrain. */}
              <g fill="none" stroke="rgb(2 3 4 / 0.5)" strokeWidth="3">
                {!marked && <rect x={a.x - MARK / 2} y={a.y - MARK / 2} width={MARK} height={MARK} />}
                <polyline points={leader} />
              </g>
              {!marked && <rect x={a.x - MARK / 2} y={a.y - MARK / 2} width={MARK} height={MARK} fill="none" stroke={stroke} strokeWidth="1.25" />}
              <polyline points={leader} fill="none" stroke={stroke} strokeWidth="1" />
              {marked && sq(g.start)}
              {sq(g.end)}
            </svg>
            <div className="absolute" style={{ left: g.end.x, top: g.end.y, transform: `translate(${g.sx > 0 ? `${END / 2}px` : `calc(-100% - ${END / 2}px)`}, -50%)` }}>
              {it.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
