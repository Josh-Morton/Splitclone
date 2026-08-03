*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 16 — Performance: cut the reload chain ✅ SHIPPED (2026-07-31)

> Requested by Josh: switching Tallies, closing the add-expense sheet, and
> login all feel like a ~1000ms wait — "too slow" for a PWA that stores
> comparatively little data.
>
> **The investigation notes below are kept as originally written**, including
> where they turned out to be incomplete — the shipped section at the bottom
> records what the fix actually found and did.
>
> **2026-07-30 update — a concrete, named instance of finding #4.** Josh
> separately reported the shopping list specifically: ticking an item off
> should move it to Sorted "quickly," but there's a solid one-second delay.
> Confirmed in [`list-tab.tsx`](../../settleup/src/components/list-tab.tsx)'s
> `toggle()`:
> ```
> async function toggle(item: ShoppingItem) {
>   await repo.setShoppingItemChecked(item.id, !item.checked);
>   await load();
> }
> ```
> Two full sequential round trips (the write, then a full re-list) before
> anything on screen moves — textbook case of finding #4 (no optimistic UI).
> Folded in here rather than a separate phase since it's the same root cause
> and Josh explicitly called it "part of the large [performance] initiative."
> The list-specific UX rework (unified cross-Tally list, drop the price
> estimate, default-Tally picker on add) is a different, feature-shaped
> change — that's [Phase 17](phase-17-unified-shopping-list.md) instead.

## Investigation findings

The delay isn't one slow call — it's that **almost every user action re-runs
the entire home-screen load from scratch, sequentially**, instead of updating
just what changed.

### 1. `load()` in `page.tsx` is the single reload path for everything
Switching Tallies, saving/editing/deleting an expense, settling up, renaming
a Tally, adding/removing a member, closing *any* sheet that calls
`onChanged` — all of them end in the same `await load()`. There's no partial
update anywhere; a one-field rename triggers the exact same fetch as opening
the app cold.

### 2. That reload is a chain of sequential round trips, not parallel ones
`load()` → `loadHome()`, both `async function`s awaiting each other step by
step:
```
getCurrentUser()        // auth.getUser() + a profile query — 2 round trips
  → getProfile()        // ANOTHER profile query — redundant with the one above
    → listGroups()
      → loadHome():
          processDueRecurring()   // an RPC call, awaited alone, blocking
          → Promise.all([         // only THIS part is parallel
              getCurrentUser(),   // called a 2nd time, redundant
              listMembers(), listExpenses(), listSettlements(),
              listGroups(),       // called a 2nd time, redundant
              listRecurring(),
            ])
```
Counting round trips: `getCurrentUser` runs twice (4 queries total),
`listGroups` runs twice, `getProfile` fetches data `getCurrentUser` already
fetched a version of, and `processDueRecurring` blocks the whole
`Promise.all` behind it despite having nothing to do with 5 of those 6
queries. That's on the order of **9–10 sequential/duplicated network round
trips** before the home screen can render — on Supabase's free-tier pooler,
each one plausibly 80–150ms, which alone accounts for the ~1000ms.

### 3. Login doubles up with the exact same chain
`postAuthDestination()` (`src/lib/routing.ts`) — called right after
sign-in — does its own `getCurrentUser()` + `listGroups()`, then redirects to
`/`, where `HomePage` immediately runs the *entire* chain above again from
scratch. Every login pays for `getCurrentUser`/`listGroups` twice over before
even reaching the redundancy already described in #2.

### 4. No optimistic UI anywhere in this path
Every sheet (`add-expense-sheet.tsx`, `manage-tally-sheet.tsx`,
`spaces-sheet.tsx`, `settle-sheet.tsx`) shows nothing changed until the
full reload above resolves — a switch or a save just sits there, then
everything repaints at once. Even if the round-trip count were fixed, the
perceived delay would still read as "stuck" without local state updating
first.

## Non-findings (checked, not the cause)
- No obviously oversized payloads — `listExpenses` etc. are plain
  `select("*")` on a two-person household's data, not the bottleneck at this
  scale.
- No sign of N+1 queries inside any single `list*` method — each one is a
  single `select`.
- The repo pattern (ADR-0005) isn't itself the problem — `SupabaseRepo`'s
  individual methods are reasonably shaped; the problem is entirely in how
  `page.tsx` sequences and duplicates calls around them.

## Direction for the fix (not scoped in detail yet — do this before building)
- **Deduplicate the chain first** — cheapest win, no architecture change.
  `getCurrentUser`/`listGroups` should each run once per `load()`, not twice;
  `getProfile`'s useful fields should come from the same round trip as
  `getCurrentUser` rather than a second query.
- **Parallelize what doesn't depend on what** — `processDueRecurring` only
  gates `listExpenses`/`listRecurring` being fully up to date; it doesn't
  need to block `listMembers`/`listSettlements`/`listGroups` from starting.
- **Stop reloading everything for a partial change.** A rename only needs
  `groups` updated; adding an expense only needs `expenses`/`settlements`
  refreshed, not `groups`/`members`/`recurring` too. Consider whether
  individual repo mutations (`renameGroup`, `createExpense`, etc.) can return
  the updated row so the caller merges it into state instead of refetching
  everything.
