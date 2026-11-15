import { G5 } from "../../lib/glossary";

/**
 * What the score shown beside a relief is computed on, for relief captions. A research window's S (tier 2) uses Earth
 * as MOLA would observe it (G5.toggleOom, quoted verbatim); a global-screen cell's S (tier 1) uses Earth as measured.
 * The relief itself is whatever its payload states (the research pool's grids are Earth as measured), so the caption
 * names the score's basis separately and never lets the relief stand for it.
 */
export function scoreBasisLine(tier: 1 | 2, score: "research" | "comparison"): string {
  if (tier === 1) return `The global screen's score uses Earth terrain ${G5.toggleMeasured}.`;
  return `The ${score === "comparison" ? "comparison's" : "research"} score uses “${G5.toggleOom}”.`;
}
