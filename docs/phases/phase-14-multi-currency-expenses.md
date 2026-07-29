*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 14 — Multi-currency expenses 📝 SPEC ONLY — NOT BUILT (2026-07-29)

> See **[ADR-0017](../decisions/0017-multi-currency-expenses.md)** first —
> it settles the important calls (rate locked at entry, cached daily via
> Frankfurter, `amount_cents` always stays ZAR). This file is the how.

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
