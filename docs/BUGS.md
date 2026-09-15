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
- BUG-007…011 are **scoped and in progress** (2026-08-28).

## Fixed — 2026-08-28 (BUG-012, BUG-013) — the actual cause of the "can't switch Tallies" report

**These two supersede my diagnosis of [BUG-007]. That diagnosis was wrong.**
I attributed the switching failure to `ensureFreshSession()`. A screen
recording from Josh disproved it: had the session check failed, he would have
been signed out to `/welcome`. Instead the sheet closed cleanly and he stayed
on the same Tally, with **no toast** — which no session fault can produce.

### BUG-012 — every tap inside a bottom sheet dismissed it instead of pressing

**Confirmed, with the mechanism observed directly in the DOM.**

`Sheet` applied its entry animation as an *inline style*, gated on drag state:

```
animation: dragY === 0 && !dragging ? "sheetUp ..." : undefined
```

`dragging` flipped to `true` on every `touchstart` and back to `false` on
`touchend`, so the animation was **removed and then re-applied on every tap**.
Re-applying a CSS animation restarts it from its `from` state —
`translateY(100%)`, a full panel-height below the resting position. So on
touchend the panel dropped off-screen and slid back up over ~240ms, and the
click the browser synthesises straight after touchend landed on the **scrim**,
whose handler is `onClose`.

Result: tapping a Tally closed the switcher instead of switching. Tapping the
camera button in Add-expense closed that sheet instead of opening the picker.
Every sheet control in the app was affected — this is also the true cause of
the "can't add photos" report, not the Gemini key and not the session.

Observed before the fix, by dispatching real touch events:

| point | inline `animation` |
|---|---|
| at rest | `sheetUp var(--d-med) var(--ease-sheet)` |
| after `touchstart` | *(none)* |
| after `touchend` | `sheetUp var(--d-med) var(--ease-sheet)` ← restarted |

**Why the earlier verification missed it.** I tested sheets with
`element.click()`, which dispatches straight at the element and bypasses
hit-testing. It cannot observe a click landing on the wrong element. Sheet
interactions must be exercised with real touch events, or the whole class of
bug is invisible.

**Fix.** The entry animation moved to a `.sheet-panel` CSS class applied once
at mount, so no re-render can restart it. Additionally: a touch starting on a
control no longer begins a drag at all, and `dragging` now flips on first
actual movement rather than on touchstart — so a plain tap causes no state
change whatsoever.

**Also fixed here:** the panel carried `touch-action: none`, which as an
ancestor overrode the body's `pan-y` and left tall sheets unscrollable by
touch, putting their lower controls out of reach. Panel is now `auto`.

### BUG-013 — scroll jank on every screen

**Confirmed by inspection.** `CollapsingHeader` is on Home, Expenses, List and
Reports, and it stored the scroll ratio in React state — so every scroll event
re-rendered the header and its whole `right` subtree, while a
`backdrop-filter: blur(12px)` repainted underneath. Scroll events fire far
faster than frames.

**Fix.** The ratio is no longer React state. The listener is rAF-throttled
(coalescing a burst of events into one write per frame), skips sub-1% changes,
and writes the four changed properties straight to the DOM. Scrolling now costs
zero React work. The visual result is unchanged.

**Still a candidate if jank persists:** two stacked `backdrop-filter` blurs
(this header and the tab bar) are expensive on mid-range Android. That is the
next lever, but it is a visible design change so it is not being made unasked.

### Verification limits, stated plainly

The dev preview pane is hidden in this environment, so the page does not
render: scroll events never fire, rAF never ticks, animations never advance and
timers throttle to ~1s. What was verified here: the animation is no longer
toggled across a real touchstart/touchend pair; the sheet stays open across
one; at click time the element under the finger is the correct button; and
panel `touch-action` is now `auto` over a `pan-y` body. What could **not** be
verified here is the end-to-end feel on a device — that needs Josh.

## Fixed — 2026-08-28 (BUG-007 … BUG-011)

Five issues reported by Josh after Phase 11 reached production. Scoped first,
then fixed off that scope. Each entry below says plainly what was **confirmed**
versus **suspected**, and how the fix was verified.

**Outcome summary**

