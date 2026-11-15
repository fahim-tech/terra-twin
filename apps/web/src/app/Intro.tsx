import { motion } from "motion/react";
import { cx } from "../components/ui";
import { formatLat, formatLon } from "../lib/geodesy";
import { useApiReachable, useDatasets, useEarthPool, useEvidence, useHealth, useMissions, useResearchSummary, useSites } from "../services/api";
import { useDiscoveryRun, useDiscoveryRuns, useGisStatus } from "../services/gis";
import { pickCachedRun } from "../features/analogs/discoveryModel";
import { placeNear } from "../lib/places";
import { useGlobes } from "../store/globes";
import { gisSummary } from "./gisStatus";
import { useImageryCredit } from "./globeSources";
import { firstInt, type Readout, readoutGroups, storyLines } from "./introStats";

/** The intro light is a presentation light (globe-entry.ts setLight "intro"): say so wherever the terminator shows. */
const LIGHT_NOTE = "Presentation light · not solar";

/**
 * First screen: a mission briefing console beside Mars. While it is open the shell moves the Mars frame so
 * the planet sits beside the console (landscape, from 768 px) or above it (portrait and phones); see INTRO_POSE
 * in App.tsx. Clicking the planet dismisses the intro (it never selects a point).
 *
 * Every figure comes from the API (system and GIS status, sites, research pool, dataset records) and names
 * the record it was read from; a figure that has not loaded shows a dash. The imagery credit is what the
 * Mars globe reports it draws. The lighting is a presentation light, and the console and the planet HUD say so.
 *
 * Landscape: the column stops short of the planet's limb. The planet's radius is about 0.222 of the frame's
 * larger side (the intro camera), its centre is shifted 20vw (md–lg) or 16vw (xl+) right, so its left limb
 * sits near 47.8vw / 43.8vw; the column's max width leaves 32 px to it. Short landscape windows (phones held
 * sideways) get a compact console whose commands sit in the first screen.
 */
