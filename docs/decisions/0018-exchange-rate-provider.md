# ADR-0018: Exchange-rate provider — open.er-api.com, superseding Frankfurter

**Status:** Accepted & implemented (2026-08-03) · **Source:** Josh (during Phase 14 build) · ROADMAP Phase 14

**Supersedes** the *rate provider* clause of
[ADR-0017](0017-multi-currency-expenses.md), and **amends** its
"re-lock the rate on edit" consequence. Everything else in ADR-0017 —
`amount_cents` stays ZAR, the rate is locked at entry, rates are cached
server-side on a daily cron and never fetched live during expense entry,
recently-used rather than managed favourites — stands unchanged.

## Context
ADR-0017 chose **Frankfurter** on the reasoning that it is free, needs no API
key, and is ECB-sourced. That reasoning was sound; the coverage wasn't
checked. Verifying it while building Phase 14 turned up two problems:

1. **`api.frankfurter.app` now 301-redirects** to `api.frankfurter.dev/v1` —
   the URL written into ADR-0017 is stale.
2. **Frankfurter quotes only 30 currencies**, because the ECB reference set is
   deliberately small. The missing ones include **AED (Dubai), MUR
   (Mauritius), NAD (Namibia), BWP (Botswana), KES, EGP, MAD** — i.e. several
   of the most common destinations for the South African travellers this
   feature exists for. Josh's stated goal was "make it easier for people in
   foreign countries to enter expenses while tracking in rands"; a picker that
   can't price a Mauritius holiday or a Namibia road trip fails that goal in
   the most likely cases.

Offering a currency we hold no rate for would be worse than omitting it — the
user would pick it and hit a dead end — so provider coverage directly sets the
feature's reach.

## Decision
- **Use `open.er-api.com` (`/v6/latest/ZAR`)** as the rate source. Still free,
  still **no API key**, still refreshed daily, and it quotes **166
  currencies** including every one listed above. The zero-friction,
  no-account property that motivated the original Frankfurter choice is
  preserved — this is a coverage fix, not a change of posture.
- **Rates are stored as "1 unit of X = N ZAR."** The provider returns the
  inverse (1 ZAR = N units of X), so the Edge Function reciprocates on the way
  in. Storing one direction consistently means no call site has to remember
  which way round a rate points.
- **Amend ADR-0017's edit behaviour.** ADR-0017 said an edit re-locks a fresh
  rate. Taken literally that means correcting a typo in a description silently
  re-prices the expense and moves everyone's balances. Instead: **the locked
  rate is reused unless the amount or the currency actually changes.** This
  keeps ADR-0017's real intent (a rate is never hand-edited; it always comes
  from the cache at the moment the money is stated) without letting unrelated
  edits move money. Josh's call.
- **The picker shows flag, country/currency name, code and symbol.** Flags are
  derived from the ISO-4217 code's first two letters, which are the ISO-3166
  country code (ZAR → ZA → 🇿🇦), with a small override table for codes that
  aren't country-based (EUR → 🇪🇺; the multi-country CFA/Caribbean codes get no
  flag rather than a misleading one).
- **The selected currency is sticky and stored per user, not per device.** It
  lives in `profile.recent_currencies`, whose head doubles as the default for
  the next expense, so a trip set up on a phone carries to a laptop.

## Consequences
- **Provider swap is contained to one Edge Function.** Nothing else knows
  where rates come from; the app reads the `exchange_rate` table. If
  open.er-api.com ever degrades, replacing it is a single-file change plus a
  new ADR.
- **166 currencies is more than the static metadata table names.** Unlisted
  codes fall back to showing the code itself as both name and symbol, and get
  a derived flag — usable, just less pretty. Adding a name/symbol is a
  one-line edit in `src/lib/domain/currency.ts`.
- **`open.er-api.com` is a commercial service's free tier**, where
  Frankfurter is a hobby/ECB mirror. That is a mild reliability trade, largely
  neutralised by ADR-0017's existing design: rates are cached daily and
  expense entry reads only the cache, so an outage means "yesterday's rate,"
  never a blocked save. The Edge Function explicitly leaves the cache intact
  on a failed fetch.
- **`fx_rate_to_zar` is `numeric`, not a float column** — rates are stored at
  full provider precision and the ZAR conversion is rounded exactly once, at
  entry, before any splitting. The integer-cents rule (ADR-0003) is untouched:
  by the time the split maths sees the number it is already whole ZAR cents.
- The broader "make the *app* multi-currency" backlog item is still open and
  still distinct from this (per ADR-0017).
