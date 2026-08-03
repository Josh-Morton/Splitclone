*(Part of the [Tally roadmap](ROADMAP.md).)*

# Bug reports

Confirmed defects — behaviour that doesn't match intent, whether that's a
regression from a previous phase or something that was never quite right.
Different from [`docs/BACKLOG.md`](BACKLOG.md) (loose ends and deferred ideas
that were never built) and [`docs/phases/`](phases/) (planned or shipped
*feature* work) — a bug is something that **was already built and doesn't
work as intended**.

## How to log a bug here
- One entry per bug: title, status, reported date, severity, what's wrong,
  expected behaviour, root cause (if known), suggested fix.
- If the fix is substantial enough to need a real implementation plan,
  promote it to a phase file under `docs/phases/` — same convention as a
  backlog item that grows into a phase — and link to it from the entry here.
  The entry in this file stays the permanent record of what was wrong and
  why; the phase file is the working plan for fixing it.
- Add a row to the table in [`docs/ROADMAP.md`](ROADMAP.md) only if the bug
  was promoted to a phase — this file itself isn't indexed there beyond the
  one link, same treatment as `BACKLOG.md`.
- Mark fixed bugs with ~~strikethrough~~ plus the phase/commit that fixed
  them — don't delete the history, same rule as everywhere else in this repo.

## Open bugs

### BUG-002: Add-expense fails with "member is not in the expense's group" after switching Tallies
**Reported:** 2026-07-30 (Josh) · **Status:** Open, root cause confirmed —
small fix, no phase needed · **Severity:** Data-loss risk (the save fails
outright) — not silent corruption, but blocks logging an expense until the
app is restarted.

**What's wrong.** Saving an expense sometimes fails with a Postgres error
naming a member id and saying it "is not in the expense's group" (Josh's
paraphrase: "member 2a571c... is not part of this expense group which they
clearly are"). Restarting the app fixes it. Reported after the app had been
open a while — but see root cause below, idle time isn't actually the
trigger.

**Root cause — confirmed by reading the code, not guessed.** The exact error
text comes from `check_member_in_expense_group()`
(`supabase/migrations/20260702000000_phase1_schema.sql:158`): a trigger on
`expense_payer`/`expense_split` that rejects a `member_id` whose
`group_member.group_id` doesn't match the expense's `group_id`. That only
fires when the client actually sends a mismatched member id — and it can,
because of [`page.tsx`](../settleup/src/app/page.tsx)'s remount key on
`AddExpenseSheet`:
```
key={`${editing?.id ?? "new"}:${activeGroup?.defaultSplitMethod ?? "equal"}`}
```
This was written (Phase 12) to remount the sheet — resetting its internal
`parts`/`payerId`/`exact` state, which only ever initializes once via
`useState` — whenever the *split method* changes. But it doesn't include
`groupId`. **Switch from one Tally to another that happens to have the same
default split method** (e.g. both "Equal" — the default for every existing
Tally) **and the key string is identical, so React does not remount the
sheet.** `groupId` and `members` props update to the new Tally silently, but
`parts` (the selected participants) keeps the *previous* Tally's
`group_member` ids. Submitting then sends those stale ids against the new
`groupId` — exactly the mismatch the trigger correctly rejects. This also
explains why "even the proportional splitting works as expected": the
client-side math in `getSalaryShares`/`splitEqual` doesn't validate
membership at all, only the database trigger does, right at save time.

**Suggested fix.** Add `groupId` to the remount key (e.g.
`` `${editing?.id ?? "new"}:${groupId}:${activeGroup?.defaultSplitMethod ?? "equal"}` ``)
so any Tally switch forces a fresh `parts`/`payerId`/`exact` init regardless
of whether the two Tallies share a default split method. Small, contained
change — one line, no migration, no phase file needed. Worth adding a test
or at least a manual check: open Add on Tally A, switch to Tally B (same
default split), reopen Add, confirm the participant list is B's members, not
A's stale ids.

## Fixed

### ~~BUG-001~~: Tally navigation — header should switch, Settings should manage
**Reported:** 2026-07-30 (Josh) · **Status:** ✅ Fixed in
[Phase 15](phases/phase-15-tally-navigation-fix.md) (2026-07-30) · **Severity:** UX
regression — no data risk, but breaks the app's most-used piece of chrome.

**What's wrong.** Tapping the Tally name / ▾ arrow at the top of the app
opens **ManageTallySheet** (rename, members, default split, delete) for the
whatever Tally is currently active. There is no way to switch to a different
Tally from the top nav anymore — switching only lives behind
**Settings → Tallies**.

**Expected.** The header (the fast, always-visible control) should switch
between Tallies — that's the frequent action (e.g. jumping from "Flat 4B" to
"The Dreamatorium"). Managing a specific Tally's settings — rename, members,
default split method, delete/leave — is the rare action and should live
inside Settings, reached deliberately.

**Root cause.** A deliberate design decision from
[Phase 12](phases/phase-12-tally-management.md) ("Tally management &
terminology rename"), which consolidated management behind the header tap and
demoted switching to Settings, on the reasoning that "managing" and
"switching" were two mental models worth merging. In practice this inverted
the frequency: switching is common, managing is rare, and putting the rare
action behind the app's fastest-access control while burying the common one
two taps deep in Settings is backwards. Confirmed by Josh after using it.

**Suggested fix.** Swap the two entry points:
- Header tap (▾) → the Tally **switcher** (`SpacesSheet`: switch / create /
  join) — restores the pre-Phase-12 behaviour for this specific action.
- **Settings → Tallies** → a screen to view all your Tallies *and* drill into
  full management (rename / members / default split / delete) for any one of
  them — i.e. a route back into `ManageTallySheet` reached from Settings,
  not from the header.

**Fixed** in [Phase 15](phases/phase-15-tally-navigation-fix.md): header ▾
opens the switcher, each switcher row gained a ⋯ for full management of that
Tally. Implementing it surfaced a second, latent defect the bug report hadn't
spotted — `ManageTallySheet` took `members` as a prop fed from the *active*
Tally, so managing any other Tally would have shown the wrong members and
wrong owner permissions. It now loads its own. Details in the phase file.