export function Intro({ onStart, onJezero }: { onStart: () => void; onJezero: () => void }) {
  const sites = useSites();
  const pool = useEarthPool();
  const datasets = useDatasets();
  const health = useHealth();
  const gisQ = useGisStatus();
  const gis = gisSummary(gisQ.data, gisQ.isError);
  const credit = useImageryCredit("mars").full;
  const ds = (id: string) => datasets.data?.datasets.find((d) => d.id === id);
  const groups = readoutGroups({
    zones: sites.data ? sites.data.length : null,
    cells: firstInt(ds("earth_global_screen")?.coverage, /([\d,]+)\s+land cells/),
    windows: pool.data ? pool.data.length : null,
    gridM: firstInt(ds("mars_ez_tier1")?.native_resolution, /(\d+)\s*m MOLA/),
  });
  const jezero = sites.data?.find((s) => s.id === "Jezero") ?? null;
  const summary = useResearchSummary();
  const evidence = useEvidence();
  const mrr = (m: string) => {
    const rows = (evidence.data as { synthetic_benchmark?: { mrr_ci?: { method: string; MRR: number }[] } } | undefined)?.synthetic_benchmark?.mrr_ci;
    return rows?.find((r) => r.method === m)?.MRR ?? null;
  };
  const top1 = (m: string) => (evidence.data as { synthetic_benchmark?: { twin?: Record<string, { top1?: number }> } } | undefined)?.synthetic_benchmark?.twin?.[m]?.top1 ?? null;
  // Newest cached whole-Earth discovery run for Jezero under the default mission (no new server run).
  const runs = useDiscoveryRuns();
  const missions = useMissions();
  const landing = missions.data?.find((m) => m.id === "landing_site")?.research_key ?? null;
  const cached = jezero && runs.data ? pickCachedRun(runs.data, { lat: jezero.lat, lon: jezero.lon, siteId: "Jezero", centre: jezero }, landing) : null;
  const liveRun = useDiscoveryRun(cached?.run_id ?? null);
  const story = storyLines({
    jezeroObserved: jezero?.observed_fraction ?? null,
    cells: firstInt(ds("earth_global_screen")?.coverage, /([\d,]+)\s+land cells/),
    finding: summary.data?.find((s) => s.site === "Jezero")?.exclude ?? null,
    mrr: { baseline: mrr("M0_baseline"), oom: mrr("M2_OOM") },
    top1: { baseline: top1("M0_baseline"), oom: top1("M2_OOM") },
    nTwins: (evidence.data as { synthetic_benchmark?: { mrr_ci?: { n_targets?: number }[] } } | undefined)?.synthetic_benchmark?.mrr_ci?.[0]?.n_targets ?? null,
    discovery: liveRun.data?.refinement ? {
      type: liveRun.data.refinement.decision.type, refined: liveRun.data.refinement.number_of_windows_refined,
      members: liveRun.data.refinement.candidates.filter((c) => liveRun.data!.refinement!.decision.members.includes(c.id))
        .map((c) => ({ lat: c.lat, lon: c.lon, S: c.S, place: placeNear(c.lat, c.lon)?.text ?? null })),
    } : null,
  });
  const rise = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay: 0.08 + i * 0.06 } });

  const reach = useApiReachable();
  const api = reach.state === "down" ? { tone: "bad" as const, text: "API unreachable · retrying" }
    : health.data ? { tone: health.data.research_data ? "ok" as const : "warn" as const, text: `API ${(health.data as { api_version?: string }).api_version ?? "—"} · ${health.data.research_data ? "research data verified" : "research data missing"}` }
      : { tone: "idle" as const, text: "Checking API…" };
  const gisLine = gis.state === "unknown" ? { tone: "idle" as const, text: "Checking GIS…" }
    : gis.state === "off" ? { tone: "warn" as const, text: `GIS not connected${gis.reason ? ` · ${gis.reason}` : ""}` }
      : {
        tone: "ok" as const,
        text: `${gis.gridKm !== null ? `${gis.gridKm} km` : "—"} grids ${gis.grids.length ? gis.grids.map((p) => (p === "mars" ? "Mars" : "Earth")).join(" + ") : "none"} · discovery ${gis.discovery === "available" ? "available" : gis.discovery === "busy" ? "busy" : "off"}${gis.activeRuns !== null && gis.maxRuns !== null ? ` (${gis.activeRuns}/${gis.maxRuns} runs)` : ""}`,
      };

  return (
    <>
    <div className={cx("scroll-thin pointer-events-none absolute inset-0 z-10 flex flex-col overflow-y-auto",
      "landscape:md:right-auto landscape:md:w-[min(56vw,760px)] landscape:2xl:w-[min(52vw,1000px)]")}>
      {/* Landscape: one eased fall-off into space beside the planet (no stacked layer, so no bands at the stops). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden landscape:md:block"
        style={{ backgroundImage: "linear-gradient(to right, rgb(2 3 4 / 0.97) 0%, rgb(2 3 4 / 0.94) 32%, rgb(2 3 4 / 0.84) 47%, rgb(2 3 4 / 0.66) 60%, rgb(2 3 4 / 0.44) 72%, rgb(2 3 4 / 0.24) 82%, rgb(2 3 4 / 0.09) 91%, rgb(2 3 4 / 0) 100%)" }} />
      {/* Portrait: the console starts just under the raised planet (its lower limb ends near 48 % of the frame on
          phones, 52 % from 768 px); when the console is taller than the room left, this spacer gives way. */}
      <div aria-hidden className="shrink basis-[46%] md:basis-[50%] landscape:hidden" />
      <div className={cx("chrome-scale pointer-events-auto relative isolate w-full shrink-0 px-6 pb-8 pt-10 sm:px-10 sm:pb-12 landscape:mt-auto",
        "landscape:md:my-auto landscape:md:max-w-[min(580px,calc(47.8vw_-_32px))] landscape:md:pl-14 landscape:md:pr-0 landscape:md:py-10",
        "landscape:xl:max-w-[min(580px,calc(43.8vw_-_32px))] landscape:2xl:ml-[4vw] landscape:2xl:max-w-[min(600px,calc(39.8vw_-_32px))]",
        "short:!my-0 short:!py-4 short:!pl-6")}>
        {/* Portrait tablets: the fall-off starts just above the kicker, so the limb behind the title dims. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 -z-10 hidden md:block landscape:md:hidden"
          style={{ backgroundImage: "linear-gradient(to bottom, rgb(2 3 4 / 0) 0, rgb(2 3 4 / 0.55) 110px, rgb(2 3 4 / 0.86) 210px, rgb(2 3 4 / 0.97) 300px, rgb(2 3 4) 360px)" }} />
        {/* Phones: the console rises over the planet's southern half; the fall-off is mostly dark by the kicker. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 -z-10 md:hidden"
          style={{ backgroundImage: "linear-gradient(to bottom, rgb(2 3 4 / 0) 0, rgb(2 3 4 / 0.5) 56px, rgb(2 3 4 / 0.78) 104px, rgb(2 3 4 / 0.88) 160px, rgb(2 3 4 / 0.95) 240px, rgb(2 3 4) 330px)" }} />

        <motion.div {...rise(0)} className="flex items-center gap-3">
          <span aria-hidden className="h-1.5 w-1.5 bg-mars" />
          <span className="kicker on-imagery whitespace-nowrap text-muted">Mission briefing</span>
          <span aria-hidden className="h-px w-6 bg-line-strong max-sm:hidden short:hidden" />
          <span className="kicker on-imagery whitespace-nowrap text-faint max-sm:hidden short:hidden">AstroSUST · NASA Space Apps 2026</span>
        </motion.div>
        <motion.h1 {...rise(1)} data-stage-heading="intro"
          className={cx("mt-4 font-[family-name:var(--font-display)] text-[52px] font-semibold uppercase leading-[0.9] tracking-[0.06em] outline-none sm:text-[72px]",
            "portrait:md:text-[84px] landscape:md:mt-5 landscape:md:text-[clamp(64px,5.8vw,104px)] short:!mt-2 short:!text-[44px]")}>
          TerraTwin
        </motion.h1>
        <motion.p {...rise(2)} className="label-caps on-imagery mt-3 whitespace-nowrap tracking-[0.3em] text-muted max-sm:tracking-[0.18em] max-xs:tracking-[0.12em] landscape:md:mt-4 short:!mt-2 short:!tracking-[0.18em]">
          Mars–Earth terrain analog system
        </motion.p>
        {/* Problem → method → finding, every figure read from the API. */}
        <motion.dl {...rise(3)} aria-label="What TerraTwin does" className="mt-5 max-w-[540px] space-y-2 landscape:md:mt-6 short:hidden">
          {([["Problem", story.problem], ["Method", story.method], ["Finding", story.discovery ?? story.finding], ["Pool", story.discovery ? story.finding : null]] as const).map(([k, v]) => v && (
            <div key={k} className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3">
              <dt className={cx("kicker pt-[3px] text-[10px]", k === "Finding" ? "text-mars" : "text-faint")}>{k}</dt>
              <dd className={cx("leading-[1.5]", k === "Finding" ? "text-[13.5px] text-ink" : "text-caption text-muted")}>
                {v}
                {k === "Finding" && jezero && (
                  <button type="button" onClick={onJezero} className="ml-1.5 underline decoration-faint/60 underline-offset-[3px] hover:text-mars">Open it →</button>
                )}
              </dd>
            </div>
          ))}
          <p className="pl-[84px] text-caption text-faint">{story.caveat}</p>
        </motion.dl>

        {/* Short landscape: commands come first, in the first screen. */}
        <motion.div {...rise(4)} className="hidden short:mt-4 short:block">
          <Commands onStart={onStart} onJezero={onJezero} jezero={jezero} />
        </motion.div>

        <motion.div {...rise(6)} className="mt-6 short:hidden">
          <Commands onStart={onStart} onJezero={onJezero} jezero={jezero} />
        </motion.div>
        {/* Systems: live API and GIS status, read from /api/health and /api/gis/status. */}
        <motion.section {...rise(4)} aria-label="Systems" className="mt-7 max-w-[540px] max-sm:hidden landscape:md:mt-8 short:hidden">
          <h2 className="kicker rule-after text-[10px] text-faint">Systems</h2>
          <dl className="mt-1.5">
            <StatusRow label="Research API" tone={api.tone} text={api.text} />
            <StatusRow label="GIS data" tone={gisLine.tone} text={gisLine.text} />
          </dl>
        </motion.section>

        {/* Telemetry: each figure with the record it was read from. */}
        <motion.section {...rise(5)} aria-label="Datasets" className="mt-5 max-w-[540px] short:mt-4 short:max-w-none">
          <h2 className="kicker rule-after text-[10px] text-faint short:hidden"><span>Datasets</span></h2>
          <div className="mt-1.5 short:hidden">
            {groups.map((g) => (
              <dl key={g.planet} aria-label={`${g.name} figures`} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-baseline border-b border-line last:border-b-0 max-xs:grid-cols-[48px_minmax(0,1fr)_auto]">
                <div aria-hidden className="row-span-2 flex items-center gap-2 self-start pt-2.5">
                  <span className={cx("h-1.5 w-1.5 shrink-0", g.planet === "mars" ? "bg-mars" : "bg-earth")} />
                  <span className={cx("kicker text-[10px]", g.planet === "mars" ? "text-mars" : "text-earth")}>{g.name}</span>
                </div>
                {g.items.map((r) => <TelemetryRow key={r.label} r={r} />)}
              </dl>
            ))}
          </div>
          {/* Short landscape: one compact line of the same figures. */}
          <dl className="hidden flex-wrap gap-x-6 gap-y-2 short:flex">
            {groups.flatMap((g) => g.items).map((r) => (
              <div key={r.label} className="flex items-baseline gap-2">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint"><span aria-hidden>{r.label}</span><span className="sr-only">{r.term}</span></dt>
                <dd className="num text-[15px] text-ink">{r.value === null ? <span className="text-faint">—</span> : <>{r.value.toLocaleString("en-US")}{r.unit && <span className="ml-0.5 font-sans text-[11px] text-muted">{r.unit}</span>}</>}</dd>
              </div>
            ))}
          </dl>
        </motion.section>

        <motion.div {...rise(7)} className="mt-6 max-w-[560px] space-y-1 text-caption text-faint landscape:md:mt-7 short:!mt-3">
          <p><span className="kicker mr-2 text-[10px]">Light</span><span className="text-warn/90">{LIGHT_NOTE}</span>: lit for legibility, not by the Sun&rsquo;s position</p>
          <p><span className="kicker mr-2 text-[10px]">Imagery</span>{credit ?? "—"}</p>
        </motion.div>
      </div>
    </div>
    <PlanetHud />
    </>
  );
}

