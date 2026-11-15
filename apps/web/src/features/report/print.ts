/**
 * Print stylesheet for the dossier: white paper, black hairlines, running heads in the page margins.
 *
 * index.css already swaps the colour tokens to the light print palette for the whole app; these rules are
 * scoped to the dossier (`.dossier`) and only tighten it into a document. Page margin boxes carry the
 * analysis id, so the id is reduced to safe characters before it is written into CSS.
 */

/** An analysis id as it may appear inside a CSS string: word characters, dot and dash only. */
export function cssSafeId(id: string): string {
  return id.replace(/[^\w.-]/g, "").slice(0, 48);
}

export function dossierPrintCss(analysisId: string): string {
  const id = cssSafeId(analysisId);
  const head = `font-family: Barlow, sans-serif; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #444;`;
  const mono = `font-family: "IBM Plex Mono", monospace; font-size: 7.5pt; color: #444;`;
  return `
@media print {
  @page {
    margin: 16mm 14mm 18mm;
    @top-left { content: "TerraTwin · Mission dossier"; ${head} }
    @top-right { content: "Analysis ${id}"; ${mono} }
    @bottom-left { content: "Candidate identification — not validation of a new analog"; ${head} letter-spacing: 0.04em; text-transform: none; font-weight: 500; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); ${mono} }
  }
  .dossier {
    --color-line: #000;
    --color-line-strong: #000;
    --color-surface: #fff;
    --color-elevated: #fff;
    color: #111;
  }
  .dossier .frame { --frame-c: #000; }
  .dossier .print-keep { break-inside: avoid; }
  .dossier h1, .dossier h2, .dossier h3 { break-after: avoid; }
  .dossier tr, .dossier li, .dossier img, .dossier figure { break-inside: avoid; }
  .dossier [data-stage-heading="report"] { font-size: 30pt !important; }
}`;
}