| Bug | Fix | Verified |
|---|---|---|
| BUG-007 can't switch Tallies | **Diagnosis superseded by BUG-012 — this was not the cause.** The change is still correct hardening: single-flight refresh; a failed refresh is no longer fatal while the token still has life; a session with no `expires_at` is trusted instead of refreshed every call | 3 consecutive switches in the browser, all correct |
| BUG-008 List tab slow | Its items now ride along in `loadHome()`'s existing parallel batch; the tab starts with them instead of fetching on mount | Segment switching proven not to show the wrong Tally's list |
| BUG-009 Splitty photo | **Superseded by BUG-012** (sheet taps never reached the button). Retained anyway: the `ensureFreshSession()` hardening — `scanReceipt()` calls it, so a concurrent refresh surfaced as "Your session expired". Edge function now reports the real upstream failure and takes a `GEMINI_MODEL` override | Function confirmed deployed and its auth gate working; the Gemini leg still needs one real attempt to close out |
| BUG-010 can't leave Splitty | "‹ Back to Tally" on `/split/<code>`, shown only to signed-in/demo users | Link present, returns to Home; guests unaffected |
| BUG-011 Home header doesn't collapse | Home now uses the same `CollapsingHeader` as every other tab; the component gained an optional title-button so it could carry the Tally switcher | Home header confirmed sticky + blurred and the title still opens the switcher |

Also fixed in passing: `Sheet.end()` read the drag distance from a stale render
closure, so drag-to-dismiss misfired; it now reads a ref, and a flick needs
real travel (40px) so a brisk tap can't be mistaken for one.

### A note on what could not be measured here

The collapse animation and the List tab's paint latency could not be timed in
the dev browser: while the preview pane is hidden the page isn't rendered, so
scroll events never fire and `setTimeout` is throttled to ~1s. A control test
on the **Expenses** header — the one Josh confirms works in production —
measured exactly as flat as Home's, which is what established the reading as an
artifact rather than a regression. Home's fix is therefore verified
structurally (it renders the same component, with the same props, as the tabs
that work) rather than by observing the animation.

### BUG-007: can't switch between Tallies — *a regression I introduced*
**Severity:** High — core navigation. **Effort:** S · **Credits:** ~4–9

**Not reproducible in the demo**, because `MemoryRepo` short-circuits the
session check. The cause is in this session's own BUG-005 fix,
`ensureFreshSession()`, which has three faults:

1. **No single-flight guard.** `load()`, the resume listener and
   `scanReceipt()` can each call it concurrently. Every caller fires its own
   `refreshSession()`. With `refresh_token_rotation_enabled` and a **10-second**
   reuse window, the second concurrent refresh presents an already-rotated
   token, fails, and returns `false`.
2. **A failed refresh is treated as fatal.** `load()` responds to `false` by
   signing the user out and redirecting to `/welcome` — even when the current
   token is still valid for another 55 seconds.
3. **A missing `expires_at` forces a refresh on every call** —
   `(undefined ?? 0) * 1000 = 0`, so the "is it still fresh?" test is always
   false.

Switching a Tally calls `load()`. Doing that shortly after opening the app —
when the resume listener has also fired — is exactly the concurrent case.

**Fix:** single-flight the refresh behind a shared promise; only report failure
when the session is genuinely unusable (treat "still valid for >60s" as
success regardless of refresh outcome); handle a missing `expires_at` by
trusting the session rather than force-refreshing.

### BUG-008: the List tab is noticeably slower than every other tab
**Severity:** Medium — UX. **Effort:** S · **Credits:** ~4–8 · **Confirmed by code.**

Every other tab renders from data `page.tsx` already loaded. **List is the only
tab that fetches its own data on mount** (`repo.listShoppingItems`), so opening
it costs a fresh round trip while the others are instant.

**Fix:** load the active Tally's shopping items in the existing parallel batch
in `loadHome()` (same trick as the FX rates in Phase 14 — it rides along, so no
extra round trip) and seed `ListTab` from it. Other segments still fetch on
demand, which is correct: they're the uncommon case.

### BUG-009: Splitty photo / receipt capture broken
**Severity:** High — feature unusable. **Effort:** S–M · **Credits:** ~5–15
(uncertain — see below)

Splitty's capture goes through the same `ReceiptScanSheet` → `repo.scanReceipt`
→ Edge Function path as BUG-006, which was fixed hours ago. **If it is still
broken, the token was not the cause** and the next suspect is
`GEMINI_MODEL = "gemini-flash-latest"` — an alias Google can retire with no
change on our side.

