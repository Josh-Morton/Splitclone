*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 9 — Push notifications ✅ SHIPPED (2026-07-26) → M7 "Tally-ho!"

> **Live:** Web Push via VAPID. Five triggers (expense added, recurring bill
> generated, payment settled, shopping item added, shopping item crossed off),
> every title prefaced **"Tally-ho!"**, one master toggle per device in
> Settings, plus a "Send a test notification" button. Tapping a notification
> deep-links to the exact expense (auto-switching space if needed) or the List
> tab. See **[ADR-0014](../decisions/0014-push-notifications.md)**.
>
> **What's deployed:** migration `20260729000000_push_notifications.sql`
> (pg_net, `push_subscription` + RLS, `push_throttle`, three trigger
> functions); Edge Function `send-push` (deployed `--no-verify-jwt` — it does
> its own auth: shared secret for Postgres callers, JWT for the test button);
> VAPID keys as Supabase Function secrets + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on
> Vercel; `send_push_url`/`send_push_shared_secret` in Supabase Vault.
>
> **Verified server-side end-to-end** on a throwaway synthetic group: trigger
> fired → recipient + per-person share resolved → `pg_net` POSTed → function
> authenticated → VAPID-signed encrypted push actually sent to Google's FCM
> endpoint → 404 for the fake endpoint → dead subscription auto-pruned
> (`{"sent":0,"pruned":1}`). Auth rejection paths (no secret / wrong secret)
> both 401. Money formatting (`_push_fmt`) matches the app's `fmt()` exactly.
> `npm test` (53) + build + lint green.
>
> ⚠️ **Not verified: delivery to a real handset.** That needs a physical
> device and can't be done from this tooling — **Josh: install Tally on your
> Android home screen, Settings → Notifications on → "Send a test
> notification".** Everything up to the push service is proven working.
>
> **Trimmed from the original draft (2026-07-25, Josh):** cut to only the
> triggers that matter. **Extended (2026-07-26, Josh):** crossing an item off
> the shopping list notifies too, with the same quiet window as adding.

## Goal
Notify household members of things that happened elsewhere in Tally —
without them having the app open — using the **Web Push API** (no native app,
no Firebase/APNs, no per-user Google/Apple account). One master on/off toggle
in Settings in v1; no granular per-category preferences yet.

## Copy convention: every notification starts "Tally-ho!"
Josh's call: every push notification title is prefaced **"Tally-ho!"** — the
app's name doubling as the old hunting cry for "there's something happening,
here it is." Title format is fixed across every notification type:
`Tally-ho! {event summary}` (see the inventory below for the exact
`{event summary}` per type). This is a hard-coded literal string prefix in
the copy-building code, not a per-user preference.

## Platform support: Android-first, iOS not a priority
Android Chrome supports Web Push in a normal browser tab **and** installed as
a home-screen PWA — no install requirement. Josh's household is expected to
be primarily Android, saved to the home screen as an app, so **build and
verify against that**. iOS Safari *can* do Web Push, but only for an installed
PWA (Add to Home Screen) on iOS 16.4+, never in a plain Safari tab — this is a
real platform limitation, not a Tally bug, so don't spend effort working
around it. Ship for Android/desktop; let iOS work if it works, don't block on
it or build iOS-specific fallback UX.

## Notification inventory — trigger, recipients, copy (as built)
Five triggers — Josh's call was to keep this to events genuinely worth
interrupting someone for. Everything else considered (member
joined/removed/left, expense edited/deleted, Splitty activity, a weekly
balance-reminder digest) was explicitly **cut**, not deferred — see "Explicit
non-goals". **Nobody is ever notified of their own action** (actor excluded
from every recipient list, except #2 which nobody "did"). Deep-link = where
tapping the notification lands.

| # | Trigger | Recipients | Title | Body | Deep-link |
|---|---|---|---|---|---|
| 1 | `activity.type = 'expense_added'` — a person adds an expense | All other active members with a `userId` | `Tally-ho! {actor} added an expense` | `"{description}" — your share {fmt(yourShare)}` | `/?expense={id}` |
| 2 | `activity.type = 'recurring_generated'` — a recurring rule fires | **All** active members with a `userId` (automatic — nobody is excluded) | `Tally-ho! {description} was added` | `{fmt(amount)} split automatically — your share {fmt(yourShare)}` | `/?expense={id}` |
| 3 | `activity.type = 'settled'` — a payment is recorded | Only the **creditor** — never the payer, they know they just paid | `Tally-ho! {actor} paid you` | `{fmt(amount)} recorded` | `/` |
| 4 | `shopping_item` inserted — someone adds to the shared list | All other active members with a `userId` | `Tally-ho! {actor} added to the list` | `"{item}" — {n} items still to buy` | `/?tab=list` |
| 5 | `shopping_item.checked` flips false→true — someone crosses an item off | All other active members with a `userId` | `Tally-ho! {actor} crossed something off` | `"{item}" — {n} items still to buy` | `/?tab=list` |

