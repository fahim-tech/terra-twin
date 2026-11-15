import { Measure } from "../../components/primitives";
import { useGlobes } from "../../store/globes";
import type { CandidateView } from "../analogs/candidates";
import { CORNERS } from "./FootprintGauge";
import { pairLink } from "./gauge";
import { useCompareStage } from "./layout";

const TICK = 4;

/**
 * The comparison drawn across the split: a dashed link from the Mars footprint to the Earth footprint
 * (their projected corners, tracked by the footprint gauges) with the score and its basis where the
 * link crosses the seam between the globes. Visual only (aria-hidden): the strip states the same score
 * and basis. Hidden whenever either square is off-screen or the two do not face each other across the seam.
 */
export function PairLink({ c }: { c: CandidateView }) {
  const stageW = useCompareStage((s) => s.w);
  const mars = useGlobes((s) => s.anchors.mars);
  const earth = useGlobes((s) => s.anchors.earth);
  if (!stageW) return null;
  const half = stageW / 2;
  const shift = (p: { x: number; y: number; visible: boolean } | undefined) => (p ? { ...p, x: p.x + half } : p);
  const link = pairLink(CORNERS.map((id) => mars[id]), CORNERS.map((id) => shift(earth[id])), half);
  if (!link) return null;
  const [x1, y1, x2, y2] = link.line;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = (-(y2 - y1) / len) * TICK, ny = ((x2 - x1) / len) * TICK;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <g stroke="var(--color-ink)" strokeWidth="1" fill="none" shapeRendering="geometricPrecision">
          <line x1={x1} y1={y1} x2={x2} y2={y2} strokeOpacity="0.5" strokeDasharray="3 4" />
          <line x1={x1 - nx} y1={y1 - ny} x2={x1 + nx} y2={y1 + ny} strokeOpacity="0.9" />
          <line x1={x2 - nx} y1={y2 - ny} x2={x2 + nx} y2={y2 + ny} strokeOpacity="0.9" />
        </g>
      </svg>
      <div className="frame absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-space/90 px-3 pb-2 pt-1.5 text-center [--frame-l:6px]"
        style={{ left: link.seam.x, top: link.seam.y }}>
        <div className="kicker !text-[10px] leading-none">{c.tier === 2 ? "Research comparison" : "Global screen"}</div>
        <div className="mt-1.5 flex items-baseline justify-center gap-1.5 leading-none">
          <span className="text-caption text-muted">S</span>
          <Measure value={c.score} digits={3} className="text-[17px] text-ink" />
        </div>
      </div>
    </div>
  );
}
