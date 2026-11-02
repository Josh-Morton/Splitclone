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

/** Share codes of every bill this browser has joined or started (Phase 21). */
export function savedSplitCodes(): string[] {
  if (typeof window === "undefined") return [];
  const codes: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith("splitty_guest_")) codes.push(k.slice("splitty_guest_".length));
    }
  } catch {
    /* storage blocked — nothing saved to list */
  }
  return codes;
}

/**
 * Small per-browser values for the standalone page (Phase 21, ADR-0022). All
 * fail soft: blocked storage just means no memory, never a broken page.
 */
function stored(keyName: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(keyName);
  } catch {
    return null;
  }
}
function store(keyName: string, value: string): void {
  try {
    window.localStorage.setItem(keyName, value);
  } catch {
    /* non-fatal */
  }
}

/** A random id for usage counts: no name, no email, just "the same browser". */
export function splittyDeviceId(): string | null {
  const have = stored("splitty_device");
  if (have) return have;
  if (typeof crypto === "undefined" || !crypto.randomUUID) return null;
  const id = crypto.randomUUID();
  store("splitty_device", id);
  return id;
}

/** The first bill whose "Loving Splitty?" link brought this browser here. */
export function splittyFirstRef(): string | null {
  return stored("splitty_ref");
}
export function rememberSplittyRef(ref: string | null): void {
  if (ref && !stored("splitty_ref")) store("splitty_ref", ref.slice(0, 64));
}

/** The name someone without a Tally account goes by on their splits. */
export function splittyName(): string {
  return stored("splitty_name") ?? "";
}
export function rememberSplittyName(name: string): void {
  store("splitty_name", name.trim().slice(0, 40));
}

/** Sum of the line totals a given guest has claimed, in cents. */
export function claimedSubtotalCents(bill: SplitBill, guestId: string): number {
  return bill.items
    .filter((it) => it.claimedByGuestId === guestId)
    .reduce((a, it) => a + it.lineTotalCents, 0);
}

/**
 * A guest's tip in cents: their fixed Rand tip if they set one (Phase 21),
 * otherwise their percentage of what they claimed. Integer cents throughout.
 */
export function guestTipCents(bill: SplitBill, guestId: string): number {
  const guest = bill.guests.find((g) => g.id === guestId);
  if (!guest) return 0;
  if (guest.tipCents != null) return guest.tipCents;
  return Math.round((claimedSubtotalCents(bill, guestId) * guest.tipPercent) / 100);
}

/** Up to the next whole rand; an exact rand stays as it is (Phase 21). */
export function roundUpToRand(cents: number): number {
  return Math.ceil(cents / 100) * 100;
}

/**
 * A guest's total contribution in cents = claimed items + tip, rounded UP to
 * the next whole rand. Splitty always rounds (Josh, Phase 21): nobody hands
 * over R137,60. Derived, never stored (ADR-0004 spirit; Splitty has no ledger).
 */
export function guestContributionCents(bill: SplitBill, guestId: string): number {
  return roundUpToRand(claimedSubtotalCents(bill, guestId) + guestTipCents(bill, guestId));
}

/** The cents a guest's total was rounded up by. */
export function guestRoundingCents(bill: SplitBill, guestId: string): number {
  return (
    guestContributionCents(bill, guestId) - claimedSubtotalCents(bill, guestId) - guestTipCents(bill, guestId)
  );
}

/** Total across every guest (items + each guest's own tip). */
export function coveredCents(bill: SplitBill): number {
  return bill.guests.reduce((a, g) => a + guestContributionCents(bill, g.id), 0);
}

/**
 * Cents of line items someone has claimed — tips EXCLUDED (BUG-019).
 *
 * This, not coveredCents(), is what to compare against the bill total. The
 * bill total is the sum of the items, while coveredCents() adds each guest's
 * tip on top, so comparing the two showed "R1 376,25 of R1 225,00 claimed" for
 * a bill that was exactly fully claimed plus tips — which reads as an error.
 */
export function claimedItemsCents(bill: SplitBill): number {
  return bill.items
    .filter((it) => it.claimedByGuestId !== null)
    .reduce((a, it) => a + it.lineTotalCents, 0);
}

/**
 * Sum of every line item, claimed or not — the denominator for "items
 * claimed". Using this rather than the stored receipt total guarantees
 * claimed + unclaimed always adds up, even if the two ever disagree. (All 11
 * production bills agreed as of 2026-10-21; the demo seed didn't.)
 */
export function itemsTotalCents(bill: SplitBill): number {
  return bill.items.reduce((a, it) => a + it.lineTotalCents, 0);
}

