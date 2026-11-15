/**
 * Which dossier section the reader is in: the last section whose top has passed the reading line, or the
 * last section once the page is scrolled to its end (short closing sections never reach the line).
 * `tops` are section tops relative to the scroll viewport, in document order.
 */
export function pickActive(tops: number[], readingLine: number, atEnd: boolean): number {
  if (!tops.length) return -1;
  if (atEnd) return tops.length - 1;
  let active = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] <= readingLine) active = i;
  return active;
}

/** The nearest ancestor that scrolls vertically (the shell's full-page host), or null. */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}
