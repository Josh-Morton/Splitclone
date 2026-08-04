*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 17 — Unified shopping list across Tallies ✅ SHIPPED (2026-08-04)

> Requested by Josh while using the app with multiple Tallies.
>
> **The spec below is kept as written.** The shipped section at the bottom
> records what was actually built and the two decisions the spec left open.

## Goal
Three related changes to the List tab, all from the same real usage
friction: belonging to more than one Tally currently means the shopping
list is invisible unless that Tally happens to be active.

1. **One List tab, all your Tallies reachable from it** — not a per-Tally
   screen you can only see by switching the whole app's active Tally first.
2. **Drop the price estimate field entirely** on add. (Phase 13 kept it as a
   pure non-counted indicator; Josh has now decided it's not worth the input
   step at all — remove it, don't just stop displaying it.)
3. **Default new items to the currently-active Tally, with a dropdown to
   pick a different one** — so adding to the list you're already in stays a
   single tap, but adding to another Tally's list doesn't require switching
   the whole app first.

## Decided shape (asked, confirmed by Josh)
**Tabs/segments within the List tab itself**, not a merged single list. A
small Tally switcher lives at the top of the List screen, independent of
which Tally is active everywhere else in the app — pick a segment, see that
Tally's list, exactly as it looks today. This is simpler than a merged
grouped view and doesn't require redesigning the to-buy/Sorted layout at
all — it's the same `ListTab` content, just re-scoped per segment instead of
hardcoded to `groupId` from the active Tally.

```
[ Flat 4B ] [ Beach trip ]
  ☐ Milk
  ☐ Eggs
  — Sorted · 2 —
  ...
```

## Detail

### 1. Per-Tally segments
- `ListTab` currently takes a single `groupId` prop from `page.tsx` (always
  the active Tally's). It needs to instead take the full list of Tallies the
  user belongs to (`d.groups`, same shape `SpacesSheet` already gets) and
  manage its own "which segment is selected" state internally — defaulting
  to the currently-active Tally on first open.
- Switching segments here is **local to the List tab** — it must NOT change
  `d.groupId` / the app's active Tally elsewhere (Home, Expenses, Reports
  stay on whatever Tally is actually active). This is a deliberate,
  Josh-confirmed distinction from the Phase 15 switcher, which does change
  the active Tally everywhere.
- `repo.subscribeShoppingItems(groupId, ...)` (realtime) needs to follow the
  selected segment, not the active Tally — resubscribe on segment change.

### 2. Drop the price estimate
- Remove the estimate `Input` and its "R est" column from the add-row and
  from every list row entirely (not just hide it) — `estPriceCents` becomes
  fully unused in the add flow.
- **Decide during implementation:** does `ShoppingItem.estPriceCents` stay in
  the domain type / DB column as a nullable, no-longer-writable leftover
  (cheapest, no migration), or does it get a real migration to drop the
  column? Given Phase 13's own precedent (`completed_at` couldn't be
  backfilled honestly for old rows), simplest is almost certainly: stop
  writing it, leave the column and type field as always-`null` for new rows,
  don't migrate. Only worth a real migration if `estPriceCents` has zero
  other readers after this — grep before deciding.

### 3. Default-Tally + dropdown on add
- The add-item row needs a Tally picker (dropdown/pill), pre-set to whichever
  segment is currently selected in the List tab (which itself defaults to
  the app's active Tally) — so the fast path (add to what you're looking at)
  stays one tap, and switching it before submitting targets a different
  Tally's list without leaving the screen.
- Cross-check against the segment picker from #1: are these the same
  control (picking a segment also sets where "add" targets, no separate
  dropdown needed) or two separate pickers (view one Tally's list while
  quick-adding to another)? **Recommend the same control** — simpler, matches
  "seamless" as Josh described it, and avoids a confusing state where the
  add-target and the visible list disagree silently. Only build a second,
  independent add-target picker if that recommendation is rejected.

### 4. Notifications stay per-Tally (already correct — verify only)
Josh confirmed crossing an item off should "alert the relevant room" — this
already happens: [Phase 9](phase-09-push-notifications.md)'s
`shopping_item_checked_push()` trigger resolves recipients from
`group_member` scoped to the item's own `group_id`, not the viewer's active
Tally. Nothing to change here structurally; just confirm it still holds once
the List tab can display a non-active Tally's items (i.e. don't
accidentally scope the trigger, or a client-side echo suppression, to the
*viewer's* active group instead of the *item's* group).

