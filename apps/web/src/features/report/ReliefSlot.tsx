import type { UseQueryResult } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Term } from "../../components/primitives";
import { GridFacts, renderReliefSnapshot, reliefWindowId, unavailableWords, type Snapshot } from "../../components/relief";
import { contourInterval, fmtNum, rampColor, SUN, TINT } from "../../components/relief/reliefMath";
import { cx } from "../../components/ui";
import { G5, zoneName } from "../../lib/glossary";
import { ApiError, useEarthPool, useMarsRelief, useRelief } from "../../services/api";
import { useApp } from "../../store/app";
import { searchTarget } from "../../store/searchTarget";
import type { AnalogSearch, Relief } from "../../types/contracts";
import { fmtLat, fmtLon, type ReportCandidate } from "./model";
import { recordDigits } from "../comparison/model";
import { DISPLAY } from "./parts";
import { splitDesignation } from "./typeset";

/**
 * Plate C of the Location plates: a still of the Earth research window's terrain relief, rendered once from the
 * window's own relief payload (`GET /api/earth/pool/{window_id}/relief`, fetched by the window's exact research-pool
 * id) with `renderReliefSnapshot`, with the same furniture as the location plates: plate strip, bracketed frame,
 * caption with its basis. The grid is Earth as measured (Copernicus GLO-90 aggregated to the MOLA grid spacing; the
 * MOLA observation model is not applied); the caption says so, with source, cell size, grid and exaggeration.
 *
 * Printing uses a second still drawn for paper (white ground, dark linework), so no dark render background prints.
 * While the grid loads or the still renders the plate says so; it never shows a placeholder picture. A candidate
 * with no research-pool window (a screening cell) has no plate. Mars gets one line: no Mars grid is connected.
 */
export function ReliefSnapshotSlot({ search, candidate }: { search: AnalogSearch; candidate: ReportCandidate | null }) {
  const pool = useEarthPool();
  const id = reliefWindowId(candidate, pool.data);
  const earth = useRelief(id);
  const zone = searchTarget(search)?.siteId ?? null;
  const mars = useMarsRelief(id ? zone : null);
  if (!candidate || !id) return null;
  const marsWhy = mars.isError ? unavailableWords("mars", mars.error instanceof ApiError ? mars.error : { message: mars.error.message }).plain : null;
  return (
    <div className="mt-10 print:mt-7">
      <ReliefPlate plate="C" planet="earth" kicker="Earth · Terrain relief" name={candidate.label} q={earth} />
      {mars.data ? (
        <div className="mt-10 print:mt-7"><ReliefPlate plate="D" planet="mars" kicker="Mars · Terrain relief" name={zoneName(mars.data.id)} q={mars} /></div>
      ) : zone && (
        <p className="mt-3 flex items-baseline gap-2.5 text-caption text-faint">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] ring-1 ring-inset ring-mars" />
          <span><span className="kicker mr-2 !text-mars">Mars</span>{marsWhy ? `${marsWhy} No Mars relief plate is shown.` : "Checking for a Mars elevation grid."}</span>
        </p>
      )}
    </div>
  );
}

/** Vertical exaggeration of the still (the live view's default). */
const VE = 4;
/** Print still: a fixed paper figure, independent of the screen width. */
const PAPER = { width: 1000, height: 500, scale: 2 } as const;

type Stills = { status: "loading" } | { status: "ok"; screen: Snapshot; paper: Snapshot } | { status: "empty" } | { status: "failed" };

