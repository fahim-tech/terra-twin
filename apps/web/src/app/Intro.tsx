import { motion } from "motion/react";
import { useDatasets, useEarthPool, useSites } from "../services/api";

/** First integer in a dataset description, e.g. "249,165 land cells" → 249165. Null when absent (never invented). */
function firstInt(text: string | null | undefined, re: RegExp): number | null {
  const m = text?.match(re);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/**
 * First screen. The shell slides the Mars frame right while this is open, so the planet sits beside the
 * copy. Clicking the planet dismisses the intro (it never selects a point). Every figure in the telemetry
 * block comes from the API; a figure that has not loaded shows a dash.
 */
export function Intro({ onStart, onJezero }: { onStart: () => void; onJezero: () => void }) {
  const sites = useSites();
  const pool = useEarthPool();
  const datasets = useDatasets();
  const screen = datasets.data?.datasets.find((d) => d.id === "earth_global_screen");
  const marsT1 = datasets.data?.datasets.find((d) => d.id === "mars_ez_tier1");
  const stats: { value: number | null; unit?: string; label: string }[] = [
    { value: sites.data ? sites.data.length : null, label: "Candidate landing zones on Mars" },
    { value: firstInt(screen?.coverage, /([\d,]+)\s+land cells/), label: "Earth land cells screened" },
    { value: pool.data ? pool.data.length : null, label: "Earth research windows" },
    { value: firstInt(marsT1?.native_resolution, /(\d+)\s*m MOLA/), unit: "m", label: "MOLA comparison grid" },
  ];
  const rise = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const, delay: 0.1 + i * 0.07 } });
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-full items-end bg-gradient-to-t from-space via-space/80 to-transparent md:w-[min(54vw,720px)] md:items-center md:bg-none 2xl:w-[min(50vw,900px)]">
      {/* One eased fall-off into space (no stacked layer, so no visible bands at the stop edges). */}
      <div aria-hidden className="absolute inset-0 -z-10 hidden md:block"
        style={{ backgroundImage: "linear-gradient(to right, rgb(2 3 4 / 0.97) 0%, rgb(2 3 4 / 0.94) 32%, rgb(2 3 4 / 0.84) 47%, rgb(2 3 4 / 0.66) 60%, rgb(2 3 4 / 0.44) 72%, rgb(2 3 4 / 0.24) 82%, rgb(2 3 4 / 0.09) 91%, rgb(2 3 4 / 0) 100%)" }} />
      <div className="pointer-events-auto w-full max-w-[560px] px-6 pb-10 md:px-14 md:pb-0 2xl:ml-[5vw]">
        <motion.div {...rise(0)} className="flex items-center gap-3">
          <span aria-hidden className="h-1.5 w-1.5 bg-mars" />
          <span className="kicker !text-muted">AstroSUST · NASA Space Apps 2026</span>
        </motion.div>
        <motion.h1 {...rise(1)} data-stage-heading="intro"
          className="mt-5 font-[family-name:var(--font-display)] text-[52px] font-semibold uppercase leading-[0.9] tracking-[0.06em] outline-none md:text-[84px] 2xl:text-[104px]">
          TerraTwin
        </motion.h1>
        <motion.p {...rise(2)} className="label-caps mt-4 !tracking-[0.32em] text-muted">Mars–Earth terrain analog system</motion.p>
        <motion.p {...rise(3)} className="mt-6 max-w-[460px] text-body text-muted md:text-lead">
          Survey candidate landing zones on Mars, measure their terrain, and screen Earth&rsquo;s land for comparable ground.
          Research comparisons re-observe Earth the way NASA&rsquo;s MOLA altimeter saw Mars.
        </motion.p>

        <motion.dl {...rise(4)} className="mt-8 grid max-w-[520px] grid-cols-2 border-y border-line sm:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className={i === 0 ? "py-3 pr-4" : i === 2 ? "py-3 pr-4 sm:border-l sm:border-line sm:pl-4" : "border-l border-line py-3 pl-4 pr-2"}>
              <dt className="sr-only">{s.label}</dt>
              <dd className="num text-[20px] leading-none text-ink md:text-[22px]">
                {s.value === null ? <span className="text-faint">—</span> : s.value.toLocaleString("en-US")}
                {s.value !== null && s.unit && <span className="ml-1 font-sans text-[12px] text-muted">{s.unit}</span>}
              </dd>
              <dd aria-hidden className="mt-2 text-[10.5px] font-semibold uppercase leading-[1.25] tracking-[0.12em] text-faint">{s.label}</dd>
            </div>
          ))}
        </motion.dl>

        <motion.div {...rise(5)} className="mt-8 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onStart}
            className="hit group inline-flex h-11 items-center gap-3 rounded-control bg-ink px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-space transition-colors duration-150 hover:bg-white active:bg-ink/80 active:duration-0">
            <span aria-hidden className="h-1.5 w-1.5 bg-mars" />
            Explore Mars
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>
          <button type="button" onClick={onJezero}
            className="hit inline-flex h-11 items-center rounded-control px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink ring-1 ring-inset ring-line-strong transition-colors duration-150 hover:bg-white/[0.06] hover:ring-ink/60 active:bg-white/[0.12] active:duration-0">
            Start with Jezero
          </button>
        </motion.div>
        <motion.p {...rise(6)} className="mt-7 text-caption text-faint">Imagery: NASA Mars Trek · Viking MDIM 2.1 (visualization only)</motion.p>
      </div>
    </div>
  );
}
