*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 21 — Splitty on its own: a dedicated page, sharing that spreads, and fairer maths ✅ SHIPPED (2026-11-02)

> **Shipped** — see [§ Shipped](#shipped-2026-11-02) at the end for what was
> built, the small differences from this spec, and how it was verified.

> **Effort:** L · **Credits:** ~25–45. Covers a migration (four new
> functions, two new tables, two changed functions), an Edge Function change,
> a new public page, changes to three existing Splitty screens, a privacy
> update and an ADR. See [Estimating scale](../ROADMAP.md#estimating-scale).
>
> Read **[ADR-0022](../decisions/0022-splitty-without-an-account.md)** first.
> It settles how people without an account start a split, the daily scan
> budget, and how usage is recorded.

## What Josh asked for (2026-11-02)

1. **A dedicated URL for Splitty.**
2. **Two links in the share message:** the bill itself, and "Loving Splitty?
   Save this link and you can use it too!", which opens a dedicated Splitty
   page with all of Splitty in one place.
3. **Record usage of that link** in a table, to come back to later. No stats
   screen.
4. **Always round up to the nearest rand**, with a plain-text note:
   "Splitty always rounds up to the nearest ZAR".
5. **Custom tip as a Rand amount**, replacing the custom percentage.
6. **On the scanned-bill screen, edit each item's price and quantity**, under
   the copy: "This is where you can configure your split. Someone paid
   already? The value or number of items incorrect? Fix it now before sharing
   with the others"
7. **A live counter of Gemini scans left today** on Splitty, just after the
   body text: "(100 Splits remaining for today)".

Josh's answers to the open questions: no account needed to start a split;
the URL is a `/splitty` path now, moving with the domain later; rounding is
always on with no switch; tracking is a table only.

## 1 · The `/splitty` page

A public route that works with or without a Tally account.

- **Header:** "Splitty", then the body text with the counter at its end: *"Scan
  a restaurant or bar bill, share the link, and everyone picks what they had.
  No account needed. (100 Splits remaining for today)"*.
- **+ New split.** Someone without a Tally account is asked their name once
  (remembered on the device; it's how the table sees them). An anonymous
  session is created only at this point (ADR-0022). Then the same
  scan → review → create flow as the Tally tab, landing on `/split/<code>`.
  Signed-in Tally users skip the name; their profile name is used, as today.
- **Your splits:** the splits started by this session (Tally or anonymous),
  plus the splits this device has *joined* (from the guest identities already
  saved in `localStorage`). That's everything in one place, as asked.
- **Out of scans:** if the counter is 0, the button is disabled with "Splitty
  has used today's scans. Back tomorrow."
- **Tracking:** `splitty_opened`, with `ref` from `?ref=<share code>`. The
  first `ref` seen is kept on the device for attribution.
- **Footer:** "Splitty is part of Tally: shared expenses for your home",
  linking to `/welcome`.

**Shared with the Tally tab.** The tab and this page render the same
`SplittyHome` component, in "tab" and "standalone" modes, so they can't
drift. The tab keeps its collapsing header and gains the counter. Both show
the same intro text at the same size (Josh, 2026-11-02). He considered sending
Tally users to `/splitty` from the tab instead and agreed to keep the tab: it
would lose the tab bar and reload Home to save a 23-line wrapper.

**Back links on `/split/<code>`.** A Tally user still sees "‹ Back to Tally",
which opens Tally's Splitty tab (`/?tab=splitty`), not Home.
Everyone else now sees "‹ My splits", which goes to `/splitty`. That's the
same viral door, for guests who never saw the message.

## 2 · The share message

```
Let's split the {merchant} bill on Splitty.

1. Tap this link: {origin}/split/{code}
2. Type your name
3. Tick what you had, add a tip, and lock in.

Loving Splitty? Save this link and you can use it too! {origin}/splitty?ref={code}
```

Built by one tested function, `splittyShareMessage()`. Share and copy both
record `share_tapped`.

## 3 · Usage table

`splitty_event`:

| Column | Meaning |
|---|---|
| `id` | bigint identity |
| `created_at` | when |
| `event` | `splitty_opened` · `bill_opened` · `share_tapped` · `split_created` |
| `share_code` | the bill opened, shared or created |
| `ref` | the bill whose "Loving Splitty?" link brought this device |
| `source` | `splitty_page` or `tally_tab` (for `split_created`) |
| `device_id` | random per-browser uuid in `localStorage` |
| `user_id` | `auth.uid()` if any |
| `is_anonymous` | whether that session is anonymous |

- **Writes:** only through `splitty_track()`, granted to `anon` and
  `authenticated`. It checks the event name and caps string lengths.
- **Reads:** RLS is on with no policies, so only the dashboard or SQL can
  read it. Tracking never blocks or breaks the page; failures are swallowed.
- **Questions it answers:** how many people opened the saved link, from which
  bills, and how many then started their own split.

## 4 · Scan budget and the live counter

As decided in ADR-0022:

- `scan_usage(day, scans)` holds the daily total; `scan_usage_user(day,
  user_id, scans)` holds the per-account cap.
- `scan_budget()` returns 100; the per-account cap is 15.
- `consume_scan(user)` and `refund_scan(user)` are service-role only.
- `scans_remaining_today()` is granted to `anon`.

**The Edge Function** reserves a slot before calling Gemini. It refunds the
slot if Gemini fails or reads nothing, and returns `scans_remaining` on
success. When the budget or cap is used up it returns 429 with a plain
message: *"Splitty has used today's scans. Back tomorrow (daily limit ·
429)"* or *"You've used today's scans on this account. Back tomorrow
(daily limit · 429)"*.

**The counter** loads `scans_remaining_today()` when the page opens and
subscribes to `scan_usage` through Realtime, so it updates live as anyone
scans. Wording: "(1 Split remaining for today)", "(100 Splits remaining for
today)".

## 5 · Rounding and tips

- **Rounding:** each person's total is items + tip, **rounded up to the next
  whole rand** (an exact rand stays as it is). It's always on. A plain-text
  note under "Your total" reads "Splitty always rounds up to the nearest ZAR",
  in the normal text colour with no highlight.
- **Overview:** the host's summary gets a "Rounding" line next to "Tips on
  top", so items + tips + rounding = what everyone pays. Tips alone stay in
  the Splitty-tab summary line.
- **Tips:** the presets stay *No tip · 10% · 15% · 20%*. **Custom** becomes a
  Rand amount ("Tip amount, R") stored as `split_guest.tip_cents`.
  - A preset clears `tip_cents`; a custom amount sets `tip_percent` to 0.
  - New RPC: `splitty_set_tip_amount()`. `splitty_set_tip()` also clears
    `tip_cents`.
  - The total line reads "R137,60 + R20,00 tip" or "R137,60 + 15% tip".

## 6 · Editing items before sharing

On the scanned-bill screen, in Splitty mode only (the expense scanner is
untouched):

- **Copy at the top:** Josh's sentence, word for word.
- **One row per product.** The scanner returns "Jack Black (1 of 5)" … "(5 of
  5)". `groupScanItems()` folds these back into one row: *Jack Black · qty 5 ·
  R50,00 each*.
