*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 19 — User category assignments 📝 SPEC ONLY — NOT BUILT (2026-10-20)

> **Effort:** L · **Credits:** ~20–35 standalone, or **M · ~10–20** if
> [Phase 18 §2](phase-18-learning-categorisation.md#2--learned-rules-the-shared-brain)
> (the rule tables + `autoCategory(desc, rules?)`) has already landed, since
> most of the plumbing is shared. See [Estimating scale](../ROADMAP.md#estimating-scale).
>
> Requested by Josh (2026-10-20): UI flow notes for the changes needed when a
> user wants to add their own category assignment, e.g. *"always file
> 'Vida' as Coffee & café"*, *"'Sizwe' is our gardener → Cleaning & domestic
> help"*.
>
> **Needs a decision before build:** Phase 18 lists *"No user-facing rule
> editor. Corrections are implicit"* as a non-goal, and ADR-0008's principle
> is a zero-friction Add sheet. This phase deliberately reverses the first
> and has to protect the second. If agreed, record it as **ADR-0020** (amends
> ADR-0019's non-goal) before writing code.

## Goal

The engine ([CATEGORY-MATRIX.md](../CATEGORY-MATRIX.md)) knows 2 300+ words,
but it can't know a household's own vocabulary: the name of the gardener,
the local spaza, a nickname for the bond, a merchant it has never heard of.
Today a user can correct a single expense (tap the category chip → picker),
but the correction teaches nothing, so they fix the same thing every month.

An **assignment** is a rule: *term → subcategory*, scoped to one Tally. Once
saved, any expense whose description contains the term is filed there
automatically, and it beats the built-in library.

## Concepts

| Term | Meaning |
|---|---|
| **Assignment** | `{ term, slug, groupId, createdBy, createdAt, deletedAt }`. The term is stored normalised (lower-case, accents stripped, the same normaliser the engine uses), never as the raw description. |
| **Term** | One word or a short phrase (≤ 4 words, ≥ 3 characters). It matches on whole-word boundaries, exactly like a library keyword. |
| **Scope** | Per Tally. Both members of a Tally share its assignments. Nothing is global in this phase. Feeding explicit assignments into Phase 18's consensus brain is an open question (see below). |
| **Precedence** | Assignment > Phase 18 learned rule > built-in library. If several assignments match, the **longest term** wins, then the **most recent**. |

## UI flows

The Add sheet stays exactly as fast as it is today. Every flow below is
**opt-in, after the fact**: the user never has to touch a rule to save an
expense.

### Flow A — "Always file it like this?" (the main path)

Triggered when the user **overrides** the auto-detected category in the Add
or Edit sheet ([`add-expense-sheet.tsx`](../../settleup/src/components/add-expense-sheet.tsx)).

1. User types `Sizwe garden` → chip shows `Household · Garden · auto · tap to change`.
2. Taps the chip → [`CategoryPickerSheet`](../../settleup/src/components/category-picker-sheet.tsx)
   opens (unchanged) → picks **Cleaning & domestic help**.
3. Picker closes. Directly under the category chip, an **inline prompt row**
   slides in. It is not a modal and does not block Save:

   ```
   ┌──────────────────────────────────────────────┐
   │ Always file  [ sizwe ▾ ]  as Cleaning?       │
   │                         [ Not now ] [ Always ]│
   └──────────────────────────────────────────────┘
   ```

   - The `[ sizwe ▾ ]` pill is the **suggested term**, picked by the Phase 18
     term-extraction rules: drop words that are already evidence for the chosen
     category (`garden`), stopwords, numbers and amounts, and prefer the longest
     remaining distinctive token or adjacent pair.
   - Tapping the pill opens a **term chooser**: every remaining token of the
     description as a chip (`sizwe`, `garden`, `sizwe garden`), single-select.
     That lets the user teach `vida` rather than `vida sandton` without typing.
4. **Always** → the assignment is saved **with the expense** (same repo call
   or a following one; see Data). The row collapses into a quiet confirmation
   under the chip: `✓ "sizwe" will always go to Cleaning · Undo`. **Undo**
   soft-deletes the assignment, with the standard undo toast pattern.
5. **Not now**, saving without answering, or closing the sheet → no
   assignment. Never ask twice for the same term + category in the same session.
6. The chip text gains a third state: `· your rule · tap to change` whenever
   the category came from an assignment, so people can tell *auto*, *manual*
   and *rule* apart.

**Don't show the prompt when:**
- no term survives extraction (e.g. `Lunch` → Restaurant; there's nothing new to learn),
- the term is a **member's display or placeholder name in this Tally** (PII guard
  from Phase 18 §2; the user may still type it in Flow C, deliberately),
- an identical assignment already exists,
- the user is in Splitty (no Tally scope there).

### Flow B — From an expense's detail screen

[`expense-detail.tsx`](../../settleup/src/components/expense-detail.tsx) shows
`Category · full date` under the icon. Add a tappable affordance:

1. Tap the category line → `CategoryPickerSheet`.
2. Pick a category → the expense is updated (as Edit does today), then the
   same inline prompt as Flow A appears on the detail screen.
3. **Always** additionally offers *"Also re-file 4 earlier expenses with
   'sizwe'?"*: a count plus a collapsible preview list of the matching
   expenses (description · date · current category → new). **Re-file** applies
   in one batch and shows `Re-filed 4 expenses · Undo`.
   - Only expenses in this Tally, not soft-deleted.
   - **Never re-files an expense whose category was chosen by hand**, once
     Phase 18's `category_source` exists. Until then, the preview's
     checkboxes start **unticked**, so nothing is re-filed silently.

### Flow C — Settings → "Category rules" (manage everything)

A new row in the [Manage this Tally sheet](../../settleup/src/components/manage-tally-sheet.tsx),
under *Default split method*: **Category rules · 6 ›**. It opens a sheet:

```
Category rules                                 [ + Add ]
Rules for this Tally. They beat the built-in list.

 sizwe            → 🧴 Cleaning & domestic help    Josh · 3 Oct
 vida             → 🍝 Coffee & café               You · 12 Sep
 spaza            → 🛒 Supermarket                 You · 2 Sep
```

- **Row tap** → edit sheet: the term (read-only, delete-and-recreate to change
  it), the category (picker), *"Matches 7 expenses"* with the preview list, and
  **Delete rule**.
- **Delete** → soft delete with `Rule deleted · Undo`. Deleting a rule
  **never** changes expenses already filed by it. Say so in the sheet's
  helper text.
- **+ Add** → add sheet:
  1. **Words to look for**: a text input. Live helper below it, debounced like
     the description field:
     - *"Currently filed as Groceries · Supermarket (built-in)"* via `scoreCategory`,
     - or *"Not recognised yet"*,
     - or an inline error: too short (< 3 chars), too long (> 4 words),
       only stopwords or numbers, or *already a rule → edit it instead*.
  2. **File as**: category chip → `CategoryPickerSheet`.
  3. **Preview**: *"Would re-file 3 past expenses"* (expandable), with an
     opt-in **Also re-file them** checkbox, off by default.
  4. **Save rule**.
- **Empty state:** *"No rules yet. When you change an expense's category,
  Tally can remember it for next time."* plus an **Add a rule** button.
- **Permissions:** any member can add rules; anyone can delete their own; the
  Tally owner can delete any. Show the creator's name on each row, because
  rules affect both people's expenses.

### Flow D — Recurring bills

[`recurring.tsx`](../../settleup/src/components/recurring.tsx) re-derives the
category from the description each run (ADR-0011 consequence). That path must
call `autoCategory(desc, assignments)` too, otherwise a rule silently doesn't
apply to the rent debit order. No new UI; the recurring row's category simply
reflects the rule.

## Ambiguity row interplay (Phase 18 §3)

If Phase 18 §3 has shipped, picking one of the *"is it one of these?"*
candidate chips counts as an override, so it triggers Flow A's prompt in the
same place. Make sure the two rows stack rather than compete: candidates first
and, once one is picked, the prompt replaces them.

## Data & code changes

- **Domain** (`category.ts`): `autoCategory(desc, assignments?)` and
  `scoreCategory(desc, assignments?)`. An assignment hit returns immediately
  with a sentinel score above any library score, so the confidence UI treats it
  as certain. Match using the engine's own `buildCtx` / token-boundary phrase
  matching. Don't write a second matcher. Add `extractCandidateTerms(desc,
  chosenSlug, memberNames)` here too (pure, unit-tested), shared with Phase 18 §2.
- **Repo** (ADR-0005, the only data boundary): `listCategoryAssignments(groupId)`,
  `addCategoryAssignment(input)`, `deleteCategoryAssignment(id)`,
  `refileExpenses(ids, slug)`. Implement in both `MemoryRepo` (demo household:
  seed one or two rules so Flow C isn't empty) and `SupabaseRepo`.
- **Load path:** assignments ride along in the Phase 16 parallel home-screen
  batch (no extra round trip). Pass them down to the Add sheet, the detail
  screen and recurring. A failed fetch degrades to the library; categorising
  must never block on the network.
- **Migration** (`supabase/migrations/`, applied via the Management API as per
  CLAUDE.md):
  ```sql
  create table category_assignment (
    id uuid primary key,                         -- client-generated (iron rule)
    group_id uuid not null references "group"(id) on delete cascade,
    term text not null check (char_length(term) between 3 and 60),
    slug text not null,
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    deleted_at timestamptz                       -- soft delete (iron rule)
  );
  create unique index on category_assignment (group_id, term) where deleted_at is null;
  ```
  RLS: select / insert for members of `group_id` (same membership check as
  `expense`); update (soft delete) for the creator or the Tally owner. If Phase
  18's tables exist by then, consider making this an `explicit` flag on its
  local tier instead of a second table. Decide in ADR-0020.
- **Provenance:** when Phase 18 §5's `expense.category_source` exists, set it to
  `rule` for assignment hits so backfills and re-files can tell them apart.
- **Docs:** add an *Assignments* section to `CATEGORY-MATRIX.md` explaining
  precedence; regenerate it.

## Edge cases

- **Assignment points at a legacy slug** (e.g. `other_insurance`): store
  whatever the picker returns. The picker never offers legacy slugs, so this
  can only come from old data. `categoryMeta` resolves it anyway.
- **Two members' rules conflict** (`vida` → Coffee vs `vida` → Restaurant):
  the unique index allows one live rule per term, so the second save shows *"Josh
  already files 'vida' as Coffee & café. Replace?"*
- **The term is also a built-in brand** (`spur` → Hobbies): allowed, since
  assignments win. Show *"This overrides the built-in Restaurant match"* in
  the add sheet so it's deliberate.
- **Description edited later:** the category re-derives only while the expense
  is in *auto/rule* state; a manual pick sticks (current behaviour).
- **Offline** (Phase 2 deferred): out of scope until the outbox exists. Saving
  a rule requires a connection; show the standard error state.
- **Splitty:** no assignments (no Tally); the prompt never shows.
- **Foreign-currency expenses:** irrelevant, since rules key off the description only.

## Design / accessibility

- Tokens only (ADR-0007): prompt row uses the category's parent colour via
  `color-mix()`, like the chip it sits under. Pill geometry from Phase 11.
- Prompt buttons are real `<button>`s with ≥ 44 px targets; the term pill has
  `aria-haspopup="listbox"`; the confirmation is announced via `aria-live="polite"`.
- No new modal layers. The prompt is inline; the term chooser and rule sheets
  reuse `Sheet`.

## Non-goals

- **User-created categories or subcategories.** The taxonomy stays fixed
  (ADR-0011). An assignment only maps words onto existing buckets. A "custom
  category" feature would be its own phase: reports, export, colours and glyphs
  all assume the fixed set.
- Regex, wildcard, amount-based or payer-based rules.
- Rules shared across Tallies, or published to the global brain without consent.
- Bulk import/export of rules.

## Open questions

1. Should an explicit assignment also cast a Phase 18 consensus vote? It is
   stronger evidence than an implicit correction, but it's also where PII is
   most likely (people name their gardener). Suggested default: **no**, local only.
2. Does deleting a rule offer to *un*-file what it filed? Suggested: no.
   Deletes are about the future; show that in the helper copy.

## Build order

1. Domain: `assignments?` parameter on `autoCategory` / `scoreCategory`,
   `extractCandidateTerms`, tests (precedence, longest-term-wins, PII guard,
   boundary matching).
2. Migration + RLS + repo methods (Memory + Supabase), load in the home batch.
3. Flow A (prompt in Add/Edit) and the third chip state.
4. Flow C (Manage this Tally → Category rules).
5. Flow B (detail screen + re-file preview).
6. Flow D (recurring uses assignments).
7. Regenerate `CATEGORY-MATRIX.md`; ADR-0020.

## Verify

- Override `Sizwe garden` → Cleaning → **Always** → the next `Sizwe` expense
  auto-files to Cleaning with the chip showing *your rule*.
- The other Tally member sees the rule and gets the same auto-filing; a second,
  unrelated Tally does not.
- Prompt never offers a member's name as the suggested term.
- **Undo** after **Always** removes the rule; the saved expense keeps its category.
- Deleting a rule in Flow C doesn't change any existing expense.
- Re-file preview starts unticked; ticking 2 of 4 re-files exactly 2, with undo.
- A recurring bill whose description matches a rule files under the rule.
- RLS: a non-member can neither read nor insert assignments for the Tally
  (expect rejection); a member can't soft-delete another member's rule unless owner.
- `npm test` + build + lint green; flows browser-verified in the demo household
  and spot-checked against live Postgres on a throwaway Tally.
