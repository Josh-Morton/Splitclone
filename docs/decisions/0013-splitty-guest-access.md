# ADR-0013: Splitty guest access — token-gated RPCs instead of RLS/auth

**Status:** Accepted (2026-07-23) · **Source:** Josh (Phase 8 "Splitty" spec) ·
ROADMAP Phase 8

## Context
Splitty (Phase 8) lets a guest join a shared bill from a WhatsApp link with
**no Tally account** — just a typed display name. Every other write path in
this app (ADR-0005) is protected by Supabase RLS keyed on `auth.uid()`: you
must be a signed-in member of a group to touch its rows. Splitty guests have
no session at all, so `auth.uid()` is null for them — RLS-by-auth-identity
cannot be the boundary for guest writes.

## Decision
- **The function is the boundary, not RLS.** Every guest-facing write
  (`splitty_join`, `splitty_claim_item`, `splitty_unclaim_item`,
  `splitty_set_tip`, `splitty_set_locked`) is a `SECURITY DEFINER` RPC that
  takes a `guest_token` (a `uuid` generated at join time) as an explicit
  parameter and validates it server-side against `split_guest_secret` before
  doing anything. There is **no RLS policy that lets a client write to
  `split_item` or `split_guest` directly** — those tables have no insert/
  update/delete policies at all, so only the RPCs (which run with elevated
  privilege) can mutate them. This mirrors the pattern already used by
  `notify-removed` (Phase-6 membership work), which checks ownership inside
  the function rather than via RLS.
- **The token lives in a table nobody can read.** `guest_token` is stored in
  a separate `split_guest_secret` table with **no SELECT policy at all**
  (default-deny) — not even a restrictive one — because a `select using(true)`
  is what caused the (accepted, low-severity) invite-code-enumeration finding
  in the earlier security review, and Realtime's `postgres_changes` broadcasts
  full row payloads to anyone who can pass the table's RLS SELECT check,
  which would leak the token to every other subscriber on the same bill if it
  lived in the publicly-readable `split_guest` row. Splitting the secret into
  its own table sidesteps both problems at once.
- **Reads are public-with-obscurity, matching existing precedent.** `split_bill`,
  `split_item`, and `split_guest` (everything *except* the token) get
  `select using (true)` — the same accepted tradeoff as `invite_select using
  (true)`. Anyone with the anon key could in principle enumerate open Splitty
  bills, same as they already could enumerate invites. This is deliberately
  not hardened further: Splitty is an explicitly lower-stakes, standalone
  feature (no real ledger data, no linkage to a user's financial identity
  beyond a typed nickname), and the `share_code`/`id` values are still
  effectively unguessable for anyone trying to reach a *specific* bill.
- **`anon` gets function grants, same precedent as `invite_preview`.** Guest
  RPCs are `grant execute ... to anon, authenticated` — this app already does
  this for `invite_preview` (so an unauthenticated visitor can preview an
  invite before signing in); Splitty extends the same precedent to actual
  writes, not just a preview read.
- **Client-side identity is a browser-local secret, not a session.** The guest
  token is stored in `localStorage` (keyed by `share_code`) so revisiting the
  link on the same device resumes identity without re-entering a name. This is
  weaker than a real auth session — anyone who obtains the token (e.g. by
  sharing their own browser/device) could edit that guest's claim — but that
  matches the "no account, just a name" ask and the worst case is low-stakes
  (someone misrepresents what they ordered, same as at the actual table).

## Consequences
- Splitty is the **first** feature in this codebase where the `anon` role can
  **write**, not just read a preview. Anyone reviewing RLS policies should
  expect `split_item`/`split_guest` writes to happen exclusively through the
  RPCs listed above — a direct `.from("split_item").update(...)` from the
  client will always fail (no policy grants it), which is intentional and
  should not be "fixed" by adding a permissive RLS policy.
- If Splitty ever needs materially higher security (e.g. real money moves
  through it, not just bill-splitting bookkeeping), revisit with a stronger
  mechanism (e.g. short-lived signed tokens, or promoting guests to Supabase
  anonymous auth sessions) — tracked as a possible follow-up, not required for
  v1.
- Because there's no `auth.uid()` for guests, none of this data can ever
  relate to `group`/`expense`/`group_member` — Splitty bills are entirely
  outside the group/RLS-by-membership model those tables use. Converting a
  closed Splitty bill into a real `Expense` (a possible future phase) would
  need to happen through an authenticated RPC called by the bill's creator,
  who *does* have a real session.