- **Optimistic UI for the common actions** (switch Tally, add expense,
  settle) — update local state immediately, reconcile with the server
  response in the background, roll back on error. This is the one that
  actually fixes the *feel* of snappiness even if some round-trip count stays.
- Login specifically: `postAuthDestination`'s `getCurrentUser`/`listGroups`
  results could be threaded into the first `load()` instead of being thrown
  away and refetched.

## Non-goals (until scoped further)
- Not a new caching layer, service worker cache of API responses, or
  Phase 2's offline-first architecture (ADR-0009 — deliberately still last).
  This is about removing waste in the existing online-only path, not
  building an offline store.
- Not a database/index audit — no evidence yet that any single query is slow
  server-side; the symptom so far is round-trip *count*, not per-query time.

## Verify (once built)
- Measure before/after with the browser's network panel: round-trip count
  and wall-clock time from action → repaint, for: switch Tally, save an
  expense, settle up, and login → home.
- Confirm no behavior regresses — every place that currently reloads on
  purpose (e.g. picking up a bill that came due) still does so correctly,
  just without the redundant duplicate calls.


---

# Shipped — 2026-07-31

Implemented at Josh's request ("this is quite a universal performance issue —
use your own deduction to diagnose which areas may also be experiencing this,
and make sure no functionality is affected").

## The finding the original investigation missed
The spec above blamed round-trip *count*. That was right but incomplete. The
larger cause was **`supabase.auth.getUser()`**, which this codebase used in
`uid()` (before every write) and `getCurrentUser()` (twice per home load).

`getUser()` is **not** a local read — verified in the installed auth-js
(`GoTrueClient._getUser` always issues `GET {url}/user` over HTTPS, with no
caching). So every single write paid a full round trip to Supabase's auth
server *before starting the actual work*, and every home load paid two.

Swapped to **`getSession()`**, which reads the cached session and only hits
the network when the token has genuinely expired — it still auto-refreshes
(confirmed at `GoTrueClient._useSession` → `hasExpired` → `_callRefreshToken`).
Safe because the client-side id was never a security boundary: it stamps
`created_by`/`updated_by` and drives "is this me?" in the UI, while RLS
re-derives `auth.uid()` from the JWT server-side. Josh approved this
explicitly after the trade-off was laid out.

## Also found and fixed (the "universal" sweep)
**Four write-then-refetch methods**, each re-reading the row it had just
written — and *every caller discards the return value*, so the extra round
trip bought nothing:
- `updateProfile` — update, then `getProfile`. Now `.select().single()`.
  **On the Tally-switch path**, so this was directly in Josh's ~1s complaint.
- `createExpense` — RPC, then a full `getExpense` (which drags in every payer
  and split row). The RPC `returns setof expense` and the payers/splits it
  wrote are exactly what we sent, so the result is now built from those.
  **This sat between tapping Save and the sheet closing.**
- `updateExpense` — same shape, same fix.
- `createRecurring` — insert, then `listRecurring()` (fetching *every* rule in
  the Tally) to `.find()` the one just made. Now maps the insert's own row.

**Receipt upload** (`attachReceipt`/`removeReceipt`) called `getExpense` — a
multi-table embedded select — purely to read one column. Now selects just
`group_id` / `receipt_url`.

**Login** (`postAuthDestination`) ran `getCurrentUser` then `listGroups`
serially on every sign-in; now parallel.

## The load chain itself
`getCurrentUser` and `listGroups` each ran **twice** per load; `getProfile`
re-read the same row `getCurrentUser` had already touched. Added `getMe()`
(user + profile from one row, one query) and now pass `user`/`groups` into
`loadHome` rather than refetching. `processDueRecurring` no longer gates the
reads — it runs alongside them, and only when it actually generates something
are `expenses`/`recurring` re-read (per Josh's choice).

**Serial round trips on the home screen: ~7 → ~2**, plus one less on every
write.

## Optimistic UI (shopping list)
Per Josh's choice, scoped to the list. `toggle`/`add`/`remove`/`clearSorted`
apply to local state immediately and reconcile in the background; on failure
they surface the error and re-read the server's truth so the UI can't lie.
**Measured: an item moves to Sorted in ~4ms (one animation frame)** versus
two round trips before.

## Verified — no functionality changed
Browser-tested in the demo end to end: home renders with correct balances;
add expense R836,86 → R911,86 (R100 split 4 ways = +R75, exact); edit that
expense to R200 → R986,86 (+R75, exact); splits reconcile to the cent; create
Tally, switch between two Tallies, balances restore correctly; list
toggle/put-back/add/remove/clear all instant AND still correct after a forced
refetch. Console clean. 53 tests + build + lint green.

Confirmed against the live schema that `expense` carries every column
`mapExpense`/`syncMeta` read, and that both RPCs `return setof expense` — so
the constructed return values are exact, not approximations.

## Deliberately not done
- **`listMembers`' two queries** (members, then `profile_public` for names).
  The second depends on the first's ids, and joining to a view risks breaking
  name hydration for a saving of one round trip inside an already-parallel
  batch. Left alone.
- **Partial updates instead of full reloads.** The reload is now cheap enough
  that the added state-reconciliation risk isn't justified. Revisit only if
  it's still slow with real data.
- Nothing here touches Phase 2's offline-first architecture (ADR-0009), which
  is still deliberately last.
