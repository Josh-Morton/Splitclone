*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 14 — Multi-currency expenses ✅ SHIPPED (2026-08-03)

> See **[ADR-0017](../decisions/0017-multi-currency-expenses.md)** and
> **[ADR-0018](../decisions/0018-exchange-rate-provider.md)** — together they
> settle the important calls (rate locked at entry, cached daily,
> `amount_cents` always stays ZAR). This file is the how.
>
> **The spec below is kept as written, including where it turned out wrong.**
> The shipped section at the bottom records what actually got built.

## Goal
Let a single expense be entered in a foreign currency; it always contributes
to the Tally's Rand totals, splits and balances exactly like any other
expense. A quick-pick of recently-used currencies avoids re-searching a long
list every time.

## Data model
```sql
-- Daily-refreshed cache, not looked up live during expense entry.
create table exchange_rate (
  currency_code text primary key,   -- ISO 4217, e.g. 'USD'
  rate_to_zar numeric not null,     -- 1 unit of currency_code = this many ZAR
  fetched_at timestamptz not null default now()
);

-- Nullable = "this expense was always ZAR" (every existing row, and every
-- new ZAR expense going forward).
alter table expense add column original_currency text;
alter table expense add column original_amount_cents bigint;
alter table expense add column fx_rate_to_zar numeric;
-- amount_cents (existing column) is unchanged and remains authoritative —
-- for a foreign-currency expense it's original_amount_cents * fx_rate_to_zar,
-- rounded, computed once at save time and stored, never recomputed later.
```

