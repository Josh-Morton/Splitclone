*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 15 — Fix Tally navigation: header switches, Settings manages ✅ SHIPPED (2026-07-30)

> Fixes [BUG-001](../BUGS.md#bug-001-tally-navigation--header-should-switch-settings-should-manage).
>
> **Live.** Header ▾ opens the Tally switcher again (`aria-label="Switch Tally"`);
> each row in the switcher gained a ⋯ that opens full management for *that*
> Tally. Reachable from both the header and Settings → Tallies, since both
> open the same switcher.
>
> **The spec was wrong about one thing, and it mattered.** It said `group` was
> the only active-scoped prop on `ManageTallySheet` "so this should be a
> non-issue". In fact `members` was passed in too — from `page.tsx`'s
> `d.members`, which is *always the active Tally's*. Managing a non-active
> Tally would have shown the wrong member list **and** derived `iAmOwner`
> from the wrong membership, i.e. silently wrong permissions. Fixed properly:
> `ManageTallySheet` now loads members itself for its own `group.id` and
> refetches after add/remove, so it's correct-by-construction for any Tally
> and the caller can't pass a mismatched pair. The `members` prop is gone.
>
> Also fixed while here: `page.tsx` tracks the managed Tally by **id** and
> resolves it against fresh data each render, so a rename shows immediately
> instead of a stale snapshot; and Home's empty-state copy still said "tap
> Invite" — a button Phase 12 deleted — now points at the Tally name → ⋯.
>
> **Verified in demo with two Tallies** (created a second so the non-active
> case was real): header opens the switcher; managing non-active "Flat 4B"
> showed its own 4 members while "Beach trip" (1 member) was active;
> renaming it updated the sheet title live and left the active Tally alone;
> Cancel returns to the switcher rather than dumping you home; switching
> still works and closes the sheet. 53 tests + build + lint green; console
> clean.

## Goal
Un-invert the navigation Phase 12 introduced. The header (▾ next to the Tally
name) is the app's fastest-access control and should do the *frequent*
thing — switch between Tallies. Managing one Tally's settings (rename,
members, default split, delete/leave) is the *rare* thing and belongs behind
a deliberate trip into Settings.

## What's wrong today (exact wiring)
- `page.tsx`'s header button: `onClick={() => setSheet("manageTally")}`,
  `aria-label="Manage Tally"` → opens `ManageTallySheet` for the active Tally.
  **No switcher is reachable from here at all.**
- `settings-sheet.tsx`'s "Tallies" row: `onClick={onManageSpaces}` →
  `page.tsx` wires `onManageSpaces={() => setSheet("spaces")}` → opens
  `SpacesSheet` (switch / create / join only — Phase 12 trimmed its inline
  per-row manage panel away entirely).

So today: header = manage (wrong), Settings = switch-only (incomplete — no
path to management at all, anywhere).

## The fix
1. **Header tap → `SpacesSheet`** (the switcher). Change `page.tsx`'s header
   button to `onClick={() => setSheet("spaces")}`, `aria-label="Switch Tally"`.
   This alone restores fast switching and matches pre-Phase-12 muscle memory.
2. **Settings → Tallies → view *and* manage.** `SpacesSheet` needs a way to
   reach `ManageTallySheet` per row again — Phase 12 removed its old inline
   ⋯-button manage panel entirely when it built the consolidated screen; that
   capability doesn't need to come back *inline*, it just needs a doorway to
   the (still-existing, still-correct) `ManageTallySheet`.

   **Recommended shape** (closest to the proven pre-Phase-12 pattern, no new
   interaction paradigm to learn):
   - Each row in `SpacesSheet` keeps its tap-to-switch behaviour.
   - Add back a small **⋯** (or "Manage") affordance per row that opens
     `ManageTallySheet` for *that* row's Tally — not only the currently-active
     one. This means `ManageTallySheet` needs to accept a `group` that isn't
     necessarily `activeGroupId` (check its current props — it's already
     typed to take an explicit `group: Group`, so this should be a non-issue;
     confirm the caller passes the *tapped* group, not the active one, when
     opened this way).
   - `SpacesSheet` needs a `onManage: (group: Group) => void` callback (or
     similar) that `page.tsx` wires to open `ManageTallySheet` with that
     specific group, distinct from the existing `sheet === "manageTally"`
     path used for the settle/add-expense-adjacent header flow (both can
     point at the same `ManageTallySheet` component, just with different
     `group` props and a small piece of state for "which Tally is being
     managed" when opened from within the switcher).
3. **Copy check:** `SpacesSheet`'s description text currently says "to
   rename it, manage members or change its split method, tap its name at the
   top of the app" (written for the Phase-12 shape) — update it to point at
   the new ⋯/Manage affordance instead, since the header no longer does that.

## Non-goals
- No change to `ManageTallySheet`'s own content (rename/members/split/delete)
  — it's correct, it's just reached from the wrong place today.
- No change to the underlying repo methods, RLS, or the
  `default_split_method` migration from Phase 12 — this is purely a
  navigation/entry-point fix.
- Not reopening the "should management be one consolidated screen at all"
  question — Phase 12's consolidation of rename+members+split+delete into one
  sheet is not in question, only *which UI opens it*.

## Verify
- Header tap switches Tallies again (with create/join still available).
- Settings → Tallies shows every Tally, tapping a row still switches to it,
  and the new ⋯/Manage affordance opens full management for *that* Tally
  (including when it isn't the currently active one — this is the part most
  likely to regress if `ManageTallySheet` quietly assumed "active" anywhere).
- Existing `ManageTallySheet` behaviour (owner/non-owner permissions,
  zero-balance guards, last-Tally guards) is unchanged — this phase doesn't
  touch that component's internals, only what opens it and with which Tally.
- `npm test` + build + lint green; browser-verify both entry points in the
  demo before shipping.

## Build order
1. `page.tsx`: header `onClick`/`aria-label` swap to open `SpacesSheet`.
2. `SpacesSheet`: add the per-row ⋯/Manage affordance + `onManage` callback;
   update the description copy.
3. `page.tsx`: wire the new callback to open `ManageTallySheet` with the
   tapped (not necessarily active) group; add whatever small piece of state
   is needed to track "which Tally is being managed" separately from
   "which Tally is active."
4. Verify per the list above; update this file to ✅ SHIPPED and
   [BUGS.md](../BUGS.md)'s BUG-001 entry to fixed, per CLAUDE.md.