- **Each row** reads as text by default: remove (×), name, "2 × R15,99", the
  line total and a pencil. Josh's change, same day: rows no longer open as
  inputs. The pencil opens that row's editor (name, a quantity stepper − n +,
  1 to 50, and the price **each**) and closes any other; tapping it again
  closes it. Remove stays one tap without opening the row.
- **On Create split**, `expandRows()` turns each row back into `qty` claimable
  items, cent-exact. If price and quantity are untouched, the original line
  total is kept exactly. Otherwise the line is price × qty.

## 7 · Data and API changes

**Migration `20261102000000_splitty_standalone.sql`:**

- `split_guest.tip_cents` (bigint, null, 0 to R100 000).
- `splitty_set_tip` replaced: it now also clears `tip_cents`.
- New: `splitty_set_tip_amount`.
- `splitty_create_bill` gains `p_display_name text default null`. The old
  three-argument version is dropped first, so PostgREST never sees two
  candidates. The name fallback is fixed: an empty profile name now falls
  back too.
- New tables: `scan_usage` and `scan_usage_user`. `scan_usage` gets a select
  policy for all and is added to Realtime; `scan_usage_user` has no policies.
- New functions: `scan_budget`, `scans_remaining_today`, `consume_scan`,
  `refund_scan`.
- `splitty_event` + `splitty_track`.
- Ledger guard (ADR-0022): a restrictive insert policy on `"group"` for
  anonymous users, and `redeem_invite` refuses anonymous callers.

