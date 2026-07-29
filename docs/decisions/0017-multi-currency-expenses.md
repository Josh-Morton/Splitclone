# ADR-0017: Per-expense foreign currency, converted and locked to ZAR at entry

**Status:** Accepted (2026-07-29) · **Source:** Josh (Phase 14 backlog) · ROADMAP Phase 14

## Context
Tally is ZAR-only end to end today: `fmt()`/`fmtR()` hardcode "R", and
`"group".currency` has `check (currency = 'ZAR')`. Josh wants to enter an
individual expense in a foreign currency (e.g. a trip purchase in USD) while
everything the app already does with money — splits, balances, settling,
reports, exports — stays exactly as correct and exactly as ZAR as it is
today. This is **not** the "multi-currency support" backlog item already on
file (that one is about the *app* supporting non-ZAR households/spaces —
bigger, unscoped, still deferred). This is narrower: **one currency picker on
one expense, always resolving to Rand.**

## Decision
- **The expense's `amount_cents` stays the ZAR amount, always.** Every
  existing consumer — `lib/domain/split.ts`, `balance.ts`, Reports, the
  `.xlsx` export, Splitty (unrelated but same money model), settlements —
  needs **zero changes**. This is the single most important constraint: the
  integer-cents-ZAR iron rule (ADR-0003) is not being relaxed, it's being fed
  by a conversion step that happens once, at entry.
- **The exchange rate is locked at the moment the expense is created**, not
  recomputed live later. A logged expense should reflect what it actually
  cost in Rand *that day* — the same principle as a real receipt. Three new
  nullable columns on `expense` carry the record of that conversion:
  `original_currency`, `original_amount_cents`, `fx_rate_to_zar`. Existing
  expenses (and any new ZAR expense) leave these null — "null currency" means
  "was always Rand," not a missing-data state.
- **Rates are fetched and cached server-side on a daily cron, not looked up
  live during expense entry.** A new Edge Function (`fetch-exchange-rates`)
  + `pg_cron` job populate a small `exchange_rate` table once a day, mirroring
  the existing recurring-bill generation pattern (Phase 4) rather than
  introducing a synchronous third-party API call on the critical "save an
  expense" path. Source: **Frankfurter** (`frankfurter.app`) — free,
  unlimited, no API key, ECB-sourced daily rates. Chosen over
  exchangerate-api.com/currencyapi.com specifically because it needs no
  account or key, consistent with this project's preference for
  zero-friction free-tier tools (same reasoning as Phase 4's `pg_cron`, not
  a paid scheduler).
- **"Recently used currencies," not a managed favorites list.** Josh's
  answer: keep this at the expense level, and just surface whatever
  currencies *this user* has actually picked recently, most-recent-first, so
  switching away from Rand and back doesn't mean re-searching a long list
  every time. No settings screen, no per-user favorites table — a small
  client-side (or profile-stored) recency list is enough.
- **ISO 4217 codes, static bundled list.** No external "list of world
  currencies" API — that data doesn't change.

## Consequences
- **No change to split math, balance derivation, reports, or export** — they
  all keep reading `amount_cents` exactly as before. This ADR is entirely
  additive at the schema and entry-UI level.
- **Historical expenses are unaffected** — this only applies going forward;
  there's no backfill of `original_currency` for past ZAR expenses (there's
  nothing to backfill — they were always ZAR).
- **Settlements stay ZAR-only.** You settle in Rand even if some contributing
  expense was entered in USD — consistent with balances always being ZAR.
- **A new external dependency**: Frankfurter's uptime becomes a (soft)
  dependency for foreign-currency entry specifically. If the daily fetch
  fails, the cached rate from the previous successful fetch is used (never
  block expense entry on a live network call) — same resilience shape as
  every other Edge Function in this app degrading gracefully rather than
  hard-failing.
- **This does not make the *app* multi-currency.** `"group".currency` stays
  `'ZAR'`-only; there's still one household ledger currency. The existing
  broader multi-currency backlog item stays open, now clearly scoped as
  "different from this."