function ReliefPlate({ plate, planet, kicker, name, q }: { plate: string; planet: "earth" | "mars"; kicker: string; name: string; q: UseQueryResult<Relief> }) {
  const box = useRef<HTMLDivElement>(null);
  const width = useBucketWidth(box);
  // Wide pages: a 2:1 panorama; phones: 4:3, so the burned-in scale labels keep their size.
  const shape = width === null ? null : width < 600 ? { w: width, h: Math.round((width * 3) / 4) } : { w: width, h: Math.round(width / 2) };
  const relief = q.data ?? null;
  const [stills, setStills] = useState<Stills>({ status: "loading" });
  const planetName = planet === "mars" ? "Mars" : "Earth";

  useEffect(() => {
    if (!relief || !shape) { setStills({ status: "loading" }); return; }
    let live = true;
    setStills({ status: "loading" });
    (async () => {
      const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      const screen = await renderReliefSnapshot(relief, { planet, ve: VE, zoom: "fit", width: shape.w, height: shape.h, scale, caption: false });
      const paper = screen && await renderReliefSnapshot(relief, { planet, ve: VE, zoom: "fit", ...PAPER, caption: false, theme: "paper" });
      if (!live) return;
      setStills(screen && paper ? { status: "ok", screen, paper } : { status: "empty" });
      useApp.getState().announce(screen ? `${planetName} terrain relief plate ready` : `${planetName} terrain relief: no elevation to draw`);
    })().catch(() => { if (live) setStills({ status: "failed" }); });
    return () => { live = false; };
  }, [relief, shape?.w, shape?.h, planet, planetName]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = splitDesignation(name);
  const ok = stills.status === "ok" ? stills : null;
  const error = q.isError ? unavailableWords(planet, q.error instanceof ApiError ? q.error : { message: q.error.message }) : null;
  const state = error ? error.plain : !relief ? "Loading the elevation grid…" : stills.status === "loading" ? "Rendering the terrain relief…"
    : stills.status === "empty" ? "Every cell of this grid is empty; there is no surface to draw." : stills.status === "failed" ? "The relief still could not be rendered." : null;
  const busy = !error && (!relief || stills.status === "loading");
  const contour = relief && relief.z_min !== null && relief.z_max !== null ? contourInterval(relief.z_max - relief.z_min) : null;
  // The record's own precision (a named control is stored to 2 dp), as the plates and the header print it.
  const where = relief ? `${fmtLat(relief.lat, recordDigits(relief.lat, relief.lon))} ${fmtLon(relief.lon, recordDigits(relief.lat, relief.lon))}` : null;

  return (
    <figure className="m-0 min-w-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
        <span className="flex min-w-0 items-baseline gap-3">
          <span className="num shrink-0 text-num-sm text-ink">PLATE {plate}</span>
          <span className={cx("kicker truncate", planet === "mars" ? "!text-mars" : "!text-earth")}>{kicker}</span>
        </span>
        <span className="num hidden shrink-0 text-num-sm text-faint sm:inline">
          {ok ? (ok.screen.mode === "3d" ? `3D VIEW · V.E. ×${VE}` : "HILLSHADE · N UP") : `V.E. ×${VE}`}
        </span>
      </div>

      <div className="frame relative mt-3 p-3 [--frame-l:12px] sm:p-[22px]">
        <div ref={box} style={shape ? { aspectRatio: `${shape.w} / ${shape.h}` } : undefined}
          className="relative aspect-[2/1] w-full overflow-hidden bg-[#030405] ring-1 ring-ink/45 [print-color-adjust:exact] print:aspect-[2/1]! print:bg-white">
          {ok ? (
            <>
              {/* Screen still, cross-faded in (an opacity change, kept under reduced motion); the paper still prints. */}
              <motion.img src={ok.screen.dataUrl} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                alt={stillAlt(planetName, title.name, relief!, ok.screen.mode)} className="absolute inset-0 h-full w-full object-contain print:hidden" />
              <img src={ok.paper.dataUrl} alt="" aria-hidden className="absolute inset-0 hidden h-full w-full object-contain print:block" />
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center px-6 text-center" role={busy ? "status" : undefined}>
              <div>
                {where && <div className="num text-num-sm text-ink">{where}</div>}
                <div className={cx("mt-1 text-caption", busy ? "text-muted motion-safe:animate-pulse" : "text-faint")}>{state}</div>
                {error?.technical && <div className="num mt-1.5 text-[10.5px] text-faint">{error.technical}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phones: the elevation key wraps under the caption, which keeps the full width. */}
      <figcaption className="mt-1 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <div className={cx(DISPLAY, "flex flex-wrap items-baseline gap-x-2 text-[20px] leading-tight tracking-[0.04em] text-ink")}>
            <span>{title.name}</span>
            {title.detail && <span className="whitespace-nowrap text-[14px] font-medium tracking-[0.08em] text-muted"><span className="sr-only">, </span>{title.detail}</span>}
          </div>
          {relief && (
            <>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="num text-num text-muted">{where}</span>
                <span className="text-caption text-faint"><span className="num">{relief.window_km}</span> km research window</span>
              </div>
              <dl className="mt-2.5 max-w-[86ch] space-y-1 text-caption [&_button]:text-left">
                <div className="flex gap-3">
                  <dt className="kicker w-12 shrink-0 pt-px">Basis</dt>
                  <dd className="text-muted">
                    {relief.source.representation === "as_measured" && planet === "earth"
                      ? <>Earth terrain: {G5.toggleMeasured} — the <Term k="operator">MOLA observation model</Term> is not applied. </>
                      : planet === "mars" ? "Mars as measured. " : <>{G5.toggleOom}. </>}
                    {relief.source.title} · <GridFacts relief={relief} />
                    {relief.source.vertical_reference ? <> · heights: {relief.source.vertical_reference}</> : null}
                  </dd>
                </div>
                {/* The payload's own note, verbatim: what the surface is (a surface model includes vegetation and buildings). */}
                {relief.source.note && (
                  <div className="flex gap-3">
                    <dt className="kicker w-12 shrink-0 pt-px">Note</dt>
                    <dd className="text-faint">{relief.source.note}</dd>
                  </div>
                )}
                <div className="flex gap-3">
                  <dt className="kicker w-12 shrink-0 pt-px">Scale</dt>
                  <dd className="text-muted">
                    Vertical exaggeration <span className="num text-ink">×{VE}</span>
                    {contour && <> · contours <span className="num">{fmtNum(contour.interval)}</span> m, index <span className="num">{fmtNum(contour.index)}</span> m</>}
                    {" "}· km from the south-west corner · lit from <span className="num">{SUN.azDeg}°</span> at <span className="num">{SUN.altDeg}°</span>, a cartographic light, not the Sun
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>
        {relief && relief.z_min !== null && relief.z_max !== null && <Ramp planet={planet} min={relief.z_min} max={relief.z_max} noData={1 - relief.valid_fraction} />}
      </figcaption>
    </figure>
  );
}

/** Elevation key for the still: the hypsometric ramp between the grid's own lowest and highest cells. */
function Ramp({ planet, min, max, noData }: { planet: "earth" | "mars"; min: number; max: number; noData: number }) {
  const stops = [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${rampColor(t, TINT[planet]).map((v) => Math.round(Math.min(1, v * 0.89) * 255)).join(" ")}) ${t * 100}%`).join(", ");
  const unit = <span className="ml-[0.18em] font-sans text-[11px]">m</span>;
  return (
    <div className="shrink-0 pt-1">
      <div className="kicker !text-[10px]">Elevation</div>
      <div className="mt-1.5 h-2 w-40 border border-line-strong [print-color-adjust:exact]" style={{ backgroundImage: `linear-gradient(to right, ${stops})` }} aria-hidden />
      <div className="num mt-1 flex w-40 justify-between text-num-sm text-muted"><span>{fmtNum(min)}</span><span>{fmtNum(max)}{unit}</span></div>
      {noData > 0 && <div className="num mt-1 text-[10.5px] text-faint">No elevation {(100 * noData).toFixed(1)} % (open)</div>}
    </div>
  );
}

function stillAlt(planet: string, name: string, r: Relief, mode: "3d" | "2d") {
  const range = r.z_min !== null && r.z_max !== null ? `, elevation ${fmtNum(r.z_min)} to ${fmtNum(r.z_max)} m` : "";
  return `${mode === "3d" ? "3D terrain relief" : "Hillshade, north up,"} of ${name} (${planet}), ${r.rows} by ${r.cols} cells of ${r.cell_m.toFixed(0)} m${range}, vertical exaggeration ×${VE}.`;
}

/** Content width of `ref` in CSS px, in 40 px steps (a still is re-rendered only when the width really changes). */
function useBucketWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth;
      if (cw > 0) setW((prev) => (prev !== null && Math.abs(prev - cw) < 40 ? prev : cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
