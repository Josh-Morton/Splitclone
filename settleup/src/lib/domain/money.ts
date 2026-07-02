/**
 * Money helpers — ZAR, integer cents everywhere.
 *
 * Formatting rules (design handoff "Currency format"): R prefix, space as the
 * thousands separator, comma as the decimal separator. e.g. R1 200,00 / -R63,50.
 * Ported from fmt()/fmtR()/parseCents() in the design prototype.
 */

import type { Cents } from "./types";

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** Format integer cents as ZAR with decimals: 120000 -> "R1 200,00". */
export function fmt(cents: Cents): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  const rand = Math.floor(v / 100);
  const c = v % 100;
  const rs = rand.toString().replace(THOUSANDS, " ");
  return (neg ? "-" : "") + "R" + rs + "," + String(c).padStart(2, "0");
}

/** Format integer cents as whole Rands (rounded, no decimals): 120050 -> "R1 201". */
export function fmtR(cents: Cents): string {
  const neg = cents < 0;
  const r = Math.round(Math.abs(cents) / 100);
  return (neg ? "-" : "") + "R" + r.toString().replace(THOUSANDS, " ");
}

/**
 * Parse loose user input into cents. Accepts "742", "R742.50", "1 200,50".
 * A comma is treated as the decimal separator (ZA convention). Returns 0 for
 * unparseable input.
 */
export function parseCents(str: string | null | undefined): Cents {
  if (str == null) return 0;
  const n = parseFloat(
    String(str)
      .replace(/[^0-9.,]/g, "")
      .replace(/\s/g, "")
      .replace(",", ".")
  );
  return isNaN(n) ? 0 : Math.round(n * 100);
}

/** Guard: money values must be non-negative integer cents. */
export function assertValidAmount(cents: Cents): void {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid money amount: ${cents} (must be non-negative integer cents)`);
  }
}
