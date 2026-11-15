import { X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconButton, Kicker, Measure, SPRING, Term, Toponym } from "../../components/primitives";
import { cx, pct } from "../../components/ui";
import { formatLat, formatLon } from "../../lib/geodesy";
import { G5 } from "../../lib/glossary";
import type { AnalogSearch } from "../../types/contracts";
import type { CandidateView } from "../analogs/candidates";
import { basisFor, earthName, verdictFor } from "./model";
import { applications } from "./RelevanceMode";
import { groupRows, type RatioRow } from "./science";

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * "Why this analog?" — an opaque dialog. Every block names the basis it rests on. Escape is handled
 * by the shell's closeTopmost(); this component traps focus and restores it on close.
 */
export function WhyDrawer({ search, c, rows, phone, onClose }: { search: AnalogSearch; c: CandidateView; rows: RatioRow[]; phone: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
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
    return () => { document.removeEventListener("keydown", onKey); if (prev && document.contains(prev)) prev.focus({ preventScroll: true }); };
  }, []);

  const v = verdictFor(search, c);
  const name = earthName(c);
  const g = groupRows(rows);
  const gate = c.t2?.landcover;
  const t1Basis = "Global-screen descriptors · 25 km · as measured";
  const off = phone ? { y: 24, x: 0 } : { x: 24, y: 0 };

  return (
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} data-occludes="earth"
      initial={{ ...off, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} exit={{ ...off, opacity: 0 }} transition={SPRING}
      className={cx("surface-solid no-print absolute z-40 flex flex-col overflow-hidden",
        phone ? "inset-x-0 bottom-0 top-12 rounded-t-surface" : "bottom-3 right-3 top-3 w-[min(440px,calc(100%-24px))] rounded-surface")}>
      <header className="relative shrink-0 px-6 pb-4 pt-5">
        <Kicker>Why this analog?</Kicker>
        <Toponym as="h2" size="sm" id={titleId} tabIndex={-1} style={{ outline: "none" }} className="mt-1.5 pr-10">{name.name}</Toponym>
        <p className="mt-1 text-caption text-muted">
          <span className="num text-num-sm">{formatLat(c.lat, 2)} {formatLon(c.lon, 2)}</span> · {c.tier === 2 ? `${c.t2?.window_km ?? 50} km research window` : "25 km screening cell"}
        </p>
        <IconButton label="Close" onClick={onClose} className="absolute right-3 top-3"><X className="h-4 w-4" /></IconButton>
      </header>

      <div className="scroll-thin fade-edges min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-1 text-body">
        <section className="rounded-control bg-surface/60 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label text-ink"><span aria-hidden>{v.glyph} </span>{v.headline}</span>
            <span className="text-right"><span className="text-caption text-faint">S </span><Measure value={c.score} digits={3} className="text-title font-normal" /></span>
          </div>
          <p className="mt-1 text-caption text-muted">{v.detail}</p>
          <p className="mt-1 text-caption text-faint">{basisFor(c)}</p>
        </section>

        <Section title="Similar" basis={t1Basis}>
          {g.similar.length ? g.similar.map((r) => <Li key={r.key}><span className="text-ink">{r.label}</span> · {r.relation}</Li>) : <Li>No descriptor falls inside the research tolerance.</Li>}
        </Section>

        <Section title="Different" basis={gate?.available ? `${t1Basis}; surface cover from ESA WorldCover 2021` : t1Basis}>
          {g.different.length ? g.different.map((r) => <Li key={r.key}><span className="text-ink">{r.label}</span> · {r.relation}</Li>) : <Li>None outside the research tolerance.</Li>}
          {gate?.available && gate.gate === "fail" && <Li>Surface cover: {gate.reason}</Li>}
          {g.missing.map((r) => <Li key={r.key}>{r.label}: not comparable, a value is missing.</Li>)}
        </Section>

        <Section title="Processes" basis="not established">
          <Li>Terrain-shape similarity does not show that the same processes formed both surfaces. That needs geological evidence and expert review.</Li>
        </Section>

        <Section title="Applications" basis="to be verified">
          {applications(c).map((a) => <Li key={a.text}>{a.text} <span className="text-faint">Basis: {a.basis}.</span></Li>)}
        </Section>

        <Section title="Limits" basis="research record and method">
          <Li>{G5.scope}.</Li>
          {c.tier === 2 && <Li>{G5.validation}.</Li>}
          {c.tier === 2 && <Li>Chosen from a fixed {search.tier2.candidate_pool?.n_windows ?? 230}-window research sample, not a worldwide high-resolution search.</Li>}
          <Li>{G5.scale}.</Li>
        </Section>

        <Section title="Evidence" basis="data sources">
          <Li>Mars: USGS MOLA 463 m mosaic; MEGDR 128 ppd counts (observed fraction {pct(search.mars.observation_support?.observed_fraction ?? null, 0)}). See <Term k="operator" />.</Li>
          <Li>Earth: {c.tier === 2 ? "Copernicus GLO-90 window (463 m grid), ESA WorldCover 2021" : "GMTED2010 30″ global-screen cell"}.</Li>
          <Li>Method: {c.tier === 2 ? "observation-operator matching, research record" : "global screen"}; whether this site is a known analog is not assessed here.</Li>
        </Section>
      </div>
    </motion.div>
  );
}

function Section({ title, basis, children }: { title: string; basis: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-label text-ink">{title}<span className="text-caption font-normal text-faint">{basis}</span></h3>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}
function Li({ children }: { children: ReactNode }) {
  return <li className="relative pl-3.5 text-caption text-muted before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:rounded-full before:bg-faint">{children}</li>;
}