/** Tips on top of the claimed items, across every guest. */
export function tipsCents(bill: SplitBill): number {
  return bill.guests.reduce((a, g) => a + guestTipCents(bill, g.id), 0);
}

/** Rounding on top of items + tips, across every guest. */
export function roundingCents(bill: SplitBill): number {
  return bill.guests.reduce((a, g) => a + guestRoundingCents(bill, g.id), 0);
}

/** Cents of line items nobody has claimed yet. */
export function unclaimedCents(bill: SplitBill): number {
  return bill.items
    .filter((it) => it.claimedByGuestId === null)
    .reduce((a, it) => a + it.lineTotalCents, 0);
}

// --- Reviewing a scanned bill before sharing (Phase 21) ---------------------

/** One product on the review screen: a quantity and a price each. */
export interface ReviewLine {
  name: string;
  qty: number;
  /** The line total for all `qty` units. */
  lineCents: number;
}

const UNIT_ROW = /^(.*) \((\d+) of (\d+)\)$/;

/**
 * The scanner expands "5 Jack Black R250" into five rows named "Jack Black (1
 * of 5)" … "(5 of 5)" so each unit can be claimed. For editing, fold a
 * complete run back into one line (qty 5, R250). Anything that isn't a clean,
 * in-order run stays as its own line.
 */
export function groupScanItems(items: { name: string; lineTotalCents: number }[]): ReviewLine[] {
  const out: ReviewLine[] = [];
  for (let i = 0; i < items.length; i++) {
    const m = UNIT_ROW.exec(items[i].name);
    const n = m ? Number(m[3]) : 0;
    if (m && Number(m[2]) === 1 && n > 1 && i + n <= items.length) {
      const run = items.slice(i, i + n);
      const clean = run.every((it, k) => it.name === `${m[1]} (${k + 1} of ${n})`);
      if (clean) {
        out.push({ name: m[1], qty: n, lineCents: run.reduce((a, it) => a + it.lineTotalCents, 0) });
        i += n - 1;
        continue;
      }
    }
    out.push({ name: items[i].name, qty: 1, lineCents: items[i].lineTotalCents });
  }
  return out;
}

/**
 * Back to one claimable item per unit, cent-exact: the line total is shared
 * across the units with the remainder on the first ones, so the items always
 * add up to the line. Blank names and empty lines are dropped.
 */
export function expandRows(lines: ReviewLine[]): { name: string; lineTotalCents: number }[] {
  const out: { name: string; lineTotalCents: number }[] = [];
  for (const l of lines) {
    const name = l.name.trim();
    const qty = Math.max(1, Math.floor(l.qty));
    if (!name || l.lineCents <= 0) continue;
    if (qty === 1) {
      out.push({ name, lineTotalCents: l.lineCents });
      continue;
    }
    const base = Math.floor(l.lineCents / qty);
    const remainder = l.lineCents - base * qty;
    for (let k = 0; k < qty; k++) {
      out.push({ name: `${name} (${k + 1} of ${qty})`, lineTotalCents: base + (k < remainder ? 1 : 0) });
    }
  }
  return out;
}

/**
 * A line's total while it's being edited. Untouched (same qty and price each
 * as scanned), it keeps the scanned total exactly, which matters when the
 * till's total doesn't divide evenly (R10,00 for 3). Once either changes it's
 * simply price each × qty.
 */
export function editedLineCents(
  qty: number,
  unitCents: number,
  scanned: { qty: number; unitCents: number; lineCents: number } | null
): number {
  if (scanned && qty === scanned.qty && unitCents === scanned.unitCents) return scanned.lineCents;
  return Math.max(0, unitCents) * qty;
}

/** The message the host shares: the bill, then the link to Splitty itself. */
export function splittyShareMessage(origin: string, shareCode: string, merchant: string | null): string {
  const code = encodeURIComponent(shareCode);
  return (
    `Let's split ${merchant ? `the ${merchant} bill` : "the bill"} on Splitty.\n\n` +
    `1. Tap this link: ${origin}/split/${code}\n` +
    `2. Type your name\n` +
    `3. Tick what you had, add a tip, and lock in.\n\n` +
    `Loving Splitty? Save this link and you can use it too! ${origin}/splitty?ref=${code}`
  );
}

/** "(100 Splits remaining for today)" — the live scan counter's wording. */
export function scansRemainingLabel(remaining: number): string {
  const n = Math.max(0, Math.floor(remaining));
  return `(${n} Split${n === 1 ? "" : "s"} remaining for today)`;
}
