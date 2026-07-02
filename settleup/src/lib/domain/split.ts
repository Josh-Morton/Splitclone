/**
 * Split algorithms — the golden rule (scope doc §7): every split distributes the
 * exact total in integer cents, with no cent lost or invented. Remainders are
 * assigned deterministically (largest fractional part first, then input order).
 *
 * Ported from splitEqual()/splitWeighted()/computeSplit() in the design prototype.
 */

import type { Cents, ExpenseSplit, SplitMethod } from "./types";

export interface SplitOptions {
  /** memberId -> exact share in cents ("exact" method). */
  exact?: Record<string, Cents>;
  /** memberId -> percentage 0–100 ("percent" method). */
  pct?: Record<string, number>;
  /** memberId -> share weight ("shares" method). */
  shares?: Record<string, number>;
  /** memberId -> monthly salary in cents ("salary" method). */
  salaries?: Record<string, Cents>;
}

/**
 * Equal split with deterministic cent-remainder distribution: everyone gets
 * floor(total/n); the first `remainder` participants (input order) get +1c.
 */
export function splitEqual(totalCents: Cents, memberIds: string[]): ExpenseSplit[] {
  if (memberIds.length === 0) throw new Error("splitEqual: no participants");
  const n = memberIds.length;
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  return memberIds.map((memberId, i) => ({
    memberId,
    shareCents: base + (i < rem ? 1 : 0),
  }));
}

/**
 * Weighted split (largest-remainder / Hamilton method): shares are
 * floor(total * w / W) plus one extra cent to the largest fractional parts
 * until the total reconciles. Falls back to equal when all weights are <= 0.
 */
export function splitWeighted(
  totalCents: Cents,
  memberIds: string[],
  weights: number[]
): ExpenseSplit[] {
  if (memberIds.length === 0) throw new Error("splitWeighted: no participants");
  if (memberIds.length !== weights.length) {
    throw new Error("splitWeighted: weights must match participants");
  }
  const W = weights.reduce((a, b) => a + b, 0);
  if (W <= 0) return splitEqual(totalCents, memberIds);

  const exact = memberIds.map((_, i) => (totalCents * weights[i]) / W);
  const floors = exact.map((x) => Math.floor(x));
  const rem = totalCents - floors.reduce((a, b) => a + b, 0);
  // Assign leftover cents to the largest fractional parts first (stable order).
  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const shares = floors.slice();
  for (let k = 0; k < rem; k++) shares[order[k % order.length].i]++;
  return memberIds.map((memberId, i) => ({
    memberId,
    shareCents: shares[i],
    weight: weights[i],
  }));
}

/**
 * Dispatch on split method. For "salary", any participant with a missing/zero
 * salary makes the whole split fall back to equal (scope doc §7.5) — callers
 * should warn the user when that happens (see salaryFallsBackToEqual).
 */
export function computeSplit(
  method: SplitMethod,
  totalCents: Cents,
  memberIds: string[],
  opts: SplitOptions = {}
): ExpenseSplit[] {
  switch (method) {
    case "exact":
      return memberIds.map((memberId) => ({
        memberId,
        shareCents: opts.exact?.[memberId] ?? 0,
      }));
    case "percent":
      return splitWeighted(totalCents, memberIds, memberIds.map((id) => opts.pct?.[id] ?? 0));
    case "shares":
      return splitWeighted(totalCents, memberIds, memberIds.map((id) => opts.shares?.[id] ?? 0));
    case "salary": {
      const sal = memberIds.map((id) => opts.salaries?.[id] ?? 0);
      if (sal.some((s) => s <= 0)) return splitEqual(totalCents, memberIds);
      return splitWeighted(totalCents, memberIds, sal);
    }
    case "equal":
    default:
      return splitEqual(totalCents, memberIds);
  }
}

/** True when a salary split would silently fall back to equal (missing salary). */
export function salaryFallsBackToEqual(
  memberIds: string[],
  salaries: Record<string, Cents>
): boolean {
  return memberIds.some((id) => (salaries[id] ?? 0) <= 0);
}

/** Validation: shares must reconcile exactly to the total. */
export function splitsReconcile(totalCents: Cents, splits: ExpenseSplit[]): boolean {
  return splits.reduce((a, s) => a + s.shareCents, 0) === totalCents;
}

/** Validation: multi-payer paid amounts must sum exactly to the total. */
export function payersReconcile(
  totalCents: Cents,
  payers: { paidCents: Cents }[]
): boolean {
  return payers.reduce((a, p) => a + p.paidCents, 0) === totalCents;
}