**Supabase config:** `external_anonymous_users_enabled = true`.

**Repo** (interface, Supabase and Memory):

- `splittyCreateBill(…, displayName?)`
- `splittySetTipAmount`
- `splittyEnsureSession`
- `scansRemainingToday`
- `subscribeScanQuota`
- `trackSplittyEvent`
- `SplitBillGuest.tipCents`

**Pure helpers** in `lib/splitty.ts`, all unit-tested:

- `guestTipCents`
- `guestRoundingCents`
- `roundUpToRand`
- `groupScanItems`
- `expandRows`
- `splittyShareMessage`
- `scansRemainingLabel`

## Non-goals

- Converting an anonymous creator into a Tally account while keeping their
  splits (follow-up).
- A stats screen (Josh: a table only).
- A Splitty subdomain. `/splitty` moves with the custom domain (Phase 10) by
  itself.
- Adding items on the review screen. Josh asked for editing and removing.

## Build order

1. Domain helpers and tests.
2. Migration: rehearse in a rolled-back transaction, apply, record.
3. Enable anonymous sign-ins.
4. Edge Function (budget, refund, `scans_remaining`) and deploy.
5. Repo methods (Supabase + Memory).
6. Shared `SplittyHome`, then `/splitty`, then the tab.
7. Review-screen editing, rounding, tips and the share message on
   `/split/<code>`.
8. Session guard (anonymous = signed out for Tally) and the back links.
9. Privacy page.
10. Docs and verification.

## Verify

- Unit:
  - rounding (exact rand, cents, tip amount vs percent);
  - grouping and expanding (scanner rows round-trip; edited rows are price ×
    qty; cent-exact);
  - share message contains both links;
  - counter wording;
  - anonymous session maps to signed-out.
- SQL, in rolled-back transactions on production:
  - budget and cap enforcement and refund;
  - `scans_remaining_today` as `anon`;
  - `splitty_track` rejects unknown events, and `anon` can't read the table;
  - an anonymous JWT can create a split but can't create a Tally or redeem an
    invite;
  - tip amount through the RPCs.
- Browser (demo): the `/splitty` page; New split with the name prompt;
  editing qty and price; the share message; tip amount; the rounding note and
  totals; back links.
- `npm test`, tsc, lint and build green; the deploy verified in the
  production bundle.

## Shipped (2026-11-02)

**Live:**

- The backend: migration `20261102000000_splitty_standalone` (rehearsed in a
  rolled-back transaction first, then recorded), anonymous sign-ins switched
  on, and `scan-receipt` v6.
- The app changes (commit `1b92de4`) were built and deployed by Vercel and
  serve correctly on the `main` branch alias.

**Production promotion lagging:** on 2026-11-02, Vercel had not yet promoted
that deployment to the production URL; it was still serving the previous
build. This is harmless meanwhile. The backend changes are
backward-compatible with the old app:

- the 3-argument `splitty_create_bill` call still works;
- `splitty_set_tip` is unchanged for it;
- the scanner's extra field is ignored;
- the old app never signs in anonymously.

**Small differences from the spec:**

- The Splitty **tab** also lists "Splits you joined", because it renders the
  same `SplittyHome` as `/splitty`.