**Edge Function `fetch-exchange-rates`** (new), triggered daily by
`pg_cron` (same mechanism as Phase 4's recurring-bill generation): calls
`frankfurter.app/latest?from=ZAR&to=<supported list>` (or per-currency,
whichever is fewer calls), upserts into `exchange_rate`. On failure, leaves
the existing cached rows in place — expense entry always reads whatever's
cached, never blocks on a live fetch.

## Client
- **Add-expense sheet:** a currency picker next to the amount field, default
  collapsed/hidden showing "ZAR" — this must not add friction to the 95% of
  expenses that stay in Rand. Tapping it reveals: recently-used currencies
  (most-recent-first, from this user, empty state shows a short common list —
  ZAR, USD, EUR, GBP) + a search-the-full-ISO-4217-list fallback.
- Picking a non-ZAR currency: the amount field's label switches to that
  currency; on save, the app reads the cached `exchange_rate` row, computes
  `amount_cents = round(original_amount_cents * rate_to_zar)`, and stores all
  three new columns alongside the existing ZAR `amount_cents`. **The split
  math that follows uses `amount_cents` exactly as it does today — no
  awareness of currency anywhere downstream.**
- **Expense detail:** if `original_currency` is set, show it as context —
  e.g. "R1,234.56 (converted from $80.00 @ R15.43)" — informational only,
  never a second source of truth for the amount.
- **Recently-used tracking:** simplest viable approach — store the last ~5
  distinct currency codes this user has picked, either in their `profile`
  row (a small jsonb/array column) or client-side `localStorage` if it's
  acceptable for this to be per-device rather than synced. Recommend
  `profile` (small, syncs across devices, consistent with where other
  per-user preferences already live) unless that's overkill for what's a
  minor convenience.

## Non-goals
- **Not app-wide multi-currency.** `"group".currency` stays ZAR-only; this
  is a per-expense entry convenience, not a ledger-currency change (ADR-0017).
- **No settlement in foreign currency** — settlements stay ZAR, same as today.
- **No editing the locked rate after save** — if it's wrong, edit the
  expense (which re-locks a fresh rate at the edit's save time, same as
  creating fresh).
- **No backfill of historical expenses** — nothing to backfill; they were
  always ZAR-native.
- **No managed favorites list/settings screen** — recently-used only, per
  Josh's answer.
- **No live/synchronous rate lookups during expense entry** — always the
  cached daily rate (ADR-0017).

## Build order
1. Migration: `exchange_rate` table, three new nullable `expense` columns.
2. Edge Function `fetch-exchange-rates` + `pg_cron` daily schedule.
3. Static ISO 4217 currency list bundled in the client.
4. Repo: expose a way to read cached rates (or resolve server-side via an
   RPC at save time, avoiding a client round-trip that could race a stale
   client-side rate — recommend the RPC approach, mirroring how
   `create_expense` already does its work server-side in one transaction).
5. Add-expense sheet: currency picker, recently-used tracking, amount
   conversion + the three-column write on save.
6. Expense detail: show the original-currency context line when present.
7. Verify: a foreign-currency expense splits/settles/reports/exports
   identically to a ZAR one of the same converted amount; a stale/missing
   `exchange_rate` row degrades gracefully (falls back to the last cached
   rate, never blocks save); `npm test` + build + lint green; confirm no
   existing split/balance/report/export test needed to change (if one did,
   that's a signal `amount_cents` stopped being the single source of truth —
   stop and reconsider).


---

# Shipped — 2026-08-03

## What Josh asked for
The big **R** to the left of the amount becomes a dropdown; picking a currency
sticks until changed; recently-used first; flag + name + symbol in the list;
the rand value shown under the input when the currency isn't ZAR; splits and
records always in rand.

All of that is built. The prefix is now a tappable `$ ▾` / `₨ ▾` button, the
converted amount appears directly beneath the figure with the rate used, and
`amount_cents` remains plain ZAR cents — no downstream code knows a currency
was ever involved.

## Two corrections to the spec, both found by checking rather than assuming
1. **The rate provider was wrong for the use case.** Frankfurter quotes 30 ECB
   currencies and omits AED, MUR, NAD, BWP, KES, EGP — Dubai, Mauritius,
   Namibia, Botswana. Switched to `open.er-api.com`: still free, still no API
   key, **166 currencies**. Recorded in
   [ADR-0018](../decisions/0018-exchange-rate-provider.md). (Also: the
   `frankfurter.app` URL in ADR-0017 now 301-redirects.)
2. **Conversion cannot happen server-side at save time**, which build step 4
   of the spec below recommended. The splits are computed *client-side* from
   the total, so the ZAR figure must be settled before the write is issued —
   otherwise the split maths would be dividing an amount the client doesn't
   know yet. The client converts from the cached rate and sends all four
   values; the RPC just stores them.

## Also decided during the build (Josh's calls)
- **Sticky currency is per user, not per device** — `profile.recent_currencies`,
  whose head is the default for the next expense, so a trip set up on a phone
  carries to a laptop.
- **An edit reuses the locked rate unless the amount or currency changes.**
  ADR-0017 said re-lock on every edit, which would mean fixing a typo silently
  re-prices the expense and shifts balances. Amended in ADR-0018.

## Built
- `supabase/migrations/20260803000000_multi_currency_expenses.sql` — the
  `exchange_rate` cache (RLS: any signed-in user reads, nobody writes),
  three nullable `expense` columns, `profile.recent_currencies`,
  `refresh_exchange_rates()` + a daily 03:10 UTC `pg_cron` job, and both
  expense RPCs taught the new columns. Constraints enforce all-or-nothing
  conversion records and a positive rate.
- `supabase/functions/fetch-exchange-rates/` — deployed `--no-verify-jwt`,
  shared-secret authenticated like `send-push`. Reciprocates the provider's
  rates into "1 unit = N ZAR" and **leaves the cache untouched on failure**.
- `src/lib/domain/currency.ts` (+ 21 unit tests) — metadata, flag derivation,
  ordering, search, recency, and `convertToZarCents`.
- `src/components/currency-picker-sheet.tsx` — flag/name/code/symbol/rate rows,
  recently-used pinned on top, search.
- Amount field, expense detail line, both repos, and `page.tsx` wiring. Rates
  ride along in the existing parallel load batch — **no extra round trip**
  (Phase 16), and a failed rate read degrades to "Rand only" rather than
  breaking the screen.

## Verified
- **Live chain**: cron function → pg_net → Edge Function → provider → **166
  rows cached**; ZAR and NAD both correctly 1.0000 (NAD is pegged to the rand).
- **Demo**: `$100` shows `R1 648,75 at R16.4875 per USD`; splits came out
  R412,19 ×3 + R412,18 — **reconciling to the cent on a converted amount**.
  Saving moved the balance R836,86 → R2 073,42, exactly the expected +R1 236,56.
  Mauritius (5 000 MUR → R1 761,00) works — the case Frankfurter would have
  failed. Currency stuck to USD on the next new expense and appeared under
  "RECENTLY USED". Search, flags and the detail line all correct; console clean.
- **Live Postgres** (throwaway group, cleaned up): stored values round-trip and
  `original × rate` recomputes to exactly `amount_cents`; a half-populated
  conversion and a zero rate are both rejected (23514); all-null still allowed.
- 74 tests + build + lint green. **No existing split, balance, report or
  export test needed changing** — the check the spec called for, and it held.

## Not done
- **No backfill** — historical expenses were always ZAR; their columns stay null.
- **Settlements stay ZAR-only**, per ADR-0017.
- **Recurring bills are ZAR-only** — a rule stores a fixed ZAR amount, and
  re-converting on each generation would silently change what people owe.
  Worth revisiting only if someone asks for a foreign-currency subscription.
- Unlisted currencies (beyond the ~70 named in `currency.ts`) show their code
  in place of a name/symbol. Adding one is a one-line edit.
