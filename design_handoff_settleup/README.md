# Handoff: SettleUp — Shared Expense Tracker (Phase 1)

## Overview
SettleUp is a Splitwise-style shared-expense tracker built for couples & households, denominated in **South African Rand (ZAR)**. This handoff covers the **Phase 1 core ledger** prototype: onboarding, a shared "space" (household/trip), adding expenses with flexible splitting, running balances, settle-up with debt simplification, a shared shopping list, recurring bills, reporting/export, activity feed, and profile/settings.

The prototype is a single-user perspective (**Josh**, the owner) with a fully working in-memory data model — expenses recompute balances live, settle-up clears debts, etc. It also includes the invite/onboarding screens for future members.

## About the Design Files
The files in this bundle (`SettleUp.dc.html`, `support.js`) are a **design reference created in HTML** — a working prototype showing the intended look, layout, and behavior. **They are not production code to copy directly.** `support.js` is a proprietary prototype runtime and should be ignored entirely — do not port it.

Your task is to **recreate these designs in your target codebase** using its established framework, patterns, and libraries (React Native, Flutter, native iOS/Android, a React PWA, etc.). If no codebase exists yet, choose the most appropriate stack for a mobile-first expense app with offline support (the source spec suggests a free-tier stack — e.g. React/Expo + a hosted Postgres/SQLite with sync). Treat the HTML as the spec for UI and interaction, not as the implementation.

To view the prototype: open `SettleUp.dc.html` in a browser. On the welcome screen tap **"Skip — explore the demo household"** to enter the seeded app.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions are all intentional. Recreate the UI faithfully using your codebase's component library, then wire the real data layer described below. This is a **dark-mode-only** design.

---

## Design Tokens

All styling is inline in the prototype; these are the canonical values (CSS custom properties defined on the app root):

**Colors**
- `--bg` app background: `#0E1521`
- `--surface` card surface: `#161F2E`
- `--s2` input/secondary surface: `#1F2A3B`
- `--s3` tertiary surface: `#29374C`
- `--sheet` bottom-sheet surface: `#16212F`
- `--line` hairline border: `#283750`
- `--line2` stronger border: `#36475F`
- `--ink` primary text: `#EAF0F8`
- `--muted` secondary text: `#93A0B5`
- `--faint` tertiary text / labels: `#64708A`
- `--primary` brand blue: `#4E9BF0` (dark variant `#3A86DC`)
- `--bluebg` blue tint bg: `rgba(78,155,240,.14)`
- `--green` positive / owed-to-you: `#41C58A` (tint `rgba(65,197,138,.15)`)
- `--red` negative / you-owe: `#F2767A` (tint `rgba(242,118,122,.15)`)
- `--amber` warning / offline / pending: `#E3A53C`
- Phone shell gradient bg: `radial-gradient(1200px 700px at 50% -10%, #15243b 0%, #0a111c 55%, #070b12 100%)`
- Brand logo & avatar gradient: `linear-gradient(155deg, #4E9BF0, #2f6dd0)`

**Category accent colors** (icon tint bg / foreground):
- Groceries `#7FB6F5`, Rent `#A9ABF8`, Utilities `#E9BF73`, Eating out `#6FD7AC`, Transport `#74D2E0`, Household `#C9A6F4`, Entertainment `#F39DC0`, Other `#AEB9CC` (each on a ~16% alpha tint of the same hue)

**Typography**
- Font family: system stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- Balance hero: 42px / 800 / letter-spacing -1.2px
- Screen titles: 24–25px / 800 / -.5px
- Section titles: 14.5px / 700
- Uppercase labels: 11–12px / 700 / letter-spacing .05em / color `--faint`
- Body: 14–15px / 500–600
- Meta/sub: 12–12.5px / color `--muted`
- Tab labels: 10.5px / 600

**Radius**: cards 16–22px · inputs/buttons 13–14px · sheets 26px (top corners) · pills 999px · category icon tiles 10–14px · avatars 50%

**Spacing**: screen horizontal padding 18px (26px on auth screens); card padding 14–22px; gaps 8–14px.

**Shadows**: primary button `0 10px 22px -10px rgba(78,155,240,.7)`; cards `0 12px 30px -18px rgba(0,0,0,.7)`; FAB `0 14px 28px -8px rgba(78,155,240,.75)`; sheets `0 -20px 50px -20px rgba(0,0,0,.6)`.

**Motion**: bottom sheets slide up `.28s cubic-bezier(.2,.8,.2,1)`; toast pop `.2s`; sync spinner `1.4s linear infinite`. Toggle knob transitions `left .16s`.

