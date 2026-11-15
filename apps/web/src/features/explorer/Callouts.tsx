import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useGlobeBus } from "../../app/globeBus";
import { leaderDy } from "../../components/map/Annotations";
import { anchorPoint } from "../../globes/protocol";
import { useGlobes } from "../../store/globes";
import { calloutGeometry, dodgeEdges, placeCallout, reachFromGlyph, underCover, type CalloutSide, type CalloutStart } from "./readouts";

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
  /**
   * Points on outlines that cross the screen near the point (the zone's north and south edges straight above
   * and below it). Tracked like the point itself; the label keeps its plate clear of those lines.
   */
  edges?: { lat: number; lon: number }[];
}

/** Edge of the hollow square that marks a point the globe does not mark itself, px. */
const MARK = 9;
/** Edge of the solid square end marks, px. */
const END = 4;
/** Half-size of the globe's bracketed glyph (glyphs.ts: brackets 11 px from its centre). */
const GLYPH_HALF = 11;
/** Below this the glyph sits on its ground point (top-down view): the footprint square decides where the leader starts. */
const STEM_MIN_PX = 2;
/** Least vertical reach of a leader from the glyph, px (the shared default). */
const MIN_REACH = leaderDy();
/** Half the height of a label plate (condensed name over a mono coordinate), and the clearance kept from crossing lines, px. */
const PLATE_HALF_H = 21;
const LINE_GAP = 4;
const edgeId = (id: string, i: number) => `${id}~edge${i}`;
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
 *
 * In the 3D view the globe stands the selected glyph on a stem above its ground point and reports where
 * (anchor `top`): the side is chosen, and the leader drawn, from that glyph — the label meets the mark the
 * reader sees, not the stem's foot — while the reach still clears the square around the ground point.
 */
export function Callouts({ items }: { items: Callout[] }) {
  const bus = useGlobeBus();
  const anchors = useGlobes((s) => s.anchors.mars);
  const ins = useGlobes((s) => s.insets.mars);
  const root = useRef<HTMLDivElement>(null);
  const size = useSize(root);
  const key = items.map((i) => `${i.id}:${i.lat.toFixed(5)}:${i.lon.toFixed(5)}:${(i.edges ?? []).map((e) => `${e.lat.toFixed(4)},${e.lon.toFixed(4)}`).join(";")}`).join("|");
  useEffect(() => {
    bus.send("mars", {
      t: "trackAnchors",
      anchors: items.flatMap(({ id, lat, lon, edges }) => [{ id, lat, lon }, ...(edges ?? []).map((e, i) => ({ id: edgeId(id, i), lat: e.lat, lon: e.lon }))]),
    });
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
        const marked = it.markerR !== undefined;
        // The glyph on its stem when the globe draws one (3D view); else the point itself.
        const o = anchorPoint(a);
        const stemPx = o.glyph && marked ? a.y - o.y : 0;
        const stemmed = stemPx > STEM_MIN_PX;
        const p = stemmed ? { x: o.x, y: o.y } : { x: a.x, y: a.y };
        // Reach that clears what surrounds the point per side (measured from the ground point); never shorter
        // than clearing the footprint square.
        const dy = { n: leaderDy(it.clear?.n), s: leaderDy(it.clear?.s) };
        const box = leaderDy(it.boxPx);
        const minDy = stemmed ? Math.max(MIN_REACH, box - stemPx) : box;
        const placed = placeCallout(p, it.side, bounds, stemmed ? reachFromGlyph(dy, stemPx, MIN_REACH) : dy, { minDy });
        const { side, maxW } = placed;
        // Keep the plate off the zone's edges where they cross the screen near the point.
        const edgeYs = (it.edges ?? []).map((_, i) => anchors[edgeId(it.id, i)]).filter((e) => e?.visible).map((e) => e!.y);
        const reach = dodgeEdges(p.y, side, placed.dy, edgeYs, { halfH: PLATE_HALF_H, gap: LINE_GAP, minDy, top: bounds.top, bottom: bounds.bottom });
        const from: CalloutStart = stemmed ? { square: GLYPH_HALF + 2 }
          : it.boxPx !== undefined && it.boxPx > (it.markerR ?? 0) ? { square: it.boxPx + 3 }
            : marked ? { circle: it.markerR! + 2 } : { square: MARK / 2 + 1 };
        const g = calloutGeometry(p, side, reach, from);
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