**Per-recipient bodies.** #1 and #2 show each person *their own* share, so the
trigger emits one message per recipient (payload is a `messages` array), not
one broadcast body.

**#1 and #2 stay separate.** Conceptually the same category ("an expense
landed") with near-identical copy, but they are two independent triggers that
each fire their own notification — a recurring bill firing is never folded
into or suppressed by the regular expense-added path.

**Quiet window on #4 and #5.** Shopping-list events are rate-limited per
(actor, space, kind) by the `push_throttle` table: after one notification, that
person's further adds (or cross-offs) in that space stay silent for **10
minutes** (`_push_quiet_window()`). So planning a shop — adding eight items in
a row, or ticking a trolley-full off — sends one buzz, not eight. Adds and
cross-offs throttle independently, so crossing something off isn't muted by
having just added something. The body always carries the live "still to buy"
count, so the one notification you do get is current.

## Architecture (as built)
```
Event happens (expense added, recurring fires, settled, list add, list cross-off)
        │
        ▼
Trigger:  activity_push                  (after insert on `activity`,  #1–#3)
          shopping_item_added_push        (after insert on `shopping_item`, #4)
          shopping_item_checked_push      (after update on `shopping_item`, #5)
        │  builds one message PER RECIPIENT (each sees their own share),
        │  quiet-window checked for #4/#5 via push_throttle
        ▼
_push_send(messages)  →  pg_net.http_post
        │  URL + shared secret read from Supabase Vault
        ▼
Edge Function `send-push`  — verifies the shared secret, looks up each user's
                              push_subscription rows, sends a VAPID-signed
                              Web Push per device, deletes any that 404/410
        │
        ▼
Service worker `push` → showNotification(title, { body, data:{url}, tag:url })
        │  user taps
        ▼
`notificationclick` → focuses an open Tally tab (or opens one) at the deep link
        ▼
page.tsx reads ?expense= / ?tab=, switches space if the expense lives
elsewhere, opens the detail sheet, then strips the query params
```
Three trigger functions rather than one: #1–#3 read the `activity` table
(which already logs those events server-side in the same transaction as the
underlying change); #4/#5 read `shopping_item` directly, because the shopping
list was never logged to `activity` (that table is the expense/settlement
audit trail) and there was no reason to start routing list items through it.

## Data model — see the migration
`supabase/migrations/20260729000000_push_notifications.sql` is the source of
truth (applied live). It creates:
- `pg_net` extension (new for this project; joins `pg_cron`, `pgcrypto`,
  `supabase_vault`).
- **`push_subscription`** — one row per subscribed device (a user can have
  several: phone, desktop). RLS is owner-only (`user_id = auth.uid()`), so the
  client manages just its own rows via PostgREST; no RPC wrapper. Only the
  `SECURITY DEFINER` triggers and the service-role Edge Function read across
  users.
- **`push_throttle`** — `(actor_id, group_id, kind)` → `last_sent_at`, backing
  the 10-minute quiet window on the shopping-list events. RLS on with **no
  policies**: nothing client-side ever touches it.
- Helpers `_push_send` (Vault lookup + `pg_net` POST; silently no-ops if the
  Vault secrets aren't set yet, so a missing config can never break the write
  that triggered it), `_push_throttle_ok`, `_push_actor_name`, and `_push_fmt`
  (Rand formatting that mirrors the app's `fmt()` — verified: `R1 234,56`,
  `R0,99`, `R1 000 000,00`).
- The three triggers listed above.

Two secrets live in Supabase Vault (set once via the Management API, never in
committed SQL — same rule as `GEMINI_API_KEY`): `send_push_url` and
`send_push_shared_secret`.

## Edge Function `send-push`
`supabase/functions/send-push/index.ts`, deployed with **`--no-verify-jwt`**
because it does its own auth two ways:
- **From Postgres** (`pg_net` carries no Supabase session): requires the
  `x-shared-secret` header to match the `PUSH_SHARED_SECRET` env secret.
  Body: `{ messages: [{ user_id, title, body, url }, …] }`.
- **From the app's test button**: body `{ test: true }` plus the caller's JWT,
  verified with `auth.getUser()` like every other function here; pushes only
  to the caller's own devices.

