/**
 * Chart jargon on demand (MRR, MEGDR, AEQD, ρ, κ). The entries live in the shared glossary
 * (src/lib/glossary.ts) and the shared <Term> serves them — same hover / focus / tap behaviour, kept inside
 * the viewport, Greek terms set as written. This alias keeps the evidence charts' imports unchanged.
 */
export { Term as Gloss } from "../../components/primitives";
