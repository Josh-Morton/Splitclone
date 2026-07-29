*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 12 — Tally management & terminology rename 📝 SPEC ONLY — NOT BUILT (2026-07-29)

> **Status: fully specced, zero code written.** Josh: "add these to the
> backlog," scoped into a phase since each is substantial enough to need a
> real plan first, matching the convention set by Phases 8–11.

## Goal
Three related changes, all about the "space" concept:
1. Rename "space"/"household" → **"Tally"** everywhere a user sees it.
2. Consolidate space management into **one screen**, reachable by tapping
   the space name — replacing today's split between the header's "Spaces
   switcher" and the separate "Invite" button.
3. A per-Tally **default split method** that pre-selects on new expenses.

## 1. Terminology rename — UI copy only
**Scope decision:** user-facing copy only. **Not** renamed: the `Group`/
`GroupMember` TypeScript types, the `group`/`group_member` database tables
and columns, repo method names (`listGroups`, `createGroup`, etc.), or
internal step IDs like `onboarding`'s `"space"` step. Same reasoning Phase 10
already applied to the Supabase project ref: renaming the schema is a real
migration (FK renames across `group_member`, `expense`, `settlement`,
`activity`, `invite`, `shopping_item`, `recurring_expense`) on **live
production tables**, for zero user-visible benefit beyond what a copy-only
pass already delivers. This also matches how Phase 6 did the original
SettleUp → Tally rename — product name changed, code identifiers didn't.

**Full inventory of strings to change** (grepped, not guessed):

