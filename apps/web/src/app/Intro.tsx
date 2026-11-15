import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

export function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-end bg-gradient-to-t from-space via-space/60 to-transparent md:bg-gradient-to-r md:from-space/85 md:via-space/30 md:items-center">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className="pointer-events-auto max-w-[460px] px-6 pb-10 md:px-14 md:pb-0">
        <div className="eyebrow mb-4 text-mars/80">AstroSUST · NASA Space Apps Challenge 2026</div>
        <h1 className="text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] md:text-[52px]">TerraTwin</h1>
        <p className="mt-3 text-[17px] font-light tracking-[-0.01em] text-ink/85">Two Worlds. Shared Terrain. New Discoveries.</p>
        <p className="mt-5 text-[13px] leading-relaxed text-muted md:text-[13.5px]">
          Select any place on Mars, measure its terrain, and search Earth's land surface for comparable ground. Each match is
          compared as NASA's MOLA altimeter would have observed it, and every result shows its evidence and where the analogy breaks down.
        </p>
        <div className="mt-7 flex items-center gap-4">
          <button onClick={onStart}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-mars px-5 py-2.5 text-[13.5px] font-semibold text-space transition-colors hover:bg-[#f29a7d]">
            Explore Mars <ArrowRight className="h-4 w-4" />
          </button>
          <span className="text-[11.5px] text-faint">Imagery: NASA Mars Trek · Viking MDIM 2.1</span>
        </div>
      </motion.div>
    </div>
  );
}