**Cannot be tested from here**: the key is a server-side secret and the code
path needs a real user JWT. **Needs the on-screen error text**, which the
client deliberately surfaces from the function. Estimate is wide because the
cause is unconfirmed.

### BUG-010: no way out of Splitty once a bill is open
**Severity:** Medium — users get stranded. **Effort:** XS · **Credits:** ~2–5
· **Confirmed by code.**

Opening a bill does `router.push('/split/<code>')` — a **separate route** from
the tab shell, with no tab bar. That page was built for guests (people with no
account), so it never needed a way "back". A signed-in user who opens their own
bill has no exit.

**Fix:** a "Back to Tally" control top-left on `/split/[code]`, shown **only to
signed-in users** — a guest has no Tally to go back to, and showing it to them
would be a dead end.

### BUG-011: the collapsing header doesn't work on Home
**Severity:** Low — cosmetic inconsistency. **Effort:** XS · **Credits:** ~2–5
· **Confirmed by code.**

Phase 11 wired `CollapsingHeader` into Expenses, List and Reports but **not
Home**, which still renders its own plain `<header>`. Exactly as reported.

**Fix:** use the shared component on Home too. Home's header carries more than
the others (Tally name + chevron, notification bell, Settings), so those move
into its `right` slot rather than being dropped.

### Also found while investigating — not reported
`Sheet`'s `end()` reads `dragY` from its render closure, which React's batching
may not have flushed by the time `touchend` fires. Measured: an 18px drag in
~25ms was still evaluated against a stale, smaller value. Drag-to-dismiss
therefore under-reads distance and is unreliable. Folded into BUG-007's fix
since it is the same component family and the same kind of mistake.

## Fixed

