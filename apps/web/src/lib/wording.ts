/**
 * Instrument wording for reasons the API writes in developer terms. The research record keeps some values only in
 * its research archive (Python pickle files the API never opens, an untrusted format); a reader needs to know the
 * value is stored but not read, not the file format. Everything else in the reason is kept as written.
 */
const ARCHIVE_RULES: [RegExp, string][] = [
  [/\bresearch pickles?, which (?:are|is) (?:not|never) loaded(?: \(untrusted format\))?/gi, "research archive, which this instrument does not read"],
  [/\bresearch pickles?\b/gi, "research archive"],
  [/\bpickles?\b/gi, "archive files"],
];

/** A reason from the API in instrument wording ("research pickles" → "research archive"); null stays null. */
export function instrumentWords(text: string): string;
export function instrumentWords(text: string | null | undefined): string | null;
export function instrumentWords(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  return ARCHIVE_RULES.reduce((s, [re, to]) => s.replace(re, to), text);
}
