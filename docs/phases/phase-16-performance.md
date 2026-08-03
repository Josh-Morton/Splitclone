*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 16 — Performance: cut the reload chain 📝 SPEC ONLY — NOT BUILT (2026-07-30)

> Requested by Josh: switching Tallies, closing the add-expense sheet, and
> login all feel like a ~1000ms wait — "too slow" for a PWA that stores
> comparatively little data. Investigated on request; not implemented yet.
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
