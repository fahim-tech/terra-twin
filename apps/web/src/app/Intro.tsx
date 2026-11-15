import { motion } from "motion/react";
import { Fragment } from "react";
import { cx } from "../components/ui";
import { useDatasets, useEarthPool, useSites } from "../services/api";
import { firstInt, type Readout, readoutGroups } from "./introStats";

/**
 * First screen. While it is open the shell moves the Mars frame so the planet sits beside the copy
 * (landscape, from 768 px) or above it (portrait and phones); see INTRO_POSE in App.tsx. Clicking the
 * planet dismisses the intro (it never selects a point). Every figure in the telemetry block comes from
 * the API; a figure that has not loaded shows a dash.
 *
 * Landscape: the text column stops short of the planet's limb. The planet's radius is about 0.222 of the
 * frame's larger side (the intro camera), its centre is shifted 20vw (md–lg) or 16vw (xl+) right, so its
 * left limb sits near 47.8vw / 43.8vw; the column's max width leaves 32 px to it.
 */
export function Intro({ onStart, onJezero }: { onStart: () => void; onJezero: () => void }) {
  const sites = useSites();
  const pool = useEarthPool();
  const datasets = useDatasets();
  const groups = readoutGroups({
    zones: sites.data ? sites.data.length : null,
    cells: firstInt(datasets.data?.datasets.find((d) => d.id === "earth_global_screen")?.coverage, /([\d,]+)\s+land cells/),
    windows: pool.data ? pool.data.length : null,
    gridM: firstInt(datasets.data?.datasets.find((d) => d.id === "mars_ez_tier1")?.native_resolution, /(\d+)\s*m MOLA/),
  });
  const rise = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const, delay: 0.1 + i * 0.07 } });
  return (
    <div className={cx("scroll-thin pointer-events-none absolute inset-0 z-10 flex flex-col overflow-y-auto",
      "landscape:md:right-auto landscape:md:w-[min(54vw,720px)] landscape:2xl:w-[min(50vw,900px)]")}>
      {/* Landscape: one eased fall-off into space beside the planet (no stacked layer, so no bands at the stops). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden landscape:md:block"
        style={{ backgroundImage: "linear-gradient(to right, rgb(2 3 4 / 0.97) 0%, rgb(2 3 4 / 0.94) 32%, rgb(2 3 4 / 0.84) 47%, rgb(2 3 4 / 0.66) 60%, rgb(2 3 4 / 0.44) 72%, rgb(2 3 4 / 0.24) 82%, rgb(2 3 4 / 0.09) 91%, rgb(2 3 4 / 0) 100%)" }} />
      {/* Portrait: the copy starts just under the raised planet (its lower limb ends near 48 % of the frame on
          phones, 52 % from 768 px); when the copy is taller than the room left, this spacer gives way and the
          copy sits on the bottom edge, over the dimmed limb. */}
      <div aria-hidden className="shrink basis-[46%] md:basis-[50%] landscape:hidden" />
      {/* Landscape: the column ends 32 px short of the limb (no right padding, so its box never covers the planet). */}
      <div className={cx("pointer-events-auto relative isolate w-full shrink-0 px-6 pb-8 pt-10 sm:px-10 sm:pb-12 landscape:mt-auto",
        "landscape:md:my-auto landscape:md:max-w-[min(560px,calc(47.8vw_-_32px))] landscape:md:pl-14 landscape:md:pr-0 landscape:md:py-10",
        "landscape:xl:max-w-[min(560px,calc(43.8vw_-_32px))] landscape:2xl:ml-[5vw] landscape:2xl:max-w-[min(560px,calc(38.8vw_-_32px))]")}>
        {/* Portrait and phones: the planet stands above the copy. This fall-off starts just above the kicker, so
            the limb behind the title dims and the paragraph, figures and actions sit on solid space. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 -z-10 landscape:md:hidden"
          style={{ backgroundImage: "linear-gradient(to bottom, rgb(2 3 4 / 0) 0, rgb(2 3 4 / 0.55) 110px, rgb(2 3 4 / 0.86) 210px, rgb(2 3 4 / 0.97) 300px, rgb(2 3 4) 360px)" }} />
        {/* Kicker and subtitle carry a halo: on phones they can sit over the planet's dimmed limb. */}
        <motion.div {...rise(0)} className="flex items-center gap-3">
          <span aria-hidden className="h-1.5 w-1.5 bg-mars" />
          <span className="kicker on-imagery text-muted">AstroSUST · NASA Space Apps 2026</span>
        </motion.div>
        <motion.h1 {...rise(1)} data-stage-heading="intro"
          className={cx("mt-4 font-[family-name:var(--font-display)] text-[52px] font-semibold uppercase leading-[0.9] tracking-[0.06em] outline-none sm:text-[72px]",
            "portrait:md:text-[84px] landscape:md:mt-5 landscape:md:text-[clamp(64px,5.8vw,104px)]")}>
          TerraTwin
        </motion.h1>
        <motion.p {...rise(2)} className="label-caps on-imagery mt-3 tracking-[0.32em] text-muted max-xs:tracking-[0.18em] landscape:md:mt-4">Mars–Earth terrain analog system</motion.p>
        <motion.p {...rise(3)} className="mt-5 max-w-[460px] text-body text-muted sm:text-lead landscape:md:mt-6">
          Survey candidate landing zones on Mars, measure their terrain, and screen Earth&rsquo;s land for comparable ground.
          Research comparisons re-observe Earth the way NASA&rsquo;s MOLA altimeter saw Mars.
        </motion.p>

        <motion.div {...rise(4)} className="mt-7 flex max-w-[520px] flex-wrap gap-x-8 gap-y-4 landscape:md:mt-8">
          {groups.map((g) => (
            <div key={g.planet} role="group" aria-label={`${g.name} figures`} className="min-w-0 grow">
              <div aria-hidden className="kicker rule-after gap-2 text-[10px]">
                <span className={cx("h-1.5 w-1.5 shrink-0", g.planet === "mars" ? "bg-mars" : "bg-earth")} />
                <span className="text-muted">{g.name}</span>
              </div>
              <dl className="mt-2.5 flex gap-7">
                {g.items.map((r) => <ReadoutCell key={r.label} r={r} />)}
              </dl>
            </div>
          ))}
        </motion.div>

        <motion.div {...rise(5)} className="mt-8 flex flex-col items-stretch gap-2 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center min-[480px]:gap-3">
          <button type="button" onClick={onStart}
            className="hit group inline-flex h-11 items-center justify-center gap-3 rounded-control bg-ink px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-space transition-colors duration-150 hover:bg-white active:bg-ink/80 active:duration-0">
            <span aria-hidden className="h-1.5 w-1.5 bg-mars" />
            Explore Mars
            <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </button>
          <button type="button" onClick={onJezero}
            className="hit inline-flex h-11 items-center justify-center rounded-control px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink ring-1 ring-inset ring-line-strong transition-colors duration-150 hover:bg-white/[0.06] hover:ring-ink/60 active:bg-white/[0.12] active:duration-0">
            Start with Jezero
          </button>
        </motion.div>
        <motion.p {...rise(6)} className="mt-6 text-caption text-faint landscape:md:mt-7">Imagery: NASA Mars Trek · Viking MDIM 2.1 (visualization only)</motion.p>
      </div>
    </div>
  );
}

/** One telemetry readout: short caps label over a mono value. The full label is the accessible term. */
function ReadoutCell({ r }: { r: Readout }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{r.term}</dt>
      <dd aria-hidden className="whitespace-nowrap text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-faint">{r.label}</dd>
      <dd className="num mt-2 whitespace-nowrap text-[22px] leading-none text-ink sm:text-[24px]">
        {r.value === null ? <span className="text-faint">—</span> : (
          <Fragment>
            {r.value.toLocaleString("en-US")}
            {r.unit && <span className="ml-1 font-sans text-[12px] text-muted">{r.unit}</span>}
          </Fragment>
        )}
      </dd>
    </div>
  );
}
