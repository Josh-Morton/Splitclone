# ADR-0022: Splitty without an account — anonymous sessions, a daily scan budget, first-party usage events

**Status:** Accepted (2026-11-02) · **Source:** Josh (Phase 21) · **Extends**
[ADR-0013](0013-splitty-guest-access.md) · **Amends**
[ADR-0012](0012-receipt-scanning.md) (scanning no longer requires a *Tally*
account)

## Context

Splitty guests have never needed an account (ADR-0013), but *starting* a split
did: scanning calls the `scan-receipt` Edge Function, which checks for a
signed-in user, and `splitty_create_bill` stamps `created_by = auth.uid()`.
Josh wants the share message to carry a second link, "Loving Splitty? Save
this link and you can use it too!", that opens a dedicated `/splitty` page
where **anyone** can start their own split. He chose **no account needed**.
He also wants usage of that link recorded in a table, and a live
"(N Splits remaining for today)" counter.

Three problems follow:

1. Something must stand in for `auth.uid()` for people who will never make a
   Tally account.
2. Opening scanning to strangers puts the free Gemini quota within reach of
   anyone.
3. The privacy page says "no analytics, no tracking", and Josh wants usage
   recorded.

## Decision

### Creators get an anonymous Supabase session, made on first use

`/splitty` calls `supabase.auth.signInAnonymously()` only when someone without
a session starts their first split. Viewing the page, the counter and
tracking need no session, so passing visitors and link-preview bots create
nothing. The anonymous user is a real `auth.users` row (`is_anonymous = true`,
role `authenticated`), so **every existing Splitty function and the scanner
work unchanged**: `created_by`, `splittyListMyBills` and the admin-identity
recovery all key on `auth.uid()` as they already do.

Rejected alternatives:

- **A token-only "guest creator" path** (new RPCs keyed on a device secret):
  duplicates `created_by`, admin recovery and closing for one feature.
- **Requiring a Tally sign-up:** Josh chose against it, and sign-up still has
  the email problems from the 2026-10-28 audit.

**Anonymous users never enter the Tally ledger.**

- *In the app:* `useSessionState` reports an anonymous session as signed
  out, so `/`, onboarding, `/join` and `/verify` treat them exactly like a
  visitor.
- *In the database:* a restrictive RLS policy blocks them from creating a
  Tally, and `redeem_invite` refuses them. Every other ledger table is
  reachable only through Tally membership, which they can't get.

Their splits live with that anonymous user. They stay on the device until
the session is cleared, and recovery works for as long as it exists.
Converting an anonymous user into a Tally account while keeping their splits
is a follow-up, not part of this decision.

### One shared daily scan budget, counted by Tally

Google doesn't expose how much free quota is left, so Tally counts its own
scans:

- **Budget:** 100 per day (Africa/Johannesburg calendar day) across all
  users. Set in one SQL function, `scan_budget()`.
- **Per-account cap:** 15 per day, anonymous or not, so one person or bot
  can't drain the shared budget.

Every scan (Splitty or expense receipt) reserves one slot before calling
Gemini, through `consume_scan()` (service-role only, atomic). A scan that
fails at Google refunds its slot. The public figure comes from
`scans_remaining_today()`, granted to `anon`. The daily row is in the Realtime
publication, so the "(N Splits remaining for today)" counter moves live as
anyone scans.

### Usage is first-party events in Tally's own database

`splitty_event` records:

- `splitty_opened`, with the `?ref=` bill the "Loving Splitty?" link came
  from;
- `bill_opened`;
- `share_tapped`;
- `split_created`, with first-touch attribution and where it started.

Each event carries a random per-browser id kept in `localStorage`. There is
no name, no email, no IP and no cookie. The table is RLS-on with no policies
(Josh reads it through the dashboard or SQL). Writes go only through
`splitty_track()`, which accepts a fixed list of event names and
length-capped strings. No third-party analytics.

**The privacy page changes in the same commit:** "no analytics" becomes
"no third-party analytics", and it describes these counts and anonymous
Splitty sessions.

## Consequences

- **Anonymous sign-ins are enabled project-wide**
  (`external_anonymous_users_enabled`). Supabase rate-limits them to 30 per
  hour per IP. CAPTCHA stays off (backlog) unless abuse appears.
- **`auth.users` gains anonymous rows**, one per person who has started a
  split. `handle_new_user` still makes their (empty) profile row. A periodic
  clean-up of long-idle anonymous users with no bills is a reasonable
  follow-up.
- **The 100/day budget is shared with Tally's own receipt scanning.** If it's
  exhausted, both scanners say so plainly and the counter reads 0.
- **ADR-0012's "requires a real signed-in user"** becomes "requires a
  session, anonymous allowed, within the daily budget and per-account cap".
