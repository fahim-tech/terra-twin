import { AnnotationLayer, leaderDy, type Annotation } from "../../components/map/Annotations";
import { zoneName } from "../../lib/glossary";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { useExplorer } from "./explorerStore";
import { formatCoord, formatKm, readZone } from "./zones";
import { R_MARS_M } from "../../lib/geodesy";

/**
 * Over the Mars globe: the selection annotation (toponym + coordinates on a leader line), the
 * original off-zone point after "Go to nearest zone", and a hover readout that says — before any
 * click — whether the point under the cursor has terrain data.
 */
export function MarsOverlay() {
  const selection = useApp((s) => s.selection);
  const origin = useExplorer((s) => s.origin);
  const anchors = useGlobes((s) => s.anchors.mars);
  const mpp = useGlobes((s) => s.camera.mars?.metersPerPixel ?? null);
  const footprintKm = useApp((s) => s.footprintKm);
  const sites = useSites();
  // The selection label sits outside the AOI square drawn around the point. On phones the zone's outline
  // is close around the point too and the label is wider than the gap beside it, so there the label also
  // clears the zone outline vertically (top-down camera: degrees of latitude → px via the frame's scale).
  const aoiHalfPx = mpp ? Math.min(240, (footprintKm * 500) / mpp) : 0;
  const zone = selection?.siteId ? sites.data?.find((x) => x.id === selection.siteId) : undefined;
  const pxPerDegLat = mpp ? (Math.PI * R_MARS_M) / 180 / mpp : 0;
  const narrow = typeof window !== "undefined" && window.innerWidth < 768;
  const clearFor = (ns: "n" | "s") => {
    const zonePx = narrow && zone && selection && pxPerDegLat
      ? (ns === "n" ? zone.bbox.lat_max - selection.lat : selection.lat - zone.bbox.lat_min) * pxPerDegLat : 0;
    return Math.min(260, Math.max(aoiHalfPx, zonePx));
  };
  // Keep labels on screen: flip the leader line away from the right and top edges.
  const sideFor = (id: string, fallback: Annotation["side"], clearPx = 0): Annotation["side"] => {
    const a = anchors[id];
    if (!a) return fallback;
    const ew = a.x > window.innerWidth - 230 ? "w" : a.x < 230 ? "e" : fallback!.slice(1);
    const ns = a.y < leaderDy(clearPx) + 72 ? "s" : fallback![0];
    return `${ns}${ew}` as Annotation["side"];
  };
  const items: Annotation[] = [];
  const selSide = sideFor("selection", "ne", clearFor("n"));
  if (selection) {
    items.push({
      id: "selection", lat: selection.lat, lon: selection.lon, tone: "mars", side: selSide, clearPx: clearFor(selSide![0] as "n" | "s"),
      content: (
        // A small basalt plate keeps the thin mono coordinates legible over bright, busy terrain.
        <div className="on-imagery whitespace-nowrap rounded-control bg-space/70 px-2 py-1">
          <div className="toponym text-toponym-sm text-ink">{selection.siteId ? zoneName(selection.siteId) : "Selected point"}</div>
          <div className="num text-num-sm text-ink/85">{formatCoord(selection.lat, selection.lon)}</div>
        </div>
      ),
    });
  }
  if (origin && selection && (origin.lat !== selection.lat || origin.lon !== selection.lon)) {
    items.push({
      id: "origin", lat: origin.lat, lon: origin.lon, tone: "neutral", side: sideFor("origin", "sw"),
      content: (
        <div className="on-imagery whitespace-nowrap rounded-control bg-space/70 px-2 py-1 text-right">
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

/**
 * Client-side zone readout for the point under the cursor (fine pointers only; no API call). The
 * coordinate itself is already in the top rail's hover readout, so it is not repeated here.
 */
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
          : <span className="text-label text-muted">No terrain data here · nearest zone <span className="text-ink">{z.name}</span>, <span className="num">{formatKm(z.km ?? 0)}</span> to centre</span>}
      </div>
    </div>
  );
}