## Non-goals
- Not a merged/grouped single list (considered, rejected in favor of
  segments — simpler, no new layout to design).
- Not changing what "Sorted" means or its dated Added/Bought behaviour
  (Phase 13) — untouched.
- Not part of the performance work — the ~1s toggle delay Josh also reported
  today is a different root cause (no optimistic UI), tracked in
  [Phase 16](phase-16-performance.md) instead. Both will visibly compound if
  fixed separately in the wrong order — worth doing Phase 16's optimistic-UI
  fix for the toggle *before or alongside* this phase's segment switching,
  or a segment switch will feel exactly as sluggish as today's single list.

## Verify (once built)
- Belonging to 2+ Tallies: List tab shows a segment per Tally; switching
  segments doesn't change the active Tally anywhere else in the app
  (Home/header/Expenses stay put).
- Adding an item defaults to the selected segment's Tally; changing the
  picker before submitting adds it to the other Tally instead — confirm via
  a reload that it landed in the right group's list, not the previously
  active one.
- No price-estimate input or column appears anywhere in the add flow or list
  rows.
- Crossing off an item in a *non-active* Tally's segment still sends that
  Tally's push notification to its members, not the viewer's active Tally's
  members.
- `npm test` + build + lint green; browser-verify with two demo Tallies
  (same approach used to verify Phase 15).


---

# Shipped — 2026-08-04

## Built
- **A segmented control across the top of the List tab**, one pill per Tally,
  defaulting to the app's active Tally. Hidden entirely when you only belong
  to one Tally — there'd be nothing to choose between.
- **That same control is the add target** (the spec's recommendation, and what
  Josh described as seamless). The input's placeholder reads
  "Add to Beach trip…" and the subheading "Adding to Beach trip — everyone in
  it sees the same list", so where an item will land is never a guess. A
  second, independent picker would have allowed the visible list and the add
  target to disagree silently.
- **Segment choice is local to this tab** — it does not change the Tally the
  rest of the app is in. When the app's *active* Tally changes, the segment
  follows it, so the two can't drift apart.
- **Realtime follows the segment**, re-subscribing on change, so the live feed
  is always for the list actually on screen.
- **The price estimate is gone** — input, per-row column, and the "rough
  guide" note.

## The two decisions the spec left open
1. **`estPriceCents`: removed from the client, kept in the database.** After
   the UI went, its only remaining readers were plumbing (domain type, both
   repo mappers, demo seeds), so leaving it would have been exactly the dead
   scaffolding this project avoids — it's now fully gone from `src/`. The
   **`shopping_item.est_price_cents` column is deliberately left in place**:
   dropping it would irreversibly destroy real values on existing production
   rows for a purely cosmetic cleanup. It is simply never read or written now.
   Revisit only if there's a reason beyond tidiness.
2. **One control, not two** — as recommended above.

## Also handled
- **A new item is pinned to the Tally it was added to**, even if the segment
  changes while the write is in flight: the target is captured up front and
  the optimistic append is guarded against a live ref, so a row can never
  appear under the wrong Tally.
- **A stale segment self-heals.** If the picked Tally is deleted or left, the
  selection falls back to the active one rather than showing an empty list for
  something that no longer exists.

## Verified
Demo, one Tally: no segments, no estimate input, no price column, Sorted
section and its Added/Bought dates untouched. With two Tallies: both segments
render, default to the active one, and switching shows that Tally's own items
with the placeholder updating. **Adding "Sunscreen" while viewing the
non-active Beach trip put it in Beach trip and *not* in Flat 4B**, and it
survived a segment round-trip (a real re-read, not just optimistic state).
Switching the app's active Tally re-pointed the segment at it. Crucially,
**switching segments never changed the app's active Tally** — verified by
returning to Home each time. Console clean; 74 tests + build + lint green.

Push notifications confirmed unchanged and correct: `shopping_item_added_push`
and `shopping_item_checked_push` both resolve recipients from `new.group_id`
— the *item's* Tally, not the viewer's — so crossing something off in a
non-active segment still alerts the right people.

## Not done
- Segment choice **resets to the active Tally when you leave and re-enter the
  List tab** (the component unmounts). That matches the spec's "defaults to
  the active Tally on first open"; making it persist would need to lift the
  state up. Left as-is unless it grates in real use.
- Sorted, its dates, and the optimistic behaviour from Phase 16 are all
  untouched.
