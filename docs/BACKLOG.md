*(Part of the [Tally roadmap](ROADMAP.md).)*

# Backlog

Cross-cutting loose ends that aren't worth a phase of their own — either too
small, or waiting on something outside this repo (an account, a real need
arising). Add new items here rather than letting them accumulate inside
`ROADMAP.md` or a phase file.

**Every open item carries an effort size and a rough Claude-credits band**, so
the cost is visible before anything starts. Scale, calibration and the two
things that reliably blow an estimate (debugging, and manual/external steps)
are in [ROADMAP.md → Estimating scale](ROADMAP.md#estimating-scale). Sizes are
inferred from work volume, not measured spend.

> **Status 2026-10-21 — backlog sweep.** Everything buildable is built and
> live: the whole animation-polish section, the formal WCAG pass, the privacy
> page, avatar photos, the note input and the "Tally-ho" copy. **What's left,
> and why it isn't done:**
> - **Needs a decision from Josh:** the privacy page's account-deletion contact
>   (one constant); app-wide multi-currency (XL — it would supersede ADR-0017's
>   ZAR ledger, and was parked "until a real need appears"); a Tally-ho icon /
>   wordmark (needs design assets).
> - **Needs an account that doesn't exist yet:** custom SMTP (Resend + the
>   Phase 10 domain) and CAPTCHA (hCaptcha — and only if bot sign-ups appear).
> - **Needs another phase first:** the sync-state pill (Phase 2's offline outbox).
> - **Decided not to build:** percentage/shares split methods (design has three).
>
> **New 2026-10-28:** sign-up, login and accounts audited and a holistic fix
> scoped: [the section below](#sign-up-login--accounts--holistic-rework-audit-2026-10-28),
> with flow diagrams in [AUTH-FLOWS.md](AUTH-FLOWS.md).

## Sign-up, login & accounts — holistic rework (audit 2026-10-28)

> **Effort:** XL · **Credits:** ~50–105 for everything, in three stages that
> each ship on their own. **Stages 0 + 1 fix every problem people are hitting:
> L · ~32–68.** Stage 0 needs nothing outside the repo. Stage 1 needs an email
> sender (decision D1). Stage 2 is optional. If D1 is settled before work
> starts, 0.1 and 1.2 merge (the sign-in screen is reworked once), which saves
> ~4–8.
>
> **Diagrams** of every flow, as built (broken steps in red) and as proposed:
> **[AUTH-FLOWS.md](AUTH-FLOWS.md)**. The confirmed defects are
> [BUG-022 to BUG-026](BUGS.md#open--2026-10-28-auth-audit).

### Why it feels clunky: what the audit found

Ranked by how much each one hurts a real person. Checked against the code,
the live auth configuration and the live user records (aggregates only).

1. **Tally can't email its users.** No custom email server is set up, so
   Supabase's built-in sender is in use. Supabase's docs say it will "refuse to
   deliver messages to addresses that are not part of the project's team",
   which means everyone except the owner. It is also capped at **2 emails an
   hour for the whole project**, and the docs call it "not meant for
   production use". So "Email me a sign-in link", "Forgot password?" and
   "Resend email" fail for every real user, and show a raw backend error.
   Email confirmation was switched off to work around this, which is why
   sign-up never checks the address. → BUG-022
2. **"Forgot password?" can't reset a password even when the email arrives.**
   The link signs you in, but there's no screen to choose a new password, and
   nothing in the app can set one (`updateUser` is never called). The next
   password log-in fails again. → BUG-023
3. **Two ways in that look equal but don't work equally.** There's a password
   form and a sign-in-link button, and the error copy keeps sending people to
   the sign-in link, which can't arrive. This is BUG-015's confusion, patched
   with copy rather than resolved.
4. **Invites get lost.** The invite code is kept in `sessionStorage`, which
   belongs to one browser tab. Open the email in a new tab, or restart the app
   mid-way, and the invitee lands on "Create your Tally" and ends up in an
   empty Tally of their own. The sign-in screen also doesn't say they're
   joining anything, and it opens on *Log in* even though they're new.
   → BUG-024
5. **The home-screen app and email links don't mix.** A link opens in the
   browser, not the installed app. That happens to work on Android (shared
   storage) but never signs in an iPhone home-screen app. Typed codes avoid
   the problem, but the code screen can't work today: it takes 6 digits,
   Supabase is set to issue 8, and the email contains no code. → BUG-025
6. **No account controls.** Settings doesn't show which email you're signed
   in with, and has no change password, change email or delete account. The
   privacy page says deletion is "on request", with no contact set.
7. **Onboarding asks too much, in the wrong order.** Everyone, including an
   invitee who only wants to join, goes through name, then salary, then
   create-a-Tally. Salary is private and optional, and means nothing yet at
   that point.
8. **Loose ends in the records.** 5 of the 9 accounts are leftover test
   accounts in production. They have no name and no expenses, and they own 2
   empty Tallies and 2 invite codes. Invite codes never expire and can be
   used any number of times. "Finished onboarding" is guessed from a
   non-empty display name.
9. **Security settings to tighten.** The auth redirect allow-list accepts any
   `*.vercel.app` site, so a crafted sign-in link could hand a session to
   someone else's Vercel app. It's harmless only while email is team-only.
   → BUG-026. Passwords need just 6 characters, and email ownership is never
   proven (that needs working email first).

**What's fine and stays:**

- Session handling: after BUG-005/007/014, sessions survive flaky networks,
  and sign-out only affects this device.
- One account per email address, with all data hanging off `auth.users.id`.
- RLS.
- Splitty's guest access (ADR-0013).

### The target experience

One obvious path: **email → 6-digit code → in.** The same flow covers
sign-up, log-in, a new phone and a forgotten password, so there's nothing
separate to recover, and typing a code works inside the home-screen app on
any phone.

- A password stays available for anyone who prefers one. All 9 accounts have
  one today.
- "Continue with Google" is an optional extra. All four real users are on
  Gmail.
- Invites carry through every step and land the person straight in the right
  Tally.
- Settings gets a proper Account section.

### Stage 0 — stop the confusion (nothing needed from outside)

**Effort:** M–L · **Credits:** ~16–33

| # | Work | Size |
|---|---|---|
| 0.1 | **Password-only sign-in screen, for now.** Hide the sign-in-link button and the dead code entry until email can be delivered. One form with "New here? Create an account", and a show/hide password toggle. Error messages come from one mapped, unit-tested table (`auth-messages.ts`), never raw Supabase strings. | S · ~4–8 |
| 0.2 | **Honest recovery until email works.** "Forgot password?" explains that the Tally owner can reset it. Add an `npm run admin:reset-password` script for Josh (Management API, same pattern as the category backfill), with a runbook in SETUP.md. | S · ~3–6 |
| 0.3 | **Invites that survive.** Keep the code in `localStorage` with an expiry *and* in the URL (`/welcome?invite=CODE`). The sign-in screen shows "Joining {Tally}: {name} invited you" and opens on Create account. After sign-up it goes name → joined, skipping salary and create-a-Tally. | S–M · ~5–10 |
| 0.4 | **Account section in Settings.** Show the signed-in email. Add set/change password via `updateUser`, which works without email because reauthentication isn't required. | S · ~3–6 |
| 0.5 | **Config and hygiene.** Narrow the redirect allow-list to the production URL plus this project's preview URLs. Set the code length to 6 to match the screen. Delete the 5 test accounts and their empty Tallies and invites once Josh confirms (D4). | XS · ~1–3 |

### Stage 1 — email that works (needs D1)

**Effort:** M–L · **Credits:** ~16–35, plus Josh's account setup

| # | Work | Size |
|---|---|---|
| 1.1 | **Custom SMTP.** Connect the chosen sender to Supabase Auth and raise the email limit (e.g. 30/hour). Sender name "Tally". Branded sign-in, reset and email-change emails that carry **both** the 6-digit code and the link. | S · ~3–8 |
| 1.2 | **Email-code sign-in as the main path** (`signInWithOtp` + `verifyOtp`), the same for new and returning people. Resend with a 60-second cooldown, and "Use a password instead" for people who have one. | M · ~6–12 |
| 1.3 | **Real recovery.** A "Choose a new password" screen for the reset link (the `PASSWORD_RECOVERY` event) and for the code. The admin script becomes break-glass only. | S · ~3–6 |
| 1.4 | **Email confirmation on**, by code at sign-up, so a mistyped address is caught at the door and nobody can squat someone else's email. | XS–S · ~2–4 |
| 1.5 | **Change email** in Settings: a code goes to the new address. (`mailer_secure_email_change_enabled` is already on.) | S · ~2–5 |

### Stage 2 — nice to have (pick any)

**Effort:** M–L · **Credits:** ~19–38 if all of it

| # | Work | Size |
|---|---|---|
| 2.1 | **Continue with Google** (D3). A Google Cloud OAuth client from Josh's Google account, the Supabase provider, and the button. Check same-email account linking, and the redirect back into the home-screen app on both phones. | S–M · ~5–10 |
| 2.2 | **Delete my account**, self-serve and confirmed by code. It leaves every Tally (shared expenses stay, shown as "Former member"), removes the profile and photo, and deletes the auth user through an Edge Function holding the service key. This settles the privacy page's open contact question. | M · ~8–15 |
| 2.3 | **Invite controls.** Expiry (default 14 days), "New link" revokes the old one, and the owner sees who joined. | S · ~3–6 |
| 2.4 | **Salary in context.** Ask the first time someone picks a proportional split, not during sign-up (D6). | S · ~2–5 |
| 2.5 | **Explicit `profile.onboarded_at`**, instead of guessing from the display name. | XS · ~1–2 |

### Decisions for Josh

- **D1: email sender (blocks Stage 1).**
  - (a) A **dedicated Gmail account with an app password**
    (`smtp.gmail.com`): free, no domain, about 10 minutes, 500 emails a day.
    Emails come from that Gmail address.
  - (b) **Domain + Resend** ([Phase 10](phases/phase-10-custom-domain-launch.md)):
    the proper long-term answer with a branded sender, but the domain has to
    be bought and its DNS set up first.
  - *Recommendation: (a) now, unless the domain is days away. Moving to (b)
    later is a settings change, not code.*
- **D2: the main way in after Stage 1.** Email code (recommended: one flow
  for everything, and safe in the home-screen app), or keep password first
  and use codes only for recovery.
- **D3: add "Continue with Google"?** Recommended, but only after 1.4, so
  email confirmation closes the account-linking loophole first.
- **D4:** confirm deleting the 5 test accounts.
- **D5:** invite expiry (14 days proposed), and whether a link stays reusable.
- **D6:** keep salary in sign-up, or move it (recommended: move it, 2.4).

### What only Josh can do

- **For D1, create the account.** That's either the Gmail address (2-step
  verification on, then an app password) or the Phase 10 domain + Resend.
  Then paste the SMTP password yourself into Supabase → Authentication →
  Emails → SMTP settings. It's a credential, so Claude won't enter it.
  Everything else (host, limits, templates) Claude can set.
- **For D3, create the OAuth client** in Google Cloud Console and paste its
  ID and secret into Supabase → Authentication → Providers → Google.

### Decisions already on record

- Building Stage 1 supersedes **[ADR-0006](decisions/0006-passwordless-otp-auth.md)**
  (password primary, magic-link fallback). Write the new ADR then; 0020 is
  reserved for Phase 19, so it will be 0022 or later.
- D1(b) *is* Phase 10's Resend step. D1(a) is an interim that doesn't block
  it.

### How we'll know it's fixed

On a real Android phone **and** a real iPhone home-screen app, test as a
brand-new person and as an existing one:

- sign up;
- sign in on a second phone;
- forget the password;
- accept an invite with the email opened in another app;
- change email;
- delete a throwaway account.

Every error a person can hit has a plain message, backed by the unit-tested
table, and a test fails if a raw Supabase string reaches the screen.

## Other open items
- ~~**Formal a11y pass (WCAG)**~~ → **done** 2026-10-21, against WCAG 2.2 AA.
  Measured first, then fixed at the source so it holds for future screens:
  - **Contrast (1.4.3).** Only body text passed. White on the teal buttons and
    balance card was **2.57:1**, teal links 2.43:1, meta grey 2.85:1, the
    money colours ~4.1:1. All 20 text-bearing palette tokens were darkened by
    the *minimum* needed (hue and saturation kept) to reach 4.5:1 on every
    background each one actually sits on — page, cards, `--s2`, its own pale
    tint — so every pairing now measures ≥4.59:1. **The visible result is a
    deeper teal** (`#2fb3ac` → `#1d6e6a`): white button text is what forces
    it, since it needs the teal at least 12 lightness points darker whatever
    else changes. The values and the reasoning are in the LAYER 1 comment in
    `globals.css`; reverting is one block.
  - **Names (1.3.1 / 4.1.2).** A live audit of every form control found 25
    `Input`s named only by placeholder (`Label` is visual, not a `<label>`).
    `Input` now takes a `label` (falling back to the placeholder, so nothing
    can ship unnamed) and every call site passes the words on screen. Audit
    re-run: zero unnamed controls.
  - **Keyboard (2.1.1).** Activity rows, Splitty cards and claim rows were
    `<div role="button">` with no focus or key handling; `pressable()` adds
    both.
  - **Focus visible (2.4.7).** There was no focus style anywhere — the shared
    `Input` set `outline: none`. Now a global `:focus-visible` ring, a border
    colour on focused fields, and an underline on the borderless ones.
  - **Zoom (1.4.4).** `maximum-scale=1` blocked pinch-zoom on Android; removed.
    Every text field is now ≥16px, which is what actually stops iOS zooming in
    on focus.
  - **Target size (2.5.8).** The list's ✕ Remove was 15×23px (and it deletes),
    the list checkbox 22×22, "See all"/"Clear" 17px tall. A `.hit` utility
    grows the tappable area to ≥34px without changing the look; checked that
    no target steals a neighbour's taps.
  - **Not verifiable from this environment:** the focus styles themselves —
    the dev browser pane has no window focus, so `:focus` never matches there.
    The rules are present and correct by inspection.
- ~~**Performance — cut the reload chain**~~ → **shipped** as
  [Phase 16](phases/phase-16-performance.md) (2026-07-31). Kept as the record
  of where it came from: the cause turned out to be a network auth call before
  every write plus a duplicated load chain, cut from ~7 serial round trips
  to ~2.
- **Custom SMTP for real auth emails** (Resend) — was backlogged since Phase
  0/1; now scoped as an actual launch blocker inside
  [Phase 10](phases/phase-10-custom-domain-launch.md) (Supabase's default
  mailer caps at 2 emails/hour project-wide). Magic-link/password sign-in is
  the flow until Phase 10 ships.
  **Effort:** S · **Credits:** ~4–10 *(bundled into Phase 10; mostly account
  setup and DNS, so the wall-clock is waiting, not work.)*
- **App-wide multi-currency support** — the *Tally's ledger currency* is
  ZAR-only today: `fmt()`/`fmtR()` (`src/lib/domain/money.ts`), the
  `group.currency` check constraint, and push-notification copy
  (`_push_fmt()`) all hardcode Rand. Flagged by Josh while reviewing Phase 9,
  not a near-term priority — revisit only if a real need appears (e.g. a
  non-South-African household). Full note in
  [Phase 9](phases/phase-09-push-notifications.md#backlog-multi-currency-not-part-of-this-phase).
  **Distinct from [Phase 14](phases/phase-14-multi-currency-expenses.md)**,
  which is a narrower, now-scoped feature: a single *expense* entered in a
  foreign currency, converted and locked to ZAR at save time — the Tally's
  own ledger currency stays ZAR either way (ADR-0017).
  **Effort:** XL · **Credits:** ~50–95 *(every money display, the `group`
  currency constraint, the SQL `_push_fmt()` mirror, settlements, reports and
  export — plus a per-Tally currency choice and its migration. The largest
  unbuilt item on file.)*
- ~~**Privacy policy / terms page**~~ → **done** 2026-10-21 at `/privacy`,
  linked from the welcome screen and Settings, readable signed out. Plain
  language; every statement was checked against the code and the live project
  before writing it (no analytics or trackers; receipts bucket private and
  member-only by storage policy; scanned photos not kept; `leave_group` keeps
  expense history; Supabase region Ireland; Resend wired but inactive, so not
  claimed). Deletes are soft, so it promises undo rather than instant erasure.
  ⚠️ **One open decision for Josh:** the address for account-deletion requests.
  There's no self-serve account deletion, and publishing a personal email on a
  public page isn't a default to guess — so `PRIVACY_CONTACT_EMAIL` in
  `src/app/privacy/page.tsx` is `null` and the page gives an honest fallback
  ("the app's owner does it on request — ask whoever invited you").
  **Effort to finish:** XS · **Credits:** ~1 (one constant).
  ⚠️ Still true from the original note: **[Phase 18](phases/phase-18-learning-categorisation.md)
  §2** introduces the first table shared between unrelated households — the
  page must name it in the same commit that ships it. (§1, now live, is a
  static on-device library and shares nothing.)
- **CAPTCHA / bot-signup prevention** — Supabase's `security_captcha_enabled`
  is off; signup is fully open. Only worth doing if bot signups become an
  observed problem post-launch (Phase 10), not preemptively — would need an
  hCaptcha account if/when revisited.
  **Effort:** S · **Credits:** ~3–8 *(a Supabase setting plus a client widget —
  but only worth spending anything on if bot signups actually appear.)*
- ~~**Deeper "Tally-ho" brand treatment**~~ → **copy and empty states done**
  2026-10-21; **app icon not done** (needs real design assets — not something
  to invent). Kept deliberately scarce, so it still means something: it marks
  genuine moments of arrival or success — **all square** on Home ("All square
  — tally-ho!", the state the app exists to reach), **a payment recorded**, a
  **brand-new Tally** ("Tally-ho — your Tally's ready…"), and **a Splitty bill
  fully claimed** — alongside push notifications, where it already was.
  **Remaining:** an icon / wordmark treatment, if wanted.
  **Effort:** S · **Credits:** ~4–10 *(design-led; needs Josh's direction or a
  designer's assets first.)*

## Animation & interaction polish (survey 2026-07-28)
Josh asked for a sweep of animation opportunities beyond those in the Phase 11
design. Survey finding: **15 of 18 components have no `transition` or
`animation` at all** (only `add-expense-sheet`, `settings-sheet` and `ui.tsx`
have any), the app has just 3 keyframes (`sheetUp`, `spin`, `toastPop`), and
**nothing anywhere honours `prefers-reduced-motion`**.

Already scoped into [Phase 11](phases/phase-11-visual-reskin.md), not repeated
here: wave drift, staggered rise-in, scroll-collapsing headers, sheet
drag-to-dismiss, and the reduced-motion guard (that one is a correctness fix,
not polish — it should not slip).

**Whole section as one pass: Effort L · Credits ~25–50.** Cheaper together
than piecemeal — one reduced-motion guard, one easing vocabulary, one review.
Per-item sizes below are for cherry-picking; they don't sum to the section
figure because each would re-pay the same setup.

**Status 2026-10-21: every item in this section is done.**

Candidates for a later pass, roughly highest value first:
- ~~**Tab switching is an instant swap**~~ → **done** in Phase 11 (`tabIn`:
  each tab fades and rises in). 2026-10-21: its fill mode changed to
  `backwards` so the wrapper no longer holds a transform (BUG-018).
- ~~**List rows appear all at once**~~ → **done**: Expenses and List in
  Phase 11; Activity rows and Splitty bill cards added 2026-10-21, same capped
  cross-group stagger.
- ~~**No press feedback**~~ → **done**: tab bar, pills, buttons and list rows
  in Phase 11 (`.press`); the FAB, Activity rows, Splitty cards, Splitty claim
  rows, toast Undo and "+ Add a note" added 2026-10-21.
- ~~**Checkbox ticks are instant**~~ → **done**: shopping list in Phase 11;
  Splitty claim 2026-10-21 (colour transition + tick pop, and the row is now
  keyboard-operable with `aria-pressed`).
- ~~**Balance figure snaps**~~ → **done** 2026-10-21: `useCountUp` counts the
  signed balance from old to new (so owed→owing passes through zero), whole
  cents every frame, tabular digits, instant under reduced motion; the pop
  still plays.
- ~~**Loading is a bare spinner**~~ → **done** 2026-10-21
  (`components/skeletons.tsx`): Home's own shape on every app open — it is
  server-rendered, so it is also the very first paint — plus Splitty and
  Activity. Reports never had a loading state (its data rides in with Home's).
- ~~**Toast has an entry but no exit**~~ → **done** 2026-10-21: `toastOut`
  exit, and a bar draining across the undo window (exempt from the
  reduced-motion guard — it's information). Also fixed an existing glitch:
  `toastPop` overrode the inline centring transform, so every toast slid in
  off-centre and snapped to the middle.
- ~~**Sheet content doesn't animate in**~~ → **done** 2026-10-21:
  `.sheet-stagger` settles a sheet's children in (6px, staggered, then the rest
  together) just behind the panel.
- ~~**No pull-to-refresh**~~ → **done** 2026-10-21 (`usePullToRefresh`):
  arms only at the top and only for a vertical downward drag, half-speed
  resistance, Material-style indicator (content doesn't move, so nothing gains
  a transform). Installed iOS PWAs have no browser pull-to-refresh at all.

## Design-fidelity backlog (audit vs design handoff, 2026-07-13)
Gaps between the built app and `design_handoff_settleup/README.md`, each with
its target phase. The audit confirmed all iron rules hold and Phase-1 exit
criteria are met (bar the E6 trial); these are the visible deltas:

- ~~Salary-proportional split doesn't work for a real couple~~ → **fixed in
  Phase 3** (privacy-preserving server RPC, ADR-0010)
- ~~Partner's real display name never shown~~ → **fixed in Phase 3**
- ~~Settings (editable name/salary, privacy toggle)~~ → **basic sheet shipped
  in Phase 3**; simplify-debts toggle + full-screen fidelity in Phase 6
- ~~Header per design: tappable Tally name → switcher, bell → Activity~~ →
  **done** (bell in Phase 5, tappable name restored in Phase 15). The avatar
  is still a "Settings" pill rather than a photo — folded into the avatar item
  below.
- ~~Spaces switcher + create-space sheet~~ → **done** (Phase 6, reworked in
  Phases 12 and 15).
- Sync-state pill (synced/syncing/offline) → belongs to **Phase 2**; there is
  nothing to show until an outbox exists. **Effort:** XS · **Credits:** ~1–3
  *(within Phase 2; meaningless before it.)*
- ~~Upcoming-recurring card on Home~~ → built in Phase 4, then **deliberately
  removed** in the Tally polish batch when Recurring moved into Settings. Not
  pending — listed only so it isn't "re-fixed" later.
- ~~Note input on Add/Edit sheet~~ → **done** 2026-10-21: behind a
  "+ Add a note" link so the Add sheet stays zero-friction (ADR-0008), open by
  default only when editing an expense that has one. A receipt scan's item
  list now lands in it (visible and editable) instead of being saved silently.
- ~~Avatar photos (add-photo affordance in onboarding/settings)~~ → **done**
  2026-10-21. Add / change / remove in **Settings** and (optional) on
  onboarding's name step, via one shared `AvatarPicker`. The photo is
  centre-cropped to a 256px square in the browser before upload — automatic
  rather than an interactive cropper, so it stays one tap. Shows everywhere an
  avatar does (all go through `Avatar`, which falls back to initials if a photo
  fails to load), now also in the *Manage this Tally* member list, and the
  header's "Settings" pill is now your avatar, per the design.
  Storage: migration `20261021000000_avatar_photos` (applied and recorded) adds
  a **public** `avatars` bucket with unguessable per-upload paths — URLs reach
  only co-members, via `profile_public` — and write access limited to your own
  folder; proven under RLS (own folder writable and visible, anyone else's
  rejected and invisible). The privacy page says photos are stored and
  link-shareable. **Not verified end-to-end:** the real upload, which needs a
  signed-in user; the demo path and the storage policies are verified.
- ~~Group rename UI; member-leave-with-zero-balance rule~~ → **done**
  (Phase 6, consolidated into "Manage this Tally" in Phase 12).
- Percentage/shares split methods: implemented + tested in the domain layer but
  deliberately **not surfaced** — the final design's segmented control has
  exactly three options (Equal · Exact · Proportional); design supersedes scope
  §6.5 here. Revisit only if a real need appears. **Not estimated** — this is
  a standing decision not to build, not a pending task.
