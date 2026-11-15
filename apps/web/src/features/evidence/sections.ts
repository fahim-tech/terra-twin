/**
 * The brief's numbered sections, in reading order. The numbers are document structure (like a
 * mission brief's paragraph numbers), never data.
 */
export const SECTIONS = [
  { id: "ev-process", label: "Method" },
  { id: "ev-benchmark", label: "Benchmark" },
  { id: "ev-falsification", label: "Falsification" },
  { id: "ev-selection", label: "Operator choice" },
  { id: "ev-support", label: "Observation support" },
  { id: "ev-abstention", label: "Abstention" },
  { id: "ev-controls", label: "Controls" },
  { id: "ev-coverage", label: "Coverage" },
  { id: "ev-limitations", label: "Limitations" },
  { id: "ev-provenance", label: "Provenance" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((s) => s.id);

/** Two-digit section number: "01" … "10". */
export function sectionNo(id: SectionId): string {
  return String(SECTIONS.findIndex((s) => s.id === id) + 1).padStart(2, "0");
}

export function sectionLabel(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)?.label ?? id;
}
