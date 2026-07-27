# ADR-0014: Push notifications via Web Push (VAPID) + an activity-driven trigger

**Status:** Accepted (2026-07-24) · **Source:** Josh (Phase 9 spec) · ROADMAP Phase 9

## Context
Tally is a PWA with no native app, so "push notifications" means the **Web
Push API** (Push API + Notification API), not APNs/FCM SDKs. Josh wants
household members to be nudged when something happens elsewhere in the app —
an expense added, a payment recorded, someone joining or leaving the space,
a recurring bill firing, activity on a Splitty bill — without opening Tally.
Two existing facts shape the design:
- **The `activity` table already logs almost every group-scoped event**
  (`expense_added`, `expense_edited`, `expense_deleted`, `settled`,
  `member_joined`, `recurring_generated` — `supabase/migrations/20260702000000_phase1_schema.sql`),
  written **server-side inside the same RPC/transaction** as the underlying
  change (e.g. `create_expense` inserts both the expense and its activity row
  atomically).
- **Splitty (Phase 8, ADR-0013) is deliberately outside the group/`activity`
  model** — guests have no Supabase auth session, so there is no `auth.uid()`
  to notify. Push requires a stable subscribed identity; guests don't have one.

## Decision
- **Web Push, not a third-party push service.** No Firebase Cloud Messaging,
  no APNs SDK, no per-user Google/Apple account — consistent with this
  project's existing "one central credential, free tier, no vendor lock-in"
  posture (ADR-0012's Gemini key). A single **VAPID key pair** identifies
  Tally as the sending application: the public key ships in client code, the
  private key lives only as a Supabase Edge Function secret.
- **One generic trigger, not one-off calls in every RPC.** A single
  `AFTER INSERT` trigger on `activity` (`notify_activity_push()`) maps
  `activity.type` → recipients + notification copy, and calls a new
  `send-push` Edge Function via **`pg_net.http_post`** (extension not yet
  enabled on this project — added in the Phase 9 migration). This reuses the
  event log that already exists instead of scattering push-sending logic
  across `create_expense`, `update_expense`, `record_settlement`, etc. Two
  new `activity_type` values (`member_removed`, `member_left`) are added so
  membership changes flow through the same trigger instead of being
  special-cased.
- **Secrets for the trigger via Supabase Vault**, not hardcoded in migration
  SQL. `supabase_vault` is already enabled on this project. The `send-push`
  Edge Function URL + a shared secret the function checks are stored in
  `vault.secrets` and read via `vault.decrypted_secrets` inside the trigger
  function — nothing sensitive is committed to a `.sql` file.
- **Splitty gets its own, separate, direct calls** — not routed through the
  generic `activity` trigger, because Splitty bills have no `group_id` and
  guests have no `auth.uid()`. `splitty_join` and `splitty_set_locked` (on
  lock, not unlock) call `pg_net.http_post` directly, targeting only the
  **bill's authenticated creator** (`split_bill.created_by`). **Guests never
  receive push** — they only ever see live updates via the Supabase Realtime
  subscription already wired up for `/split/[code]` (Phase 8). This is a
  deliberate scope boundary, not an oversight: there is no stable, permission-
  granted identity to push to for an anonymous guest.
- **One master on/off toggle in v1**, not per-category preferences. A
  `push_subscription` table (RLS: owner-only) holds each device's
  subscription; a user can have several (phone + desktop). No granular
  "notify me about X but not Y" — that's future work if it turns out to be
  wanted.
- **Never self-notify.** Every recipient list explicitly excludes the actor
  who caused the event.

## Consequences
- **iOS Safari requires the PWA to be installed** (Add to Home Screen) —
  Web Push does not work in an ordinary Safari tab on iOS, only in the
  installed, standalone PWA, and only iOS 16.4+. Android Chrome and desktop
  browsers work in a normal tab, no install required. This materially affects
  whether push is useful for this household depending on what phones they're
  on — flagged prominently in the Phase 9 spec rather than assumed away.
- `pg_net` is a new extension for this project (alongside the already-enabled
  `pg_cron`, `pgcrypto`, `supabase_vault`) — needs enabling in the Phase 9
  migration, same free-tier-included mechanism already used for recurring
  generation.
- Because recipients are resolved from `group_member.user_id`, **placeholder
  members never receive push** (they have no `auth.uid()`) — expected, same
  boundary as everywhere else placeholders hit a wall (e.g. salary splits).
- If Splitty ever needs guest-facing push, it would require promoting guests
  to a real (if anonymous) auth identity first — out of scope here, consistent
  with ADR-0013's "revisit if guests ever need more" framing.