Sends via `npm:web-push@3.6.7` (VAPID-signed), and **deletes any subscription
the push service rejects with 404/410** — the browser unsubscribed or the
endpoint expired — so the table self-cleans without a cron job.
Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`PUSH_SHARED_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

## Client
- **Repo** (`repo.ts`, both implementations):
  ```ts
  getPushState(): "granted" | "denied" | "default" | "unsupported";  // sync
  isPushEnabled(): Promise<boolean>;   // does this device have a saved row?
  enablePush(): Promise<void>;         // permission -> subscribe -> save
  disablePush(): Promise<void>;        // delete row + unsubscribe
  sendTestPush(): Promise<void>;       // test notification to your own devices
  ```
  `SupabaseRepo` upserts on `endpoint` (so re-enabling is idempotent) and
  fails with a clear message if no service worker is registered, rather than
  awaiting `navigator.serviceWorker.ready` forever — the SW only registers in
  production builds. `MemoryRepo` reports `"unsupported"`, so the demo shows a
  disabled toggle instead of failing when tapped.
- **`public/sw.js`** — `push` shows the notification (`tag: url` so repeats
  about the same thing collapse rather than stack); `notificationclick`
  focuses an already-open Tally tab and navigates it, falling back to opening
  a new window. Cache bumped to `tally-shell-v3`.
- **`page.tsx`** — consumes `?expense=<id>` / `?tab=list` once on load: opens
  the expense detail (fetching it and **switching the active space** if it
  lives in another one), then strips the params so a refresh doesn't reopen it.
- **Settings sheet** — a "Notifications" toggle for this device plus, once on,
  a "Send a test notification" link. Copy stays generic ("Not supported in
  this browser") rather than platform-specific.


## What Josh needs to do
Nothing to *provide* — VAPID keys are generated locally (no third-party
account, unlike the Gemini key); they're already generated and set as Supabase
Function secrets + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on Vercel (all environments).

**One thing to verify**, because it can't be done from Claude's tooling:
install Tally on your Android home screen → **Settings → Notifications** on →
**"Send a test notification"**. You should get "Tally-ho! Test notification"
within a second or two. If it doesn't arrive, the likely culprits are (a)
notification permission denied at the OS level for the installed PWA, or (b)
the service worker not yet updated — force-close and reopen the app once
(the SW cache was bumped to `v3`, which triggers the update on next launch).

## Explicit non-goals for v1 (several of these were cut on purpose, not deferred)
- **No push for member joined/removed/left** — cut per Josh, 2026-07-25.
- **No push for expense edited/deleted** — cut per Josh, 2026-07-25.
- **No Splitty push notifications at all** (guest joined/locked-in/fully-covered)
  — cut per Josh, 2026-07-25. (It would only ever have gone to the bill's
  admin, never guests — see ADR-0013 — but the whole category is out now.)
- **No weekly balance-reminder digest** — cut per Josh, 2026-07-25. (Also
  architecturally the odd one out: time-based via `pg_cron`, not event-based
  off a table insert, and would've needed a one-off server-side balance
  computation — moot now that it's cut, but worth remembering if it's ever
  reconsidered.)
- No per-category notification preferences — one master toggle.
- No native app / APNs — Web Push only.
- No notification grouping/collapsing (e.g. multiple expense-adds coalesced
  into one "3 new expenses" notification) — each event sends its own.
- No iOS-specific fallback UX or messaging — see "Platform support" above.

## Backlog: multi-currency (not part of this phase)
Flagged by Josh while reviewing this spec, not something to act on now:
notification copy uses `fmt()`/`fmtR()` (`src/lib/domain/money.ts`), which
hardcode a `"R"` prefix, same as the `group.currency` column's
`check (currency = 'ZAR')` constraint (`20260702000000_phase1_schema.sql`).
The whole app is ZAR-only today, not just push copy. Revisit if there's ever
a real need (e.g. a non-South-African household) — would touch `fmt()`, the
`currency` check constraint, and every place that formats money, not just
notifications. No action needed until that need actually exists.

## Build order — all done except the on-device check
- [x] VAPID key pair generated; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on Vercel (prod,
      preview, dev) and in `.env.local`; `VAPID_*` + `PUSH_SHARED_SECRET` as
      Supabase Function secrets.
- [x] Migration `20260729000000_push_notifications.sql` applied live and
      recorded in `schema_migrations`; `send_push_url` +
      `send_push_shared_secret` stored in Vault.
- [x] Edge Function `send-push` deployed (`--no-verify-jwt`; own auth).
- [x] `public/sw.js` `push`/`notificationclick`; cache bumped to v3.
- [x] Repo methods in `SupabaseRepo` + `MemoryRepo`; `setShoppingItemChecked`
      now stamps `updated_by` (it never did — needed for cross-off attribution,
      and correct sync metadata regardless).
- [x] Settings sheet: Notifications toggle + test-notification button.
- [x] `page.tsx` deep-link handling (`?expense=`, `?tab=`) with space switching.
- [x] Server-side E2E verified on synthetic data (see the status note at the
      top of this section), then fully cleaned up.
- [ ] **On-device check — Josh.** Install on Android, Settings →
      Notifications → "Send a test notification". This is the one link in the
      chain that can't be verified from Claude's tooling.

## If a notification doesn't arrive — where to look
1. `select count(*) from push_subscription;` — did the device register?
2. `select status_code, content from net._http_response order by created desc
   limit 5;` — did the trigger reach `send-push`, and what did it say?
   `{"sent":N}` means it handed off to the push service successfully.
3. `{"sent":0,"pruned":N}` means the subscription was stale — re-toggle
   Notifications in Settings to re-subscribe.
4. `select * from push_throttle;` — a shopping-list event may simply be inside
   its 10-minute quiet window.