| File | Old | New |
|---|---|---|
| `spaces-sheet.tsx` | Sheet title `"Spaces"` | `"Your Tallies"` *(see note below — this screen's role shrinks in §2)* |
| `spaces-sheet.tsx` | "A space is a household, trip, or shared budget…" | "A Tally is a household, trip, or shared budget…" |
| `spaces-sheet.tsx` | "Give the space a name" (×2) | "Give the Tally a name" |
| `spaces-sheet.tsx` | "Space renamed" | "Tally renamed" |
| `spaces-sheet.tsx` | "You need at least one space — create/join another first." | "…one Tally…" |
| `settings-sheet.tsx` | Row label `"Spaces"`, hint "Switch, create, rename or delete" | Label `"Tallies"`, hint updated per §2 |
| `settings-sheet.tsx` | "Let the household see my salary figure" | "Let the Tally see my salary figure" |
| `invite-sheet.tsx` | "Remove from space" | "Remove from Tally" |
| `invite-sheet.tsx` | "…lands in this household." / "…in our household." | "…in this Tally." / "…in our Tally." |
| `activity-overlay.tsx` | `` `${actor} joined the household` `` | `` `${actor} joined the Tally` `` |
| `page.tsx` | fallback `groupName ?? "Household"` | `?? "Tally"` |
| `page.tsx` | `" · demo household"` | `" · demo Tally"` |
| `page.tsx` | "…start your real household." | "…start your real Tally." |
| `page.tsx` | `aria-label="Switch space"` | `aria-label="Manage Tally"` *(role changes — §2)* |
| `onboarding/page.tsx` | default name `"Our household"` | `"Our Tally"` |
| `onboarding/page.tsx` | "Give your household a name" | "Give your Tally a name" |
| `onboarding/page.tsx` | "Create your household" / "Create household" | "Create your Tally" / "Create Tally" |
| `onboarding/page.tsx` | Label "Household name" | "Tally name" |
| `welcome/page.tsx` | "Skip — explore the demo household" | "Skip — explore the demo Tally" |

**Plural spelling:** "Tallies" (standard English pluralization — matches
"rally → rallies"). If "Tallys" is preferred as a brand-style plural instead,
it's a one-line swap in the table above, not a design decision worth
blocking on.

## 2. Consolidated "Manage this Tally" screen
Today: tapping the header space name opens a **Spaces switcher** (list of
every Tally you're in, tap to switch, ⋯ per-row for rename/delete/leave); a
separate **"Invite"** header button opens member list + add/remove +
invite-code creation. Two different mental models for what's really one
concept.

**New structure (Josh's choice — consolidate):**
- **Tapping the space name** now opens **"Manage this Tally"** — everything
  about the *currently active* Tally in one screen:
  - Rename (owner only)
  - Default split method (§3, all members can view, only owner changes it —
    same permission shape as `simplifyDebts`)
  - Members: the list + remove (owner only) + invite-code creation, i.e.
    today's entire `invite-sheet.tsx` content moves here
  - Delete this Tally (owner only) / Leave this Tally (non-owner only) —
    today's per-space manage-panel logic from `spaces-sheet.tsx`, unchanged
    behaviour (zero-balance guard, "at least one Tally must remain," etc.)
- **The standalone "Invite" header button is removed** — folded into Manage,
  since having two entry points for the same underlying concept (who's in
  this Tally) is exactly what's being un-split.
- **Switching between Tallies** (today's `SpacesSheet` list-with-a-checkmark)
  becomes a smaller, separate entry point: **Settings → "Tallies"** row
  (relabelled from "Spaces"), plus **Create a Tally** / **Join with a code**
  live there too, same as today. This screen no longer needs a per-row ⋯
  manage button — managing is now the *active* Tally's own screen, reached
  by switching to it first, then tapping its name.

**Implementation shape:** new component (e.g. `manage-tally-sheet.tsx`)
merging `invite-sheet.tsx`'s member/invite content with `spaces-sheet.tsx`'s
per-space manage-panel content (rename/delete/leave), plus the new default-
split-method control. `spaces-sheet.tsx` shrinks to just the switch/create/
join list. `page.tsx`'s `sheet` union type drops `"invite"`, gains
`"manageTally"`; the header space-name button's `onClick` points at it
instead of `"spaces"`.

## 3. Default split method per Tally
**Migration:** `"group"` gains
`default_split_method split_method not null default 'equal' check (default_split_method in ('equal','exact','salary'))`
— reusing the existing `split_method` enum, constrained to the three methods
actually exposed in the UI (percent/shares exist in the enum for legacy/
domain-layer reasons but were deliberately never surfaced — see
`docs/BACKLOG.md`'s design-fidelity note).

**Repo:** `setDefaultSplitMethod(groupId: string, method: "equal" | "exact" | "salary"): Promise<Group>`
— mirrors `setSimplifyDebts` exactly (same owner-gated RLS shape, same
"returns the updated Group" contract). `Group` domain type gains
`defaultSplitMethod: "equal" | "exact" | "salary"`.

**Behaviour change, precisely scoped:** in `add-expense-sheet.tsx`, the
`method` state's initial value changes from the hardcoded `"salary"` to
`activeGroup.defaultSplitMethod`. **That is the entire behavioural change.**
Everything downstream is already correct and untouched:
- The segmented control (Equal · Exact · Proportional) is still fully
  interactive — the default just pre-selects it, exactly like any other form
  default.
- The existing "falls back to equal if any participant has no salary set"
  logic (`proportionalFallsBack`, `computeSplit`'s `salary` case) is
  **unchanged**. If the Tally's default is "Proportional" and someone hasn't
  entered a salary, the amber fallback notice still appears and the split
  still computes as equal — exactly today's behaviour, just potentially the
  *starting* selection instead of something the user had to pick themselves.

## Non-goals
- No rename of database tables/columns/TypeScript type names — see §1.
- No per-user default split method — it's per-Tally (household-level
  convention), consistent with `simplifyDebts` already being per-Tally.
- No change to split math, reconciliation, or the salary-fallback rule.

## Build order
1. Migration: `default_split_method` column + check constraint.
2. Repo: `setDefaultSplitMethod` in both implementations; `Group` type update.
3. Terminology rename pass per the §1 table (copy only).
4. New `manage-tally-sheet.tsx` (merge invite-sheet + spaces-sheet's manage
   panel + default-split-method control); trim `spaces-sheet.tsx` to the
   switcher only; remove the standalone Invite header button; rewire
   `page.tsx`'s sheet union + header `onClick`.
5. `add-expense-sheet.tsx`: seed `method` from `defaultSplitMethod`.
6. Verify: rename didn't miss a string (grep for "space"/"household" again
   post-change); owner vs non-owner permissions in the new screen match
   today's exactly; default split method survives a page reload; existing
   Splitty (`/split/[code]`) and its own "the split" terminology are
   untouched (Splitty keeps its name — ADR-0016 already settled this).
