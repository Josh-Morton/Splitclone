/**
 * Axis helpers for the Phase 20 charts (ADR-0021). Pure; cents in, labels out.
 */

/**
 * Round a maximum up to a clean axis value. Finer steps than the classic
 * 1/2/5 so the tallest mark fills most of the plot — with 1/2/2.5/5 a R28.8k
 * peak got a R50k axis and the chart used barely half its height.
 */
export function niceMax(cents: number): number {
  const rand = cents / 100;
  if (rand <= 0) return 10_000;
  const mag = Math.pow(10, Math.floor(Math.log10(rand)));
  for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * mag >= rand) return Math.round(step * mag * 100);
  }
  return Math.round(10 * mag * 100);
}

/** Compact axis label: R0, R850, R1,2k, R12k — ZA decimal comma, like fmt(). */
export function compactRand(cents: number): string {
  const r = Math.round(cents / 100);
  if (r < 1000) return `R${r}`;
  const k = r / 1000;
  return k < 10 ? `R${String(Math.round(k * 10) / 10).replace(".", ",")}k` : `R${Math.round(k)}k`;
}

/** SVG path for a column with a 4px rounded data-end and a square base. */
export function columnPath(x: number, yTop: number, w: number, h: number, r = 4): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${yTop + h}V${yTop + rr}Q${x},${yTop} ${x + rr},${yTop}H${x + w - rr}Q${x + w},${yTop} ${x + w},${yTop + rr}V${yTop + h}Z`;
}