### ~~BUG-005~~: raw "JWT expired" errors when opening the app
**Reported:** 2026-08-28 (Josh — "JWT errors a lot of the time when opening the
app") · **Status:** ✅ Fixed same day · **Severity:** High — the app showed a
jargon error card instead of working, on a normal open.

**Root cause.** A PWA-specific timing problem, not a logic error.
`supabase-js` keeps the access token alive on a background timer
(`autoRefreshToken`). That works while a tab is awake — but Tally is an
installed PWA, and browsers throttle background timers aggressively. After the
phone has been locked for a while the refresh never fires, the token (1 hour,
`jwt_exp = 3600`) expires, and the **first requests on resume go out already
dead.**

`load()` in `page.tsx` then caught the failure and rendered it verbatim:
```
catch (e) { setError(e instanceof Error ? e.message : String(e)); }
```
so the backend's "JWT expired" was painted straight onto an error card.

**Ruled out along the way**, each checked rather than assumed:
- *The Phase 16 `getUser()` → `getSession()` swap.* The obvious suspect, and
  wrong — both `getUser()` and `getSession()` `await this.initializePromise`
  in the installed auth-js, so neither races cold start.
- *The service worker.* Its fetch handler only touches GETs for navigations,
  brand assets and `/_next/static/`; there is no catch-all, so Supabase calls
  pass through untouched.
- *Auth logs.* Empty — free-tier retention — so the actual error string was
  not recoverable. The mechanism above is established from the code and the
  project's auth config rather than from a log line.

**Fixed** by making token freshness explicit instead of hoping the timer ran:
- `ensureFreshSession()` in `src/lib/session.ts` refreshes when the token is
  within 60s of expiry (early, because a request leaving now can still arrive
  after expiry), and reports honestly when the session is truly gone.
- `load()` calls it **before** any request goes out, so the first load after
  resume already carries a good token. Chosen over retry-after-failure: it
  avoids a recursive `load()` (which the lint rules correctly rejected) and
  fixes the cold-open case rather than papering over it.
- A `visibilitychange` / `focus` listener refreshes on resume — exactly the
  moment the throttled timer has left the token stale.
- An auth error now signs out and routes to `/welcome`. **A user should never
  see the word "JWT".**

**Worth noting for later:** the project has
`refresh_token_rotation_enabled = true` with
`security_refresh_token_reuse_interval = 10` (seconds). That is a tight grace
window — on a flaky mobile connection a retried refresh can reuse a rotated
token and kill the session. Raising it to ~30s would make this more forgiving.
**Not changed here**, because it is a production auth-security setting and
Josh's call to make.

### ~~BUG-006~~: receipt scanning failing
**Reported:** 2026-08-28 (Josh — no error text given) · **Status:** ✅ A
concrete cause found and fixed — **but the cause is inferred, not confirmed**
· **Severity:** Feature unusable.

**What was checked.** The Edge Function is healthy: `scan-receipt` is ACTIVE,
`GEMINI_API_KEY` and all other secrets are present, and its auth gate behaves
correctly (no JWT → 401; anon key → `{"error":"Not signed in"}`).

**The cause found.** `scan-receipt` runs with `verify_jwt: true` **and**
re-validates the caller itself with `auth.getUser()`, returning
`"Not signed in"` on a bad token. So it is the single most token-sensitive
thing in the app — and the scan button is often the first thing tapped after
opening, which by BUG-005 is precisely when the token is stale. The two
reports are very likely the same underlying fault seen from two angles.

**Fixed** by calling `ensureFreshSession()` before invoking the function, with
a plain-language message ("Your session expired — please sign in again.")
instead of a misleading "Couldn't read the receipt" when the real problem is
authentication.

**Honest caveat.** Without the actual error text this may not be the fault
Josh hit. If scanning still fails after this, the next suspects, in order:
1. **`GEMINI_MODEL = "gemini-flash-latest"`** — an alias Google can retire
   with no code change on our side. Could not be tested from here: the key is
   a server-side secret and the code path needs a real user JWT.
2. Image size / base64 payload limits on large photos.
3. Gemini quota (the function already maps 429 separately).
**Please report the on-screen message** — the client deliberately surfaces the
function's own error, so it will name which of these it is.


### ~~BUG-004~~: `profile_public` leaked every profile in the system, to anyone
**Found:** 2026-08-28, by the Phase 6 security re-audit (not user-reported) ·
**Status:** ✅ Fixed same day, migration
`20260828000000_fix_profile_public_leak.sql` applied to production ·
**Severity:** **Critical** — cross-tenant data exposure plus unauthenticated
read and authenticated write, straight through the project's stated security
boundary.

**What was wrong.** `profile_public` — the view that hydrates other members'
display names — was a plain view owned by `postgres` with
`security_invoker = false`. A view in that mode runs with its OWNER's rights,
so **RLS on the underlying `profile` table never applied to it.** Default
grants then handed `anon` and `authenticated` full INSERT/UPDATE/DELETE/
TRUNCATE on top.

**Demonstrated against production before fixing**, rather than inferred:

| Probe | Before | After |
|---|---|---|
| `authenticated`, JWT owning nothing — `select count(*) from profile` | 0 (RLS correct) | 0 |
| same session — `select count(*) from profile_public` | **9 (every profile)** | 0 |
| `anon` (unauthenticated) — `select count(*) from profile_public` | **9** | permission denied |
| `authenticated` — `update profile_public set display_name…` on another user | **SUCCEEDED** | blocked |
| a real member — co-members visible | 9 | 2 (self + co-member) ✓ |

So every user's `display_name` and `avatar_url` were readable by the public
internet — the anon key ships in the client bundle by design — and any signed-in
user could rename anybody. No salary was actually exposed, but only because no
user had `salary_visible` switched on yet; the mechanism was live, and that flag
means "my Tally may see it", never "the internet may see it" (ADR-0010).

**Why the obvious fix would have been worse.** Setting `security_invoker = true`
would have (1) reduced the view to your own row, breaking member-name hydration,
and (2) if patched with a co-member RLS policy on `profile`, granted co-members
SELECT on the BASE table — and RLS is row-level, not column-level, so they could
have read `monthly_salary_cents` raw, past the `salary_visible` gate. That trades
one leak for a worse one.

**Fixed by** keeping the view definer-rights (so the salary CASE gate still
works) and moving the boundary into the view's own WHERE clause: you see
yourself, plus people you share an active Tally membership with. `auth.uid()` is
NULL for anon, so anon matches nothing. Write grants revoked; `authenticated`
holds SELECT only; `anon` removed entirely.

**Lesson worth keeping:** every other table was correctly protected — 18/18 with
RLS enabled. The hole was in the one object where RLS silently doesn't apply.
Any future view over a protected table needs this same check.


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
