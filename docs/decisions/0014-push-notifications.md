# ADR-0014: Push notifications via Web Push (VAPID) + three table triggers

**Status:** Accepted & implemented (2026-07-24; scope trimmed 2026-07-25;
shipped 2026-07-26) · **Source:** Josh (Phase 9) · ROADMAP Phase 9

## Context
Tally is a PWA with no native app, so "push notifications" means the **Web
Push API** (Push API + Notification API), not APNs/FCM SDKs. Josh wants
household members nudged about a small, deliberately narrow set of events —
an expense added (including an automatic recurring one), a payment recorded,
someone adding to or crossing off the shared shopping list — without opening
Tally. Two
existing facts shape the design:
- **The `activity` table already logs `expense_added`, `expense_edited`,
  `expense_deleted`, `settled`, `member_joined`, `recurring_generated`**
  (`supabase/migrations/20260702000000_phase1_schema.sql`), written
  **server-side inside the same RPC/transaction** as the underlying change
  (e.g. `create_expense` inserts both the expense and its activity row
  atomically). Three of those types are relevant here (`expense_added`,
  `recurring_generated`, `settled`); the rest are deliberately not sent as
  push (see Decision).
- **The shopping list was never logged to `activity`** — that table is
  specifically the expense/settlement audit trail (see
  `activity-overlay.tsx`), and there's no reason to start routing shopping
  items through it just to get a push notification out of it.

An earlier draft of this ADR covered a much larger surface — membership
joins/removals/leaves, expense edits/deletes, all of Splitty, a weekly
balance-reminder digest. **Josh cut all of that on 2026-07-25**, on review;
the shopping-list cross-off was added back on 2026-07-26. Five triggers
survive. This revision reflects the shipped scope, not the original draft.

## Decision
- **Web Push, not a third-party push service.** No Firebase Cloud Messaging,
  no APNs SDK, no per-user Google/Apple account — consistent with this
  project's existing "one central credential, free tier, no vendor lock-in"
  posture (ADR-0012's Gemini key). A single **VAPID key pair** identifies
  Tally as the sending application: the public key ships in client code, the
  private key lives only as a Supabase Edge Function secret.
- **Only five triggers, chosen deliberately narrow:**
  1. `expense_added` (a person adds an expense)
  2. `recurring_generated` (a recurring rule fires)
  3. `settled` (a payment is recorded) — creditor only, never the payer
  4. a `shopping_item` row is inserted (someone adds to the list)
  5. `shopping_item.checked` flips false→true (someone crosses an item off)
     — added 2026-07-26 on Josh's request, same shape as #4

  Everything else considered in the original draft — `member_joined`, two new
  types that would've been added for removal/leaving, `expense_edited`,
  `expense_deleted`, all Splitty activity (guest joins/locks/bill-covered),
  and a scheduled balance-reminder digest — is **cut, not deferred-and-off**.
  If any of these come back, that's a new decision, not "flip a flag" — the
  supporting code (extra `activity_type` values, Splitty's direct
  `pg_net` calls) was never built.
- **Three trigger functions, not one generic one.** `activity_push()`
  (`AFTER INSERT` on `activity`, filtered to the three relevant types),
  `shopping_item_added_push()` (`AFTER INSERT`) and
  `shopping_item_checked_push()` (`AFTER UPDATE`, only on a false→true
  `checked` flip). All call the same `send-push` Edge Function via
  **`pg_net.http_post`** (extension newly enabled in the Phase 9 migration).
- **Per-recipient message bodies.** The payload is a `messages` array, one
  entry per recipient, because the expense notifications show each person
  *their own* share — a single broadcast body couldn't do that.
- **A quiet window on the shopping-list events**, backed by a `push_throttle`
  table: after notifying, that actor's further adds (or cross-offs) in that
  space stay silent for 10 minutes. Bulk list-building is the normal case and
  one buzz per item would be intolerable. Adds and cross-offs throttle
  independently. The expense/settlement triggers are deliberately *not*
  throttled — those are low-frequency and individually meaningful.
- **`send-push` is deployed `--no-verify-jwt` and does its own auth**: a
  shared secret for Postgres callers (`pg_net` carries no Supabase session, so
  the platform's JWT gate would reject every trigger), and a normal
  `auth.getUser()` check for the app's test button. Leaving the platform gate
  on would have made the whole trigger path silently 401.
- **Every notification title is prefaced "Tally-ho!"** — a fixed literal
  string, not configurable, baked into the copy-building code in both
  trigger functions. Format: `Tally-ho! {event summary}`.
- **Secrets for the triggers via Supabase Vault**, not hardcoded in migration
  SQL. `supabase_vault` is already enabled on this project. The `send-push`
  Edge Function URL + a shared secret it checks are stored in `vault.secrets`
  and read via `vault.decrypted_secrets` inside both trigger functions —
  nothing sensitive is committed to a `.sql` file.
- **One master on/off toggle in v1**, not per-category preferences. A
  `push_subscription` table (RLS: owner-only) holds each device's
  subscription; a user can have several (phone + desktop).
- **Never self-notify.** Every recipient list explicitly excludes the actor
  who caused the event (`recurring_generated` is the one exception — nobody
  "did" it live, so nobody is excluded).
- **Android is the target platform; iOS is not a design constraint.** Build
  and verify against Android Chrome (works in a normal tab or installed,
  no install requirement). iOS Safari can do Web Push, but only for an
  installed PWA on 16.4+ — that's a real platform limitation, not something
  to build fallback UX around. No iOS-specific messaging in the client.

## Consequences
- `pg_net` is a new extension for this project (alongside the already-enabled
  `pg_cron`, `pgcrypto`, `supabase_vault`) — needs enabling in the Phase 9
  migration, same free-tier-included mechanism already used for recurring
  generation.
- Because recipients are resolved from `group_member.user_id` /
  `shopping_item.added_by`, **placeholder members never receive push** (they
  have no `auth.uid()`) — expected, same boundary as everywhere else
  placeholders hit a wall (e.g. salary splits).
- **Splitty gets no push notifications of any kind.** Not because it's
  architecturally impossible (the bill's authenticated creator *could* have
  been targeted, same shape as the membership-removal case) — it was in the
  original draft and Josh cut it on review. If it's ever wanted back, guests
  themselves still could never receive push (no `auth.uid()` — ADR-0013), only
  the admin could.
- If a broader notification surface is wanted later (membership changes,
  edit/delete visibility, a balance reminder), each is a new, separate
  decision — this ADR intentionally does not leave half-built scaffolding
  (unused `activity_type` values, dormant trigger branches) for them.
- **Notification copy hardcodes Rand** via `_push_fmt()`, a SQL mirror of the
  app's `fmt()`. That's a second place ZAR is baked in (alongside `fmt()` and
  the `group.currency` check constraint) — noted in the ROADMAP's
  multi-currency backlog item, not a new constraint introduced here.
- **Delivery to a physical handset is the one unverified link.** Everything up
  to and including a real VAPID-signed, encrypted send to Google's FCM
  endpoint was verified end-to-end server-side; a real device round-trip
  needs a real device.
