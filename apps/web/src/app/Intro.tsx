import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { Kicker } from "../components/primitives";

/**
 * First screen. The shell slides the Mars frame right while this is open, so the planet sits beside the
 * copy. Clicking the planet dismisses the intro (it never selects a point).
 */
export function Intro({ onStart, onJezero }: { onStart: () => void; onJezero: () => void }) {
  const stagger = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay: 0.15 + i * 0.08 } });
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 z-10 flex w-full items-end bg-gradient-to-t from-space via-space/70 to-transparent md:w-[min(46vw,620px)] md:items-center md:bg-gradient-to-r md:from-space/95 md:via-space/70 md:to-transparent">
      <div className="pointer-events-auto w-full max-w-[520px] px-6 pb-10 md:px-14 md:pb-0">
        <motion.div {...stagger(0)}><Kicker tone="mars">AstroSUST · NASA Space Apps 2026</Kicker></motion.div>
        <motion.h1 {...stagger(1)} data-stage-heading="intro" className="toponym mt-4 text-[44px] leading-[1.02] tracking-[-0.02em] md:text-display">TerraTwin</motion.h1>
        <motion.p {...stagger(2)} className="toponym mt-2 text-toponym-sm italic text-ink/85">Two worlds. Shared terrain.</motion.p>
        <motion.p {...stagger(3)} className="mt-5 max-w-[440px] text-body text-muted md:text-lead">
          Explore 39 candidate landing zones on Mars, measure their terrain, and screen Earth's land for comparable ground.
          Research comparisons re-observe Earth the way NASA's MOLA altimeter saw Mars.
        </motion.p>
        <motion.div {...stagger(4)} className="mt-8 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onStart}
            className="hit inline-flex items-center gap-2 rounded-full bg-mars px-5 py-2.5 text-label font-semibold text-space transition-[filter,transform] hover:brightness-110 active:scale-[0.97]">
            Explore Mars <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={onJezero}
            className="hit inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-label text-ink shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)] transition-colors hover:bg-white/5">
            Start with Jezero
          </button>
        </motion.div>
        <motion.p {...stagger(5)} className="mt-6 text-caption text-faint">Imagery: NASA Mars Trek · Viking MDIM 2.1 (visualization only)</motion.p>
      </div>
    </div>
  );
}
