import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton, Measure, SPRING } from "../../components/primitives";
import { cx, pct } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { G5 } from "../../lib/glossary";
import type { AnalogSearch } from "../../types/contracts";
import { type CandidateView, researchWindowKm, screenCellKm } from "../analogs/candidates";
import { CompareTerm as Term } from "./CompareTerm";
import { useCompareStage, WHY_DRAWER_WIDTH_CSS, whyDrawerWidth } from "./layout";
import { NO_RING, PlanetLabel, SectionRule } from "./marks";
import { basisFor, earthName, notLoadedReasons, verdictFor } from "./model";
import { VerdictLine } from "./Readout";
import { applications } from "./RelevanceMode";
import { groupRows, type RatioRow, relationParts } from "./science";

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * "Why this analog?" — the pair's technical brief: an opaque, framed dialog in numbered sections, each
 * naming the basis it rests on. Escape is handled by the shell's closeTopmost(); this component traps
 * focus and restores it on close. Enters and leaves along the same edge (right on desktop, bottom on phones).
 */
export function WhyDrawer({ search, c, rows, phone, onClose }: { search: AnalogSearch; c: CandidateView; rows: RatioRow[]; phone: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const stageW = useCompareStage((s) => s.w);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // The strip drops its Why button while it shares the width with the drawer, so the element that had
      // focus may be gone (and the drawer can be opened from the Earth results). Return focus to the Why
      // trigger, back in the strip by now; else to what had focus; else to the stage heading.
      const trigger = document.querySelector<HTMLElement>("[data-why-trigger] button");
      const back = trigger ?? (prev && prev !== document.body && document.contains(prev) ? prev : document.querySelector<HTMLElement>('[data-stage-heading="compare"]'));
      back?.focus({ preventScroll: true });
    };
  }, []);

  const v = verdictFor(search, c);
  const name = earthName(c);
  const g = groupRows(rows);
  const gate = c.t2?.landcover;
  const cellKm = screenCellKm(search);
  const winKm = researchWindowKm(search, c.t2);
  const t1Basis = `Global-screen descriptors${cellKm !== null ? ` · ${cellKm} km` : ""} · as measured`;
  const reasons = notLoadedReasons(c);
  const off = phone ? { y: 24, x: 0 } : { x: 24, y: 0 };
  const footprint = c.tier === 2 ? (winKm !== null ? `${winKm} km research window` : "research window") : (cellKm !== null ? `${cellKm} km screening cell` : "screening cell");
  let n = 0;
  const next = () => ++n;

  return (
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
      initial={{ ...off, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} exit={{ ...off, opacity: 0 }} transition={SPRING}
      style={phone ? undefined : { width: stageW > 0 ? whyDrawerWidth(stageW) : WHY_DRAWER_WIDTH_CSS }}
      className={cx("surface-solid frame no-print absolute z-40 flex flex-col overflow-hidden",
        phone ? "inset-0 [padding-bottom:env(safe-area-inset-bottom)]" : "bottom-3 right-3 top-3 rounded-surface")}>
      <header className="relative shrink-0 border-b border-line px-5 pb-4 pt-3.5">
        <div className="flex items-center gap-2.5 pr-10">
          <span className="kicker !text-ink/80">Brief</span>
          <span aria-hidden className="h-px w-4 bg-line-strong" />
          <span className="kicker">Why this analog?</span>
        </div>
        <PlanetLabel planet="earth" role={c.tier === 2 ? "Research window" : "Screening cell"} className="mt-4" />
        <h2 id={titleId} tabIndex={-1} style={NO_RING} className="toponym mt-2 pr-10 text-[22px] leading-[1.04] tracking-[0.04em] text-ink">{name.name}</h2>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-caption text-muted">
          <span className="num text-num-sm text-ink/90">{formatLat(c.lat, 2)}&ensp;{formatLon(c.lon, 2)}</span>
          <span aria-hidden className="text-faint">·</span>
          <span>{footprint}</span>
        </p>
        {name.sub && <p className="mt-1 text-caption text-faint">{name.sub}</p>}
        <IconButton label="Close" onClick={onClose} className="absolute right-2 top-2"><X className="h-4 w-4" strokeWidth={1.75} /></IconButton>
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-10 pt-5 text-body [mask-image:linear-gradient(to_bottom,transparent_0,black_14px,black_calc(100%-36px),transparent_100%)]">
        <Section index={next()} title="Decision" basis="research record">
          <div className="border border-line-strong bg-space/50">
            <div className="flex items-center justify-between gap-4 border-b border-line px-3.5 py-2.5">
              <VerdictLine verdict={v} />
              <span className="flex items-baseline gap-2"><span className="text-caption text-faint">S</span><Measure value={c.score} digits={3} className="text-[22px] leading-none" missing="no score" /></span>
            </div>
            <div className="px-3.5 py-2.5">
              <p className="text-caption text-ink/90">{v.detail}</p>
              <dl className="mt-2 text-caption">
                <Pair term="Basis">{basisFor(c, search)}</Pair>
              </dl>
            </div>
          </div>
        </Section>

        <Section index={next()} title="What produced S" basis={c.tier === 2 ? "research descriptors" : "global-screen descriptors"}>
          {c.tier === 2 ? (
            <>
              <p className="text-label font-normal leading-relaxed text-ink">
                S comes from eight research descriptors on the {winKm !== null ? `${winKm} km ` : ""}research windows, and their values are not loaded here. The two lists
                below are global-screen context (seven descriptors{cellKm !== null ? `, ${cellKm} km cells` : ""}, Earth as measured), not what produced S.
              </p>
              <dl className="mt-2.5 text-caption">
                <Pair term="Not loaded"><span className="text-muted">{reasons.mars} {c.t2 && search.tier2.representation === "mars_observation_space" ? reasons.earthOom : ""}</span></Pair>
              </dl>
            </>
          ) : (
            <p className="text-label font-normal leading-relaxed text-ink">These seven global-screen descriptors are the ones the screening score above was computed from.</p>
          )}
        </Section>

        <Section index={next()} title="Similar in the global screen" basis={t1Basis}>
          {g.similar.length ? <Rows rows={g.similar} /> : <Note>No descriptor falls inside the research tolerance.</Note>}
        </Section>

        <Section index={next()} title="Different in the global screen" basis={gate?.available ? `${t1Basis}; surface cover from ESA WorldCover 2021` : t1Basis}>
          {g.different.length ? <Rows rows={g.different} /> : <Note>None outside the research tolerance.</Note>}
          {gate?.available && gate.gate === "fail" && <Note>Surface cover: {gate.reason}</Note>}
          {g.missing.map((r) => <Note key={r.key}>{r.label}: not comparable, a value is missing.</Note>)}
        </Section>

        <Section index={next()} title="Processes" basis="not established">
          <List><Li>Terrain-shape similarity does not show that the same processes formed both surfaces. That needs geological evidence and expert review.</Li></List>
        </Section>

        <Section index={next()} title="Applications" basis="to be verified">
          <List>{applications(c, search.tier2.landcover_gate).map((a) => <Li key={a.text}>{a.text} <span className="text-faint">Basis: {a.basis}.</span></Li>)}</List>
        </Section>

        <Section index={next()} title="Limits" basis="research record and method">
          <List>
            <Li>{G5.scope}.</Li>
            {c.tier === 2 && <Li>{G5.validation}.</Li>}
            {c.tier === 2 && <Li>Chosen from a fixed {search.tier2.candidate_pool ? `${search.tier2.candidate_pool.n_windows}-window ` : ""}research sample, not a worldwide high-resolution search.</Li>}
            <Li>{G5.scale}.</Li>
          </List>
        </Section>

        <Section index={next()} title="Evidence" basis="data sources">
          <dl className="space-y-2 text-caption">
            <Pair term="Mars">USGS MOLA 463 m mosaic; MEGDR 128 ppd counts (observed fraction <span className="num text-ink/90">{pct(search.mars.observation_support?.observed_fraction ?? null, 0)}</span>). See <Term k="operator" />.</Pair>
            <Pair term="Earth">{c.tier === 2 ? "Copernicus GLO-90 window (463 m grid), ESA WorldCover 2021" : "GMTED2010 30″ global-screen cell"}.</Pair>
            <Pair term="Method">{c.tier === 2 ? "observation-operator matching, research record" : "global screen"}; whether this site is a known analog is not assessed here.</Pair>
          </dl>
        </Section>
      </div>
    </motion.div>
  );
}

