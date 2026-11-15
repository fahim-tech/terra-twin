import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { leaderDy } from "../../components/map/Annotations";
import { useGlobes } from "../../store/globes";
import { calloutGeometry, placeCallout, underCover, type CalloutSide, type CalloutStart } from "./readouts";

export interface Callout {
  id: string;
  lat: number;
  lon: number;
  /** The label; a function receives the side it was placed on (to align its text towards the leader). */
  content: ReactNode | ((side: CalloutSide) => ReactNode);
  tone: "mars" | "neutral";
  /** Preferred leader direction from the point to the label; the label moves when it would not fit there. */
  side: CalloutSide;
  /** How far a north or a south label must clear the point (AOI square, zone outline), px. */
  clear?: { n: number; s: number };
  /**
   * Radius in px of a marker the globe already draws on this point. The callout then adds no mark of its
   * own on the point; its leader starts just outside the marker.
   */
  markerR?: number;
  /** Half-size in px of the footprint square drawn around the point; when larger than the marker, the leader starts outside it. */
  boxPx?: number;
}

/** Edge of the hollow square that marks a point the globe does not mark itself, px. */
const MARK = 9;
/** Edge of the solid square end marks, px. */
const END = 4;
/** The navigator field covers the top of the frame down to here on every layout (12 px inset + 44 px field). */
const NAVIGATOR_BOTTOM = 56;
/** Phones: the nav column (44 px buttons, 12 px inset) runs down the right edge and is not a measured inset. */
const PHONE_NAV_W = 60;

/** The frame's size, kept current. */
function useSize(ref: React.RefObject<HTMLElement>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Mars callouts in the mission-control vocabulary: a leader with square end marks — a hollow square on a
 * point (or a solid square just outside the globe's own marker or footprint square) and a solid square
 * where the leader plugs into its label plate. Positions are the globe's projected anchors (the same
 * tracking protocol as the shared AnnotationLayer, which Mars no longer mounts), so callouts follow the
 * camera and disappear behind the limb. Labels stay inside the free part of the frame (`placeCallout`).
 */
export function Callouts({ items }: { items: Callout[] }) {
  const bus = useGlobeBus();
  const anchors = useGlobes((s) => s.anchors.mars);
  const ins = useGlobes((s) => s.insets.mars);
  const root = useRef<HTMLDivElement>(null);
  const size = useSize(root);
  const key = items.map((i) => `${i.id}:${i.lat.toFixed(5)}:${i.lon.toFixed(5)}`).join("|");
  useEffect(() => {
    bus.send("mars", { t: "trackAnchors", anchors: items.map(({ id, lat, lon }) => ({ id, lat, lon })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, key]);
  useEffect(() => () => bus.send("mars", { t: "trackAnchors", anchors: [] }), [bus]);

  const phone = size.w > 0 && size.w < 768;
  const bounds = {
    left: ins.left,
    top: Math.max(ins.top, NAVIGATOR_BOTTOM),
    right: size.w - Math.max(ins.right, phone ? PHONE_NAV_W : 0),
    bottom: size.h - ins.bottom,
  };

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden={items.length === 0}>
      {size.w > 0 && items.map((it) => {
        const a = anchors[it.id];
        if (!a || !a.visible || underCover(a, size, ins)) return null;
        // Reach that clears what surrounds the point per side; never shorter than clearing the footprint square.
        const dy = { n: leaderDy(it.clear?.n), s: leaderDy(it.clear?.s) };
        const { side, maxW, dy: reach } = placeCallout(a, it.side, bounds, dy, { minDy: leaderDy(it.boxPx) });
        const marked = it.markerR !== undefined;
        const from: CalloutStart = it.boxPx !== undefined && it.boxPx > (it.markerR ?? 0) ? { square: it.boxPx + 3 }
          : marked ? { circle: it.markerR! + 2 } : { square: MARK / 2 + 1 };
        const g = calloutGeometry(a, side, reach, from);
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
            {/* Sized to its content up to the room on its side; a longer name wraps rather than running off the frame. */}
            <div className="absolute" style={{ left: g.end.x, top: g.end.y, width: "max-content", maxWidth: maxW, transform: `translate(${g.sx > 0 ? `${END / 2}px` : `calc(-100% - ${END / 2}px)`}, -50%)` }}>
              {typeof it.content === "function" ? it.content(side) : it.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
