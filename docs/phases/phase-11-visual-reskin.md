*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 11 — Visual reskin (light "wave" theme) 📝 SPEC ONLY — NOT BUILT (2026-07-28)

> **Effort:** XL · **Credits:** ~50–90 — every screen, plus ~14 screens the
> prototype never designed and which have to be extrapolated. The single
> largest piece of work currently specced. Worth combining with the "Tally-ho"
> brand item in [BACKLOG.md](../BACKLOG.md) rather than reskinning twice. See
> [Estimating scale](../ROADMAP.md#estimating-scale).

> **Status: fully specced, zero code written.** Same convention as Phases
> 8–10. See **[ADR-0016](../decisions/0016-light-theme-reskin.md)** for the
> decisions this implements — read it first.
>
> **Design source of truth:** [`design_handoff_tally/`](../../design_handoff_tally/)
> — `Tally.dc.html` (the interactive prototype) and `Reskin-Guide.dc.html`
> (the written spec). **Never port the prototype's `support.js` runtime** —
> same rule as the old handoff. `design_handoff_settleup/` is now historical.

## Goal
Move Tally from the dark, dense SettleUp look to the light, warm, rounded
Tally look: off-white background, white cards, deep-teal ink, teal accent,
pill buttons, the wave motif, Nunito, and headers that collapse as you
scroll. **Presentation only — no feature is added, removed or altered.**

## The one-line summary of why this is cheap
ADR-0007 put every colour, radius and shadow into CSS custom properties in
`globals.css` and banned hard-coded colours in components. That bet pays off
here: **the palette change is mostly one file.** Components change only where
*shape* changes (pill buttons, bigger radii) or where genuinely new structure
is needed (wave motif, collapsing headers, sheet drag).

## ⚠️ Read before scoping: the design covers ~the Phase-5 app
Verified by inspecting the prototype. It has **four tabs** and **zero**
coverage of:

| Built feature | Phase | Design coverage |
|---|---|---|
| Splitty tab + `/split/[code]` guest page | 8 | ❌ none |
| Receipt scanning sheet | 7 | ❌ none |
| Push-notification settings + test button | 9 | ❌ none |
| Category picker sheet | 6 | ❌ none |
| Spaces sheet (switch/create/rename/delete) | 6 | ❌ none |
| Member management (remove / leave / reinvite) | 6 | ❌ none |
| Password-first login (guide assumes OTP-first) | 6 | ❌ stale |
| 5th tab in the tab bar | 8 | ❌ shows 4 |

**Decision (Josh):** extrapolate these from the established patterns rather
than blocking on new design work. They carry more review risk than the
designed screens — concentrate review there.

The guide also contains **stale claims to ignore** (it says so itself:
"if an implementer finds a behavioural difference implied, treat it as a
documentation error and keep the existing behaviour"):
- "CSV export" → Tally exports **`.xlsx`**, and the filename prefix is
  already `tally-…`.
- "offline mode, pending-sync states, optimistic pending flag" → **Phase 2 is
  deferred and unbuilt.** There is no sync chip to restyle.
- "onboarding (email → OTP → name → salary → space)" → onboarding is
  **password-first** since Phase 6, with magic-link as fallback.
- "percentage, shares" as user-facing split methods → deliberately **not
  surfaced**; the control has exactly three options (Equal · Exact ·
  Proportional). See the design-fidelity note in [BACKLOG](../BACKLOG.md).
- "Tally (formerly SettleUp)" / "rename SettleUp → Tally" → the user-facing
  rename **already shipped in Phase 6**. Only dev-facing strings remain, and
  those are scoped in [Phase 10](phase-10-custom-domain-launch.md), not here.

## Token changes (`globals.css` — the bulk of the work)

| Token | Current (dark) | Target (Tally) |
|---|---|---|
| `--bg` | `#0E1521` | `#FFF7EF` |
| `--surface` | `#161F2E` | `#FFFFFF` |
| `--s2` | `#1F2A3B` | `#FDF0E6` |
| `--s3` | `#29374C` | `#FBE2D2` |
| `--sheet` | `#16212F` | `#FFFFFF` |
| `--line` / `--line2` | `#283750` / `#36475F` | `#F1E2D6` / `#E2CDBA` |
| `--ink` | `#EAF0F8` | `#173F4A` |
| `--muted` / `--faint` | `#93A0B5` / `#64708A` | `#6C838B` / `#9BABB1` |
| `--primary` | `#4E9BF0` | `#2FB3AC` (teal) |
| `--green` | `#41C58A` | `#12A87A` |
| `--red` | `#F2767A` | `#F2635C` |
| `--sun` *(new)* | — | `#FFC24B` |
| `--amber` | `#E3A53C` | `#E08A2B` |

Also: **radii** — controls/chips/inputs `14px`, cards/sheets/tiles `20px`,
balance hero `26px`, all primary/secondary buttons **fully pill (999px)`.
**Shadows and gradients go to zero** — separation comes from flat surface
colour, 1px `--line` hairlines and 2px outlines. That means deleting
`--shadow-*` and `--brand-gradient`/`--shell-gradient` usage, not just
recolouring it.

**Accent is switchable.** `--primary` drives derived `--primaryD` (darkened
24) and `--bluebg` (accent @14% alpha), so one value re-themes buttons,
links, active tabs and the balance hero. Curated swatches: teal `#2FB3AC`
(default), coral `#F2635C`, amber `#F2A03D`, blue `#5B8DEF`, violet
`#7A5CF0`, green `#12A87A`. **Ship teal only in v1** — wiring a user-facing
accent picker is not in scope, but the tokens must be structured so it's a
later one-liner.

⚠️ **`--bluebg` is now a misnomer** (it's the accent tint, and the accent is
teal). Rename to `--accentbg` as part of this work — it's referenced across
components, so it's a mechanical find-and-replace best done in this phase
rather than left to confuse later.

## Typography
System stack → **Nunito** (400/600/700/800/900), **self-hosted via
`next/font/google`** (not a CDN link — see ADR-0016). Scale mostly unchanged,
two deliberate increases:
- Screen titles: 22–24px/800 → **26px/900**, -0.8px tracking
- Balance hero figure: 42px/800 → **46px/900**, -1.4px tracking

Labels stay 11–12.5px uppercase 700–800; body/list stays 13–15px.

## Iconography
Category/activity glyphs are currently platform emoji rendered as text (they
change per OS). Move to the **Twemoji 15.1 flat SVG pack**, **vendored into
`public/icons/twemoji/`** — not jsDelivr (ADR-0016).

Meaning is unchanged: groceries `1f6d2`, rent `1f3e0`, utilities `1f4a1`,
eating out `1f35d`, transport `1f697`, household `1f9f4`, entertainment
`1f3ac`, other `1f4b3`, settlement `1f91d`, unknown `1f9fe`, recurring
`1f501`. Rendered as `<img>` at 58% of the tinted tile.

⚠️ **Tally has a two-level category taxonomy (ADR-0011)** with far more than
11 subcategories. The 11 Twemoji above map to **parent** categories; every
subcategory must resolve to its parent's glyph. Check `categoryMeta()` covers
this before assuming the mapping is complete.

## Motion
The prototype has 7 keyframes (`su-drift`, `su-fade`, `su-pop`, `su-rise`,
`su-sheet`, `su-slide`, `su-spin`); the app currently has 3 (`sheetUp`,
`spin`, `toastPop`). New/changed:

- **Wave drift** — welcome hero decoration translates -160px over 14s,
  linear, infinite alternate. Ambient only.
- **Rise-in** — wordmark, tagline and form fade up 18px over 500ms,
  `cubic-bezier(.2,.8,.3,1)`, staggered 60/130/200ms.
- **Header collapse** — on Home, Expenses, List and Reports the sticky header
  responds to scroll. `k = scrollTop ÷ min(44, availableScrollRange)`, clamped
  0–1. Title interpolates 26px → 18px; subtitle opacity 1 → 0 and max-height
  20px → 0; padding tightens 10/12px → 5/6px; a `--line` hairline fades in
  past `k > 0.5`. Transitions 160–180ms linear. **The header minimises, never
  disappears** — title and account controls stay reachable at every scroll
  position. *(This is the "text should move dynamically instead of feeling
  like a website" ask.)*
- **Sheet drag-to-dismiss** — see below. Not in the guide; added from Josh's
  feedback.
- Existing sheet/fade/pop/spin keyframes are retained.

**Respect `prefers-reduced-motion`:** wave drift and rise-in must be disabled
under it. The current app has no reduced-motion handling at all — add a
global guard as part of this phase.

## Bottom sheets — the "can't minimise them properly" fix
Confirmed: `src/components/sheet.tsx` has **no drag, touch or snap handling
whatsoever** — sheets animate in via the `sheetUp` keyframe and can only be
closed via the Cancel button or backdrop tap. That's the "feels like a
website" complaint.

Add to the shared `Sheet` component (so every sheet benefits at once —
add-expense, settle, invite, spaces, settings, category picker, receipt
scan):
- **Grab handle** is already rendered; make it (and the header area) a drag
  affordance.
- **Drag-to-dismiss:** follow the finger on `touchmove`; past ~25% of sheet
  height or a fast flick (velocity > ~0.5px/ms), dismiss; otherwise spring
  back. Use `transform: translateY()` only (compositor-friendly, no layout
  thrash).
- **Backdrop opacity tracks drag progress**, so it feels attached rather than
  binary.
- Keep the existing backdrop-tap and Cancel paths working unchanged —
  drag is additive, not a replacement.
- Full-height sheets (add-expense, receipt scan) should be internally
  scrollable with the drag gesture only active when the content is scrolled
  to top, or the two gestures will fight.

## Screen-by-screen
| Screen | Change |
|---|---|
| **Welcome / login** | 360px accent hero, four drifting wave lines, 42pt/900 white wordmark, tagline, SVG wave curving hero into page. Content rises in staggered. **App icon removed** (new logo pending — wordmark stands alone). Form fields, buttons and order unchanged — but note this is the **password-first** form, not the guide's OTP form. |
| **Home** | Balance block → full-bleed accent wave card: white 46pt figure, white pill primary ("Add expense"), ghost-outline pill secondary. Two presentation-level additions reusing data already computed for Reports: a "Spending in {month}" category breakdown with bars, and a Recurring shortcut row. **No new data or endpoints.** |
| **Expenses / List / Reports** | Static titles → sticky collapsing headers. Row content, date grouping, totals, actions all unchanged; only radii, icon rendering and type weights differ. |
| **Splitty tab + `/split/[code]`** | ⚠️ **Undesigned — extrapolate.** Guest page is the one screen strangers see without an account; it should carry the wave hero treatment. |
| **Detail, sheets, onboarding, invite, settings** | Inherit tokens, radii, pill buttons, icons. Field order, validation, sheet heights, flows untouched. |
| **Receipt scan, push settings, category picker, spaces, membership** | ⚠️ **Undesigned — extrapolate.** |

Also: **tab bar** dark translucent → light translucent white with blur,
accent active item — and it must fit **five** tabs, not the prototype's four.

## Production safety
This phase **cannot corrupt production data** — there is no migration, no
schema change, no RPC change, no Edge Function redeploy, and no repo-layer
change. Users, spaces, expenses, balances and Splitty bills are untouched.
Nonetheless, because there are live users:

- **Build on a branch**, review the whole app on the **Vercel preview URL**
  before merging. Vercel generates one automatically per branch.
- **Bump the service worker cache** (`tally-shell-v3` → `v4`) so returning
  clients don't get a half-old-CSS render. Also update `theme_color` and
  `background_color` in `manifest.webmanifest` (`#0E1521` → `#FFF7EF`) or
  the PWA splash will flash dark.
- **Verify Splitty guest links still render** — those URLs are already
  shared in real WhatsApp threads.
- Keep `npm test` (53) + build + lint green; the domain layer shouldn't be
  touched at all, so any test failure means something went wrong.

## Verification
- Every screen visually reviewed on the preview URL at mobile width,
  including the eight undesigned ones.
- **Contrast audit** — white-on-accent, `--faint` on `--bg`, and accent-on-
  white. The guide flags the 46pt hero figure at ~3.1:1 (acceptable for large
  text) and explicitly leaves smaller labels unverified. Light themes make
  `--faint` easy to under-contrast; check it rather than assume.
- `prefers-reduced-motion` honoured (wave drift + rise-in disabled).
- Sheet drag: dismiss, spring-back, and scroll-vs-drag interaction on a
  full-height sheet, on a real touch device.
- Header collapse on all four scrollable tabs, including the "never fully
  disappears" rule.
- PWA reinstall from scratch — icon, splash and `theme_color` all light.
- No hard-coded colours introduced: `grep` components for `#` hex literals.

## Explicit non-goals
- **No behaviour, data, schema or route changes** — presentation only.
- **No dark mode / theme toggle** — light replaces dark (ADR-0016).
- **No user-facing accent picker** — teal only; tokens structured for it later.
- **No new logo** — wordmark-only launch screen by design until one exists.
- **No "Splitty" rename** — Josh confirmed it keeps its name.
- **No `splitclone`/domain cleanup** — that's [Phase 10](phase-10-custom-domain-launch.md).
- **No wave hero on OTP/onboarding/invite yet** — the guide lists this as
  outstanding; treat as a follow-up, not a gap.
- **No deeper "Tally-ho" brand treatment** — still a separate later phase
  (see [BACKLOG](../BACKLOG.md)).

## Build order
1. Tokens: rewrite `globals.css` (palette, radii, remove shadows/gradients,
   rename `--bluebg` → `--accentbg`). Nunito via `next/font`. Manifest
   `theme_color`/`background_color`. SW cache bump.
2. Shared primitives (`ui.tsx`, `sheet.tsx`): pill buttons, new radii, drag-
   to-dismiss, reduced-motion guard.
3. Vendor Twemoji SVGs; wire `categoryMeta()` → parent-glyph mapping.
4. Wave motif component (welcome hero + home balance card + curved edge).
5. Collapsing sticky header (shared component) → Home, Expenses, List,
   Reports.
6. Screen pass, designed screens first: welcome, home, expenses, list,
   reports, detail, existing sheets.
7. Screen pass, extrapolated: Splitty tab + guest page, receipt scan, push
   settings, category picker, spaces, membership, onboarding, invite.
8. Contrast + reduced-motion + real-device sheet/gesture audit.
9. Review the whole app on the preview URL, then merge.
10. Update `CLAUDE.md` + `docs/ARCHITECTURE.md` (dark-mode-only → light,
    system fonts → Nunito, handoff pointer → `design_handoff_tally/`),
    flip this file to ✅ SHIPPED.