/** The two commands: one primary (Explore Mars) and a console-style row that starts with Jezero (coordinates from /api/mars/sites). */
function Commands({ onStart, onJezero, jezero }: { onStart: () => void; onJezero: () => void; jezero: { lat: number; lon: number } | null }) {
  return (
    <div className="flex flex-col items-stretch gap-2 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center min-[480px]:gap-3">
      <button type="button" onClick={onStart}
        className="hit group inline-flex h-11 items-center justify-center gap-3 rounded-control bg-ink px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-space transition-colors duration-150 hover:bg-white active:bg-ink/80 active:duration-0">
        <span aria-hidden className="h-1.5 w-1.5 bg-mars" />
        Explore Mars
        <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
      </button>
      <button type="button" onClick={onJezero}
        className="hit inline-flex h-11 items-center justify-center gap-3 rounded-control px-4 text-ink ring-1 ring-inset ring-line-strong transition-colors duration-150 hover:bg-white/[0.06] hover:ring-ink/60 active:bg-white/[0.12] active:duration-0">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em]">Start with Jezero</span>
        {jezero && <span className="num text-num-sm text-faint max-[420px]:hidden landscape:max-xl:hidden">{formatLat(jezero.lat, 2)} {formatLon(jezero.lon, 2)}</span>}
      </button>
    </div>
  );
}