**Currency format**: ZAR, thousands separated by a space, comma as decimal separator, `R` prefix. e.g. `R1 200,00`, `-R63,50`. (See `fmt()`.)

---

## Screens / Views

The app is a mobile phone layout (design canvas 392×840 device, ~370px content width). Bottom tab bar with 4 tabs (Home / Expenses / List / Reports) + a floating **+** FAB (bottom-right, 56px, brand blue). A gesture bar sits at the very bottom.

### Auth & Onboarding (pre-app)
1. **Welcome / Sign in** — Logo, tagline "Shared expenses for your home — always know who owes whom." Email input → "Email me a sign-in code" (primary). Secondary "Skip — explore the demo household". Note: passwordless / OTP model.
2. **OTP** — 6-digit code entry (letter-spaced), "Verify & continue", resend link. Shows the email entered.
3. **Onboarding — Name** — Avatar with add-photo affordance, display-name input. 3-step progress indicator.
4. **Onboarding — Salary** — Optional monthly net salary input (R prefix). Explains it powers **proportional splits**. Privacy reassurance ("Your partner only ever sees the split amounts — never your income."). "Skip for now" option.
5. **Onboarding — Space** — Create household (name input) OR join with an invite code. "Create household" primary.
6. **Invite accept (invitee view)** — Shows inviter + space name, accept/decline. (Kept for future member flow.)

### Home (tab)
- **Header**: space name (tappable → opens Spaces switcher sheet, chevron affordance), member subtitle, notification bell (→ Activity), avatar (→ Settings).
- **Sync pill**: one of "All changes synced" (green), "N change syncing…" (amber, spinner), "Offline — saved on this device" (muted). Driven by pending-expense count + offline flag.
- **Balance hero card**: "Sam owes you" / "You owe Sam" / "You're all settled", large amount colored green/red/muted, sub-line, and two buttons: **Settle up** (primary) + **Add expense**.
- **Upcoming card** (if a recurring bill is due next): category icon, "Upcoming · <date>", description, amount → tapping goes to Recurring.
- **Recent activity**: iconless rows (title + meta + amount), "See all" → Activity. *(Note: category icons were intentionally removed from these rows — value only.)*

