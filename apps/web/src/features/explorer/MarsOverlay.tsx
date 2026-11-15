import { AnnotationLayer, type Annotation } from "../../components/map/Annotations";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { useExplorer } from "./explorerStore";
import { formatCoord, formatKm, readZone } from "./zones";

/**
 * Over the Mars globe: the selection annotation (toponym + coordinates on a leader line), the
 * original off-zone point after "Go to nearest zone", and a hover readout that says — before any
 * click — whether the point under the cursor has terrain data.
 */
export function MarsOverlay() {
  const selection = useApp((s) => s.selection);
  const origin = useExplorer((s) => s.origin);
  const anchors = useGlobes((s) => s.anchors.mars);
  // Keep labels on screen: flip the leader line away from the right and top edges.
  const sideFor = (id: string, fallback: Annotation["side"]): Annotation["side"] => {
    const a = anchors[id];
    if (!a) return fallback;
    const ew = a.x > window.innerWidth - 230 ? "w" : a.x < 230 ? "e" : fallback!.slice(1);
    const ns = a.y < 110 ? "s" : fallback![0];
    return `${ns}${ew}` as Annotation["side"];
  };
  const items: Annotation[] = [];
  if (selection) {
    items.push({
      id: "selection", lat: selection.lat, lon: selection.lon, tone: "mars", side: sideFor("selection", "ne"),
      content: (
        <div className="on-imagery whitespace-nowrap">
          <div className="toponym text-toponym-sm text-ink">{selection.siteId ? selection.label : "Selected point"}</div>
          <div className="num text-num-sm text-ink/85">{formatCoord(selection.lat, selection.lon)}</div>
        </div>
      ),
    });
  }
  if (origin && selection && (origin.lat !== selection.lat || origin.lon !== selection.lon)) {
    items.push({
      id: "origin", lat: origin.lat, lon: origin.lon, tone: "neutral", side: sideFor("origin", "sw"),
      content: (
        <div className="on-imagery whitespace-nowrap text-right">
          <div className="text-caption text-ink">Your point</div>
          <div className="num text-num-sm text-ink/85">{formatCoord(origin.lat, origin.lon)}</div>
        </div>
      ),
    });
  }
  return (
    <>
      <AnnotationLayer planet="mars" items={items} />
      <HoverReadout />
    </>
  );
}

/** Client-side zone readout for the point under the cursor (fine pointers only; no API call). */
function HoverReadout() {
  const hover = useGlobes((s) => (s.hover?.planet === "mars" ? s.hover : null));
  const ins = useGlobes((s) => s.insets.mars);
  const sites = useSites();
  const selection = useApp((s) => s.selection);
  const z = hover ? readZone(sites.data, hover.lat, hover.lon) : null;
  if (!hover || !z) {
    // Idle hint before the first selection: what the outlines are and that any point can be inspected.
    if (selection || !sites.data) return null;
    return (
      <div aria-hidden className="pointer-events-none absolute z-10 hidden [@media(hover:hover)]:block" style={{ left: ins.left + 16, bottom: ins.bottom + 92 }}>
        <div className="on-imagery flex items-center gap-2.5 text-caption text-ink/85">
          <span className="h-2.5 w-2.5 rounded-[2px] ring-1 ring-mars" />
          Outlined: {sites.data.length} research zones with measured terrain · click any point to inspect it
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute z-10 hidden [@media(hover:hover)]:block" style={{ left: ins.left + 16, bottom: ins.bottom + 92 }}>
      <div className="surface flex items-baseline gap-2.5 rounded-full px-3.5 py-1.5">
        <span aria-hidden className={z.inside ? "h-2 w-2 self-center rounded-[2px] ring-1 ring-mars" : "h-2 w-2 self-center rounded-full ring-1 ring-faint"} />
        {z.inside
          ? <span className="text-label text-ink">Research zone · <span className="toponym text-[15px]">{z.name}</span></span>
          : <span className="text-label text-muted">No terrain data here · nearest zone <span className="text-ink">{z.name}</span>, <span className="num">{formatKm(z.km ?? 0)}</span></span>}
        <span className="num text-num-sm text-faint">{formatCoord(hover.lat, hover.lon)}</span>
      </div>
    </div>
  );
}
