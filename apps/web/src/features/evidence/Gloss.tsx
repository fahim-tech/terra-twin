import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Local term-on-demand for chart jargon that is not in the shared glossary (MRR, MEGDR, AEQD, ρ, κ).
 * Mirrors the shared <Term> behaviour and styling: hover, focus or tap opens; Escape or a click outside closes.
 * Definitions are taken from the research code (vendor/terratwin) and the dataset records, never invented.
 * Shared-file request: move these entries into src/lib/glossary.ts so <Term> can serve them.
 */
export const LOCAL_TERMS = {
  mrr: {
    label: "MRR",
    term: "Mean reciprocal rank",
    definition: "The average of 1 / rank of the true twin across all synthetic twins. 1 means the twin is always ranked first; 0.5 is what a steady second place would give.",
    source: "oom_analysis.py · MRR = mean(1 / rank)",
  },
  megdr: {
    label: "MEGDR",
    term: "MOLA Mission Experiment Gridded Data Record",
    definition: "The gridded MOLA elevation product (128 pixels per degree, about 463 m). Its counts layer records how many laser shots fell in each bin; bins with none are interpolated.",
    source: "MEGDR 128 ppd counts mask",
  },
  aeqd: {
    label: "AEQD",
    term: "Azimuthal equidistant projection",
    definition: "A map projection centred on the site, in which distances from the centre are true. Mars and Earth windows are both resampled onto it, so they share one grid.",
  },
  rho: {
    label: "ρ",
    term: "ρ (rho_ns) — along-track roughness ratio",
    definition: "RMS of north–south one-bin differences between two unobserved bins, divided by the same between two observed bins. Observed bins lie along north–south ground tracks; nearest-neighbour filling keeps ρ near 1.",
    source: "obsop.py · fidelity_stats",
  },
  kappa: {
    label: "κ",
    term: "κ (kap_ew) — cross-track curvature ratio",
    definition: "RMS of east–west second differences centred on unobserved bins, divided by the same centred on observed bins. Piecewise-linear filling drives κ towards 0.",
    source: "obsop.py · fidelity_stats",
  },
} as const;

export type LocalTermKey = keyof typeof LOCAL_TERMS;

export function Gloss({ k, children }: { k: LocalTermKey; children?: ReactNode }) {
  const g: { label: string; term: string; definition: string; source?: string } = LOCAL_TERMS[k];
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  // Keep the popover inside the viewport (16 px gutter): shift it left when the term sits near the right edge.
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const left = ref.current.getBoundingClientRect().left;
    const vw = document.documentElement.clientWidth;
    const w = Math.min(320, vw * 0.8);
    setShift(Math.min(0, vw - 16 - (left + w)));
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", esc, true); };
  }, [open]);
  return (
    <span ref={ref} className="relative inline" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-describedby={open ? id : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="cursor-help underline decoration-faint/60 decoration-dotted underline-offset-[3px] hover:decoration-ink">
        {children ?? g.label}
      </button>
      <AnimatePresence>
        {open && (
          <motion.span id={id} role="tooltip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.14 }} style={{ left: shift }}
            className="surface-solid absolute bottom-[calc(100%+8px)] left-0 z-50 block w-[min(320px,80vw)] rounded-[10px] p-3 text-left font-sans text-caption font-normal normal-case tracking-normal text-muted">
            <span className="mb-1 block text-label text-ink">{g.term}</span>
            {g.definition}
            {g.source ? <span className="mt-1.5 block font-mono text-[11px] text-faint">{g.source}</span> : null}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