function Section({ index, title, basis, children }: { index: number; title: string; basis: string; children: ReactNode }) {
  return (
    <section>
      <SectionRule index={index} title={title} />
      <p className="mb-2.5 mt-1 text-caption text-faint">{basis}</p>
      {children}
    </section>
  );
}

/** Descriptor rows: name on the left, the relation as a mono figure and words on the right. */
function Rows({ rows }: { rows: RatioRow[] }) {
  return (
    <ul className="border-y border-line">
      {rows.map((r) => {
        const p = relationParts(r);
        return (
          <li key={r.key} className="flex items-baseline justify-between gap-4 border-t border-line/70 py-1.5 first:border-t-0">
            <span className="text-label text-ink">{r.label}</span>
            <span className="shrink-0 text-right text-caption">
              {p.figure && <span className="num mr-1.5 text-num text-ink">{p.figure}</span>}
              <span className="text-muted">{p.text}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Pair({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-3">
      <dt className="kicker pt-px">{term}</dt>
      <dd className="text-muted">{children}</dd>
    </div>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="space-y-1.5">{children}</ul>;
}
/** Square bullet: a 4 px outlined square, never a round dot. */
function Li({ children }: { children: ReactNode }) {
  return <li className="relative pl-4 text-caption text-muted before:absolute before:left-0 before:top-[0.55em] before:h-1 before:w-1 before:border before:border-faint">{children}</li>;
}
function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-caption text-muted">{children}</p>;
}