- A guest who set a **custom percentage** before this phase still sees it, as
  an extra pill next to the presets, so their tip isn't hidden. New custom
  tips are Rand amounts only.
- The demo's canned slip gained a 2× Coke line, so the demo shows the
  quantity folding.

**Verification:**

- **Unit tests** (488 total, 31 Splitty), covering:
  - rounding: cents up, an exact rand untouched, applied to items + tip;
  - Rand vs percentage tips;
  - scanner rows folding into qty lines and expanding back cent-exact
    (round-trip identical);
  - the edited-line rule;
  - both links in the share message;
  - counter wording;
  - anonymous sessions treated as signed out.
- **SQL, in a rolled-back transaction on production:**
  - `anon` reads the counter (100) and can record a valid event; an unknown
    event is rejected;
  - `anon` can neither read `splitty_event` nor call `consume_scan`;
  - 15 scans for one account leave 85, and the 16th is refused
    (`scan_user_cap_reached`); a refund gives one back;
  - at the budget, scans are refused (`scan_budget_exhausted`) and the
    counter reads 0;
  - an anonymous JWT creates a split under its typed name and sets a R20 tip
    (a percentage then clears it), but is refused creating a Tally (RLS) and
    redeeming an invite.
  - After applying: a real Tally user can still create a Tally; there's one
    `splitty_create_bill` signature; only the service role can call
    `consume_scan`; `scan_usage` is in Realtime.
- **Deployed function:** v6 boots and still answers 401 to a caller with no
  session.
- **Browser, signed out** (against production): `/splitty` has its own page
  title, shows "(100 Splits remaining for today)" live from production, and
  records `splitty_opened` with a random device id and no user. That one test
  row was then deleted. "+ New split" asks for a name, and no session exists
  yet at that point.
- **Browser, demo:**
  - The tab shows the counter.
  - Scan review shows Josh's copy and folds 2× Coke into one qty-2 line.
    Real taps: + → qty 3 (R47,97); price each R20,00 → R60,00; total
    R406,42 → R422,41 → R434,44.
  - Create split makes three R20,00 Coke items.
  - Claiming R50,98 shows R51,00. A R5 custom tip gives R56,00, and the
    overview reads tips R5,00 + rounding R0,02 = R56,00. 15% gives R59,00.
  - The rounding note uses the normal text colour and weight.
  - The copied share message contains both links, the second with
    `?ref=<code>`.
  - At 375px, the review screen has no sideways scroll.

**Not verified end to end:** a real anonymous scan on production. Doing it
would create a real anonymous account and spend a real scan, so the first
real use is the live test. Every database path it uses was proven above as an
anonymous user, and the function is deployed.

## Follow-up: Splitty as its own app (2026-11-02)

`/splitty` and `/split/*` now have their own manifest, icons and home-screen
name, so saving either gives a Splitty app that opens on `/splitty`. Tally keeps
its identity everywhere else. The decision, including why the scope is `/split`,
is in [ADR-0023](../decisions/0023-splitty-own-app-identity.md); follow-ups are
in the [backlog](../BACKLOG.md).

The `/splitty` page now opens like `/welcome`: the Splitty icon sits in a
`WaveHero` and is the page's heading (Josh's call), replacing the "Splitty"
title. "‹ Back to Tally" moved into the hero. Bill pages still use Tally's logo.

**Verified locally:**

- `npm test` (493 total) and `npm run build` pass.
- The icon, manifest and app-title tags on `/`, `/welcome` and `/privacy` match
  production exactly, so Tally's output is unchanged. Tally's manifest, `sw.js`
  and icon files are untouched, and `/favicon.ico` serves the same bytes.
- `/splitty` and `/split/<code>` serve only Splitty's tags, with no Tally icon
  left behind, and every file they point to loads.
- A real click from `/splitty` to `/privacy` swaps the tags to Tally's without
  a page reload, and going back restores Splitty's.

**Not verified:** saving to a real iPhone or Android home screen. That needs the
deployed site, and the Android behaviour with Tally already installed is the
part most worth checking.
