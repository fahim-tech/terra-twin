import type { CSSProperties } from "react";
import { cx } from "../../components/ui";
import { zoneName } from "../../lib/glossary";
import { R_MARS_M } from "../../lib/geodesy";
import { useSites } from "../../services/api";
import { useApp } from "../../store/app";
import { useGlobes } from "../../store/globes";
import { Callouts, type Callout } from "./Callouts";
import { useExplorer } from "./explorerStore";
import { KmFigure, Mark } from "./parts";
import { formatCoord, readZone, zoneRing, zonesNear } from "./zones";

/**
 * Zones whose outlines a callout keeps clear of: those whose centres lie within this distance of its point. A
 * label sits within a couple of hundred pixels of its point, which at site scale (about 900 km up) is a small
 * fraction of this; zones farther away cannot reach it.
 */
const NEAR_KM = 900;

/**
 * Callout label: a dark plate with corner brackets, condensed caps name over a mono coordinate. The name
 * wraps (balanced) when the callout caps the plate's width; the coordinate stays on one line.
 */
function Plate({ title, coord, tone, align = "left" }: { title: string; coord: string; tone: "mars" | "neutral"; align?: "left" | "right" }) {
  const frame = { "--frame-l": "6px", "--frame-c": tone === "mars" ? "rgb(236 127 83 / 0.95)" : "rgb(242 244 245 / 0.7)" } as CSSProperties;
  return (
    <div style={frame} className={cx("frame on-imagery bg-[rgb(2_3_4/0.8)] px-2.5 pb-[5px] pt-[3px]", align === "right" && "text-right")}>
      <div className="toponym text-balance text-[16px] leading-[1.2] tracking-[0.06em] text-ink">{title}</div>
      <div className="num whitespace-nowrap text-[11px] leading-[1.3] text-ink/80">{coord}</div>
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
  // The zone outlines around a callout's point, and the other zones' centre glyphs: its plate keeps clear of
  // them, so it never sits across a line (a plate on a neighbouring zone's corner seems to name that zone) or
  // covers another zone's mark. Only zones near enough to share the screen with the label are tracked.
  const around = (lat: number, lon: number, ownId: string | null) => {
    const near = zonesNear(sites.data, lat, lon, NEAR_KM);
    return {
      outlines: near.map((s) => ({ pts: zoneRing(s), own: s.id === ownId })),
      marks: near.filter((s) => s.id !== ownId).map((s) => ({ lat: s.lat, lon: s.lon })),
    };
  };
  // Preferred sides only: the callout layer moves a label that would leave the free part of the frame.
  const items: Callout[] = [];
  if (selection) {
    items.push({
      // The globe marks the selection itself (a round marker of up to ~11 px radius) and draws the AOI
      // square around it, so the leader leaves from the outside of whichever is larger — or, in the 3D view,
      // from the glyph the globe stands on a stem above the point.
      id: "selection", lat: selection.lat, lon: selection.lon, tone: "mars", side: "ne",
      clear: { n: clearFor("n"), s: clearFor("s") }, markerR: 11, boxPx: aoiHalfPx,
      ...around(selection.lat, selection.lon, zone?.id ?? null),
      content: <Plate tone="mars" title={selection.siteId ? zoneName(selection.siteId) : "Selected point"} coord={formatCoord(selection.lat, selection.lon)} />,
    });
  }
  if (origin && selection && (origin.lat !== selection.lat || origin.lon !== selection.lon)) {
    items.push({
      id: "origin", lat: origin.lat, lon: origin.lon, tone: "neutral", side: "sw",
      ...around(origin.lat, origin.lon, null),
      content: (side) => <Plate tone="neutral" title="Your point" coord={formatCoord(origin.lat, origin.lon)} align={side.endsWith("w") ? "right" : "left"} />,
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
