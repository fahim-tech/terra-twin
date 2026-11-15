/**
 * Decimals to print a coordinate pair with: the precision the record carries (its shortest decimal form),
 * capped at `max`, so a named control stored as −24.09 never gains a padded zero ("24.090°").
 * One value for the pair, so latitude and longitude of one point read at the same precision.
 */
export function recordDigits(lat: number, lon: number, max = 3): number {
  const dp = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    const s = String(Math.abs(v));
    if (s.includes("e")) return max;
    const i = s.indexOf(".");
    return i < 0 ? 0 : s.length - i - 1;
  };
  return Math.min(max, Math.max(dp(lat), dp(lon)));
}