function StatusRow({ label, tone, text }: { label: string; tone: "ok" | "warn" | "bad" | "idle"; text: string }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <dt className="w-[92px] shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="flex min-w-0 items-baseline gap-2 text-caption text-muted">
        <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 translate-y-[-1px]",
          tone === "ok" ? "bg-ink" : tone === "warn" ? "ring-1 ring-inset ring-warn" : tone === "bad" ? "bg-bad" : "ring-1 ring-inset ring-faint")} />
        <span className={cx("min-w-0", tone === "warn" && "text-warn", tone === "bad" && "text-bad")}>{text}</span>
      </dd>
    </div>
  );
}

/** One telemetry row: caps label, mono value, and the payload it came from. The full label is the accessible term. */
function TelemetryRow({ r }: { r: Readout }) {
  return (
    <>
      <dt className="col-start-2 truncate pt-2.5 text-[10.5px] font-semibold uppercase leading-none tracking-[0.14em] text-muted [&:nth-of-type(n+2)]:pt-1.5">
        <span aria-hidden>{r.label}</span><span className="sr-only">{r.term}</span>
        <span aria-hidden className="ml-2 font-mono text-[10px] normal-case tracking-normal text-faint max-sm:hidden">{r.source}</span>
      </dt>
      <dd className="col-start-3 whitespace-nowrap pb-1 pt-1.5 text-right">
        {r.value === null ? <span className="num text-[22px] leading-none text-faint">—</span> : (
          <span className="num text-[22px] leading-none text-ink sm:text-[24px]">
            {r.value.toLocaleString("en-US")}
            {r.unit && <span className="ml-1 font-sans text-[12px] text-muted">{r.unit}</span>}
          </span>
        )}
      </dd>
    </>
  );
}

