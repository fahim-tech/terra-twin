/**
 * Typesetting helpers for the dossier: every numeral is set in the mono data face, words stay in the
 * text face, so figures line up in columns and read the same in tables, prose and print.
 */

export interface Segment { text: string; num: boolean }

/**
 * A number run: an optional sign or approximation mark directly before a digit, then digits with
 * thousands separators or a decimal point ("~0.6", "249,165", "−0.02", "3.71"). Unicode sub/superscripts
 * (CO₂, m/s²) are not digits and stay with their words.
 */
const NUMBER = /(?:[~≈±+−-](?=\d))?\d+(?:[.,]\d+)*/g;

/** Split text into alternating word and number runs; concatenating the runs gives the input back. */
export function splitNumerals(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(NUMBER)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), num: false });
    out.push({ text: m[0], num: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), num: false });
  return out;
}

/**
 * A designation for display: the name before the first " · " and the qualifier after it
 * ("Window 217 · roughness decile 8" → "Window 217" + "roughness decile 8"). Names without one stay whole.
 */
export function splitDesignation(label: string): { name: string; detail: string | null } {
  const i = label.indexOf(" · ");
  return i > 0 ? { name: label.slice(0, i), detail: label.slice(i + 3) } : { name: label, detail: null };
}

/** Two-digit index for numbered dossier items: 1 → "01". */
export function indexLabel(i: number): string {
  return String(i).padStart(2, "0");
}
