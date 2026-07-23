/**
 * Splitty (Phase 8) client helpers — guest identity persistence + the
 * contribution math. Kept out of the Repo layer because it's pure/browser-only
 * (localStorage) and shared by the Splitty tab and the /split/[code] page.
 *
 * Guest identity is a browser-local secret (see ADR-0013): the token proves who
 * you are to the token-gated RPCs. It is NOT a real auth session — it lives in
 * localStorage keyed by share code, so reopening the same link on the same
 * device resumes you without re-entering a name.
 */

import type { SplitBill } from "./data";

export interface GuestIdentity {
  guestId: string;
  guestToken: string;
}

const key = (shareCode: string) => `splitty_guest_${shareCode}`;

export function loadGuestIdentity(shareCode: string): GuestIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(shareCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestIdentity;
    return parsed.guestId && parsed.guestToken ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGuestIdentity(shareCode: string, id: GuestIdentity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(shareCode), JSON.stringify(id));
  } catch {
    /* private mode / storage full — non-fatal, guest just can't resume later */
  }
}

/** Sum of the line totals a given guest has claimed, in cents. */
export function claimedSubtotalCents(bill: SplitBill, guestId: string): number {
  return bill.items
    .filter((it) => it.claimedByGuestId === guestId)
    .reduce((a, it) => a + it.lineTotalCents, 0);
}

/**
 * A guest's total contribution in cents = their claimed subtotal plus their own
 * tip percentage. Integer cents throughout (the iron rule) — this is derived,
 * never stored (ADR-0004 spirit; Splitty has no ledger of its own).
 */
export function guestContributionCents(bill: SplitBill, guestId: string): number {
  const guest = bill.guests.find((g) => g.id === guestId);
  const subtotal = claimedSubtotalCents(bill, guestId);
  const tip = guest ? guest.tipPercent : 0;
  return Math.round(subtotal * (1 + tip / 100));
}

/** Total across every guest (items + each guest's own tip). */
export function coveredCents(bill: SplitBill): number {
  return bill.guests.reduce((a, g) => a + guestContributionCents(bill, g.id), 0);
}

/** Cents of line items nobody has claimed yet. */
export function unclaimedCents(bill: SplitBill): number {
  return bill.items
    .filter((it) => it.claimedByGuestId === null)
    .reduce((a, it) => a + it.lineTotalCents, 0);
}