/**
 * Planet HUD (landscape, from 1280 px): registration brackets around the disc, the presentation-light note at
 * the terminator, and the sub-observer point and camera altitude from the Mars camera telemetry (live as it spins).
 * Placed from the intro camera's geometry: radius 0.222 of the frame's larger side, centre 66 % across.
 */
function PlanetHud() {
  const cam = useGlobes((s) => s.camera.mars);
  const c = cam?.center ?? null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] hidden [container-type:size] landscape:xl:block short:!hidden">
      {/* --r: the disc radius; --cx/--cy: its centre in the stage. */}
      <div className="absolute inset-0 [--r:calc(0.222*max(100cqw,100cqh))] [--cx:66cqw] [--cy:50cqh]">
        <div className="frame absolute [--frame-c:rgb(242_244_245/0.35)] [--frame-l:14px]"
          style={{ left: "calc(var(--cx) - var(--r) - 20px)", top: "calc(var(--cy) - var(--r) - 20px)", width: "calc(2 * var(--r) + 40px)", height: "calc(2 * var(--r) + 40px)" }} />
        {/* Terminator note, lower right: a leader from the limb. */}
        <div className="absolute flex items-start gap-2" style={{ left: "calc(var(--cx) + 0.83 * var(--r))", top: "calc(var(--cy) + 0.56 * var(--r))" }}>
          <span className="mt-[7px] h-px w-8 bg-ink/40" />
          <span className="on-imagery whitespace-nowrap font-mono text-[10.5px] uppercase leading-[1.45] tracking-[0.08em]">
            <span className="block text-warn/90">Presentation light</span>
            <span className="block text-faint">Not solar</span>
          </span>
        </div>
        {/* Sub-observer point and range, under the disc. */}
        <div className="absolute flex -translate-x-1/2 items-baseline gap-4 whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint on-imagery"
          style={{ left: "var(--cx)", top: "calc(var(--cy) + var(--r) + 30px)" }}>
          <span>Sub-observer <span className="text-ink">{c ? `${formatLat(c.lat, 1)} ${formatLon(c.lon, 1)}` : "—"}</span></span>
          <span>Altitude <span className="text-ink">{cam ? <>{Math.round(cam.heightKm).toLocaleString("en-US")}<span className="ml-1 normal-case">km</span></> : "—"}</span></span>
        </div>
      </div>
    </div>
  );
}
