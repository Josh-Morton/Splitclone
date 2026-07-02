/**
 * Balances & debt simplification (scope doc §7.1, §7.6).
 *
 * Balances are ALWAYS recomputed from the underlying expenses + settlements —
 * never stored, never synced. That makes the ledger self-healing: once the
 * expense set converges across devices, the balances agree by construction.
 *
 * net(member) = sum(paid) − sum(charged) + settlements paid − settlements received.
 * Positive net = the group owes them; negative = they owe the group.
 * Across a group all nets always sum to zero.
 */

import type { Cents, Expense, Settlement } from "./types";

/** memberId -> net cents. */
export type Balances = Record<string, Cents>;

export function computeBalances(
  memberIds: string[],
  expenses: Expense[],
  settlements: Settlement[]
): Balances {
  const net: Balances = {};
  for (const id of memberIds) net[id] = 0;

  for (const e of expenses) {
    if (e.deletedAt) continue;
    for (const p of e.payers) net[p.memberId] = (net[p.memberId] ?? 0) + p.paidCents;
    for (const s of e.splits) net[s.memberId] = (net[s.memberId] ?? 0) - s.shareCents;
  }
  for (const s of settlements) {
    if (s.deletedAt) continue;
    // Paying a settlement increases your net (you've handed over money you owed).
    net[s.fromMemberId] = (net[s.fromMemberId] ?? 0) + s.amountCents;
    net[s.toMemberId] = (net[s.toMemberId] ?? 0) - s.amountCents;
  }
  return net;
}

export interface SettleTransaction {
  fromMemberId: string;
  toMemberId: string;
  amountCents: Cents;
}

/**
 * Greedy debt simplification: repeatedly match the largest creditor with the
 * largest debtor. Near-optimal, O(n log n), and exactly what Splitwise does.
 * For a two-person household this collapses to a single payment.
 *
 * The expense history is never altered — this only produces suggested payments.
 */
export function simplifyDebts(balances: Balances): SettleTransaction[] {
  const creditors: { id: string; v: Cents }[] = [];
  const debtors: { id: string; v: Cents }[] = [];
  for (const id of Object.keys(balances)) {
    const v = Math.round(balances[id]);
    if (v > 0) creditors.push({ id, v });
    else if (v < 0) debtors.push({ id, v: -v });
  }
  creditors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));
  debtors.sort((a, b) => b.v - a.v || a.id.localeCompare(b.id));

  const tx: SettleTransaction[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].v, debtors[di].v);
    tx.push({ fromMemberId: debtors[di].id, toMemberId: creditors[ci].id, amountCents: pay });
    creditors[ci].v -= pay;
    debtors[di].v -= pay;
    if (creditors[ci].v === 0) ci++;
    if (debtors[di].v === 0) di++;
  }
  return tx;
}

/** Invariant check: every group's nets must sum to zero (allowing for empty). */
export function balancesSumToZero(balances: Balances): boolean {
  return Object.values(balances).reduce((a, b) => a + b, 0) === 0;
}
