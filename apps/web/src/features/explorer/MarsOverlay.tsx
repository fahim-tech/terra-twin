import type { CSSProperties } from "react";
import { leaderDy } from "../../components/map/Annotations";
import { cx } from "../../components/ui";
import { zoneName } from "../../lib/glossary";
import { R_MARS_M } from "../../lib/geodesy";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { Callouts, type Callout } from "./Callouts";
import { useExplorer } from "./explorerStore";
import { KmFigure, Mark } from "./parts";
import { formatCoord, readZone } from "./zones";

/** Callout label: a dark plate with corner brackets, condensed caps name over a mono coordinate. */
function Plate({ title, coord, tone, align = "left" }: { title: string; coord: string; tone: "mars" | "neutral"; align?: "left" | "right" }) {
  const frame = { "--frame-l": "6px", "--frame-c": tone === "mars" ? "rgb(236 127 83 / 0.95)" : "rgb(242 244 245 / 0.7)" } as CSSProperties;
  return (
    <div style={frame} className={cx("frame on-imagery whitespace-nowrap bg-[rgb(2_3_4/0.8)] px-2.5 pb-[5px] pt-[3px]", align === "right" && "text-right")}>
      <div className="toponym text-[16px] leading-[1.2] tracking-[0.06em] text-ink">{title}</div>
      <div className="num text-[11px] leading-[1.3] text-ink/80">{coord}</div>
    </div>
  );
}

/**
 * Over the Mars globe: the selection callout (zone name + coordinates on a leader line), the original
 * off-zone point after "Go to nearest zone", and a hover readout that says — before any click —
 * whether the point under the cursor has terrain data.
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
  const sideFor = (id: string, fallback: Callout["side"], clearPx = 0): Callout["side"] => {
    const a = anchors[id];
    if (!a) return fallback;
    const ew = a.x > window.innerWidth - 230 ? "w" : a.x < 230 ? "e" : fallback.slice(1);
    const ns = a.y < leaderDy(clearPx) + 72 ? "s" : fallback[0];
    return `${ns}${ew}` as Callout["side"];
  };
  const items: Callout[] = [];
  const selSide = sideFor("selection", "ne", clearFor("n"));
  if (selection) {
    items.push({
      // The globe marks the selection itself (a round marker of up to ~11 px radius), so the callout
      // only leaves from its edge.
      id: "selection", lat: selection.lat, lon: selection.lon, tone: "mars", side: selSide, clearPx: clearFor(selSide[0] as "n" | "s"), markerR: 11,
      content: <Plate tone="mars" title={selection.siteId ? zoneName(selection.siteId) : "Selected point"} coord={formatCoord(selection.lat, selection.lon)} />,
    });
  }
  if (origin && selection && (origin.lat !== selection.lat || origin.lon !== selection.lon)) {
    const side = sideFor("origin", "sw");
    items.push({
      id: "origin", lat: origin.lat, lon: origin.lon, tone: "neutral", side,
      content: <Plate tone="neutral" title="Your point" coord={formatCoord(origin.lat, origin.lon)} align={side.endsWith("w") ? "right" : "left"} />,
    });
  }
  return (
    <>
      <Callouts items={items} />
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
  const place = { left: ins.left + 16, bottom: ins.bottom + 92 };
  if (!hover || !z) {
    // Idle hint before the first selection: what the outlines are and that any point can be inspected.
    if (selection || !sites.data) return null;
    return (
      <div aria-hidden className="pointer-events-none absolute z-10 hidden [@media(hover:hover)]:block" style={place}>
        <div className="on-imagery flex items-center gap-2.5 text-caption text-ink/85">
          <span className="h-2.5 w-2.5 shrink-0 ring-1 ring-inset ring-mars" />
          <span>Outlined: <span className="num">{sites.data.length}</span> research zones with measured terrain · click any point to inspect it</span>
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className="pointer-events-none absolute z-10 hidden [@media(hover:hover)]:block" style={place}>
      <div className="surface flex items-center gap-2.5 rounded-control py-1.5 pl-2.5 pr-3">
        <Mark on={z.inside} tone="mars" />
        {z.inside ? (
          <>
            <span className="kicker !text-muted">Research zone</span>
            <span className="toponym text-[15px] leading-none tracking-[0.05em] text-ink">{z.name}</span>
          </>
        ) : (
          <>
            <span className="kicker !text-muted">No terrain data</span>
            <span className="text-label text-muted">
              nearest <span className="text-ink">{z.name}</span>
              {typeof z.km === "number" && <>, <span className="text-ink"><KmFigure km={z.km} /></span> to centre</>}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