### Expenses (tab)
- Title + "N expenses · Rtotal".
- Date-grouped list (Today / Yesterday / "5 Jun"). Each row: category icon tile, description, sub-line ("you paid · your share 50%" — **always shows the user's share %**), amount, and a lent/borrowed net line (green/red). Tap → Expense detail.

### Expense Detail
- Back / **Edit** / **Delete** (trash) in header.
- Big category icon, description, amount, "Category · full date".
- **Paid by** card: each payer avatar + amount.
- **Split** card (labeled by method: "Split equally" / "Exact amounts" / "Split proportionally"): each member row shows avatar, name, a **% pill**, their share amount, and net (+/−).
- Delete does a **soft-delete with an Undo toast** (4s).

### Add / Edit Expense (bottom sheet)
- Cancel / title ("Add expense" or "Edit expense") / **Save**.
- Large amount input (R prefix).
- Description input ("What was it for?"). **Category is auto-detected** from description keywords (no manual category picker — see `autoCategory()`).
- **Paid by**: member pills + a "Multiple" option that reveals per-payer amount inputs (must sum to total).
- **Split** segmented control — exactly three options: **Equal · Exact · Proportional** — **defaulting to Proportional**.
  - Equal: even split (remainder distributed cents-fairly).
  - Exact: per-member R inputs; shows remainder "left/over" indicator (red if it doesn't reconcile — blocks save).
  - Proportional: weighted by each member's salary (falls back to equal if any salary missing).
- Member split rows show avatar, name, computed share, and **% of total**.
- Participant chips at the bottom to toggle who's included in the split.

### Shopping List (tab)
- Add-item input + **+** button.
- To-buy list: checkbox, name, qty, optional estimate, adder avatar.
- "In cart · N" section (checked items, struck through) with "Clear".
- **"Turn cart into an expense · Restimate"** — converts checked items into a prefilled Add-expense draft (groceries).

### Reports (tab)
- **Export** button (top-right) → generates a CSV/Excel download of all expenses.
- Monthly **trend bar chart** (gradient bars, amount labels).
- **By category** breakdown with progress bars + % for the month.
- **Who paid what** — per member: paid vs share this month.

### Activity
- Back header. Date-grouped feed of expense-added and settlement events (icon tile, title, actor + date, amount). Expense rows tap into detail.

### Recurring
- Explainer + **"New recurring bill"** dashed button.
- Each rule card: icon, description, "Monthly · <payer> pays", amount, next-run date (or "Paused"), and **Pause/Resume** + **Add now** (generates the expense immediately and advances next-run).
- **New recurring sheet**: amount, description, payer pills, split segmented control (Equal/Proportional), and "repeats monthly on day N".

### Settings
- **Editable** profile card: name + email inputs.
- Your profile: **editable** monthly salary (R input, private), currency (ZAR, fixed).
- Space members list (avatar, name, role: Owner/Member/Placeholder) + add-placeholder-member input.
- **Invite someone** → Invite screen (share code `SAM-4K2Q` / share link). *(Invite is a placeholder for future implementation.)*
- Preferences: **Simplify debts** toggle, **Offline mode** toggle (simulates no connection).
- Sign out.

### Spaces switcher (bottom sheet)
- List of spaces (household/trip) with member subtitle + active check.
- **"Create a space"** → New-space sheet (name input → creates and switches into it). A space is a household, trip, or shared budget.

### Settle Up (bottom sheet)
- "Fewest payments to clear all balances."
- Debt-simplified transactions: from-avatar → amount → to-avatar, with **"Record this payment"** per transaction. Records a settlement that adjusts balances. Empty state when settled.

---

## Interactions & Behavior
- **Navigation**: bottom tabs reset their stack; sub-screens (detail, activity, recurring, settings, invite) push onto a back stack with a back chevron. Sheets overlay with a scrim (tap scrim to dismiss).
- **Live recomputation**: adding/editing/deleting an expense or recording a settlement immediately updates the Home balance, Expenses totals, and Reports.
- **Pending/sync simulation**: a newly added expense is marked `pending` for ~1.8s (drives the amber "syncing" pill), then settles to "synced". Offline mode shows the offline pill and implies local-only persistence.
- **Soft delete + undo**: delete flips a `deleted` flag and shows a 4s Undo toast; undo restores it.
- **Validation**: amount > 0; at least one participant; exact/percent splits must reconcile to the total (±2 cents) or save is blocked with a toast; multi-payer amounts must sum to total.
- **Auto-categorization**: `autoCategory(desc)` matches keywords → category (rent/utilities/eatingout/transport/groceries/household/entertainment, else other). Reproduce this keyword map.

## State Management
Core entities (see `buildStore()` in the source for exact seed data and shapes):
- **members**: `{id, name, initials, color, salaryCents, you, role, placeholder}`
- **groups (spaces)**: `{id, name, currency, simplify, memberIds[], icon}`
- **expenses**: `{id, groupId, description, category, amountCents, spentAt, splitMethod, payers:[{memberId,paidCents}], splits:[{memberId,shareCents}], createdBy, note, deleted, pending, createdAt}`
- **settlements**: `{id, groupId, fromMemberId, toMemberId, amountCents, settledAt, deleted}`
- **recurring**: `{id, groupId, description, category, amountCents, frequency, anchor, nextRun, payer, method, parts[], paused}`
- **shopping**: `{id, groupId, name, qty, estCents, checked, addedBy}`
- **activity**: `{id, groupId, type: 'expense_added'|'settled', actor, ts, ref, text, amount}`

Key derived logic to port faithfully:
- **Money is stored in integer cents.** Never use floats for money.
- **Split algorithms** (`splitEqual`, `splitWeighted`, `computeSplit`): largest-remainder method so cents always sum exactly to the total.
- **Balances** (`balances`): net per member = sum(paid) − sum(shares) + settlements.
- **Debt simplification** (`simplify`): greedy match of largest creditor to largest debtor → minimal transaction set. Gated by the group's `simplify` flag.
- **ZAR formatting** (`fmt`): integer cents → `R1 200,00`.

## Assets
- No external image assets. All icons are inline SVG (nav, chevrons, status-bar glyphs, category glyphs use emoji in tinted tiles). Replace category emoji with your icon set if preferred, keeping the category accent colors above.
- Fonts: system stack only — no web fonts to license.

## Files
- `SettleUp.dc.html` — the full prototype (markup + logic). Open in a browser to interact. The `<x-dc>` template holds the screens; the `class Component` block holds all data + logic (seed data, split maths, balances, mutations). **This is your reference for both UI and behavior.**
- `support.js` — proprietary prototype runtime. **Ignore / do not port.**

## Source specs
This prototype was built from two planning docs (in the project `uploads/`): a Scope/Data-Model/Roadmap doc and a Phase-1 Implementation/Infrastructure plan. If you have them, read them alongside this README for the full 6-phase roadmap and the free-tier infrastructure recommendations. This handoff = Phase 1 (core ledger) + the screens for later phases.
