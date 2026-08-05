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
- **Open bugs carry an effort size and a rough Claude-credits band**, same as
  backlog items — see
  [ROADMAP.md → Estimating scale](ROADMAP.md#estimating-scale). Estimate the
  *fix*, and be aware the scale's own warning applies most sharply here:
  BUG-003 was a one-line change that cost far more than its size, because
  finding it was the work. When the cause is unknown, say so in the estimate
  rather than quoting a number as if it were.
- There are currently **no open bugs** — all three logged so far are fixed.

## Fixed

### ~~BUG-003~~: Manage-a-Tally sheet couldn't be closed — Cancel did nothing
**Reported:** 2026-08-04 (Josh) · **Status:** ✅ Fixed same day (commit
following [Phase 14](phases/phase-14-multi-currency-expenses.md)) ·
**Severity:** Trapped the user — the only escape was reloading the app.

**What was wrong.** Tally name in the header → ⋯ on a Tally → the manage
screen opens fine, but **Cancel does nothing and there is no way out of the
navigation at all.**

**Root cause.** `ManageTallySheet` was the only sheet in `page.tsx` rendered
*inside a conditional wrapper* (`{managingGroup && …}`) **and** carrying a
`key`. Every other sheet is always mounted and driven purely by its `open`
prop. That combination broke React's reconciliation of that sibling list:
React logged *"Encountered two children with the same key … non-unique keys
may cause children to be duplicated and/or omitted"* and then stopped
re-rendering the subtree. Proven with a temporary state probe — after Cancel
the component state was **already correct** (`sheet: "spaces"`,
`managingGroupId: null`), but the sheet's fiber still held `open: true` and
its DOM was still on screen. So two scrims stacked, and Cancel on the stale
one only re-set state that was already set — hence "nothing happens".

Two earlier attempts did *not* fix it, which is worth recording: keeping the
id on close, and making the wrapper condition stable. Only removing the `key`
restored correct behaviour, and the duplicate-key warnings disappeared with
it.

**Fixed by** dropping the `key` and giving `ManageTallySheet` a
reset-on-open effect instead — clearing a half-typed rename, an armed delete
confirmation, a generated invite code and any error. That is what the key was
really for (fresh state per Tally), achieved without the remount that broke
reconciliation. The sheet is now rendered like every other one: stable
wrapper, single `open` gate, no key.

**Verified** in the demo across two Tallies: Cancel returns to the switcher
(one sheet), a second Cancel exits fully, tapping the scrim behaves the same,
the flow survives repeat passes, managing a *non-active* Tally still shows
that Tally's own members, an abandoned rename does not persist into the next
open, and the active Tally is never changed by any of it. Console clean on a
fresh server — no duplicate-key warnings.


### ~~BUG-002~~: Add-expense breaks after switching Tallies (failed save AND broken split percentages)
**Reported:** 2026-07-30 (Josh) · **Status:** ✅ Fixed 2026-07-31 (commit on
`main`, no phase file needed) · **Severity:** Was the worst bug logged so far —
in production the save failed outright; in any client without the database
trigger it would have silently written an expense against another Tally's
members.

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

**Second symptom, same cause (reported separately by Josh 2026-07-31):**
"it seems to break the split percentages when I follow the same steps." The
share rows render as `members.filter((m) => parts.includes(m.id))`
(`add-expense-sheet.tsx`). After the missed remount, `members` is the new
Tally's while `parts` holds the old Tally's ids — the two sets don't
intersect, so **every share row disappears** while `splits` still allocates
the full amount to those now-invisible stale ids. One cause, two symptoms.

**Fixed** by adding `groupId` to the remount key in `page.tsx`, so any Tally
switch forces a fresh `parts`/`payerId`/`exact` init regardless of whether
the two Tallies share a default split method.

**A second, unreported instance of the same bug was found while fixing this**
and fixed alongside it: `NewRecurringSheet` (inside `recurring.tsx`) is also
always mounted and also seeds `payerId` from `members` via a `useState`
initializer. Open Recurring → close → switch Tally → reopen, and it would
pair the *old* Tally's payer with the new Tally's participants (the latter
are read fresh at save time), generating expenses that hit the very same
database rejection. `RecurringOverlay` is now keyed by `groupId` too.
`SettleSheet` was checked and is fine — it holds only transient state and
renders straight from props. A grep confirmed `add-expense-sheet.tsx` was the
only other component seeding participant state from the `members` prop.

**Verified by reproducing it first.** With the old key, the demo showed **0
share rows** after switching from a 1-member Tally to a 4-member one; with
the fix, **4 rows at 25%**, and the save then succeeded with the balance
moving exactly +R75 on a R100 expense split four ways. Worth noting the demo
(`MemoryRepo`) has no database trigger, so there the bad save "succeeded"
silently — which is exactly why this surfaced as an error in production but
looked like a display glitch locally.

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
