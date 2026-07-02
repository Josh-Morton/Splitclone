# ADR-0002: Supabase backend (Postgres + Auth + Storage + Realtime)

**Status:** Accepted (2026-07-02) · **Source:** Scope doc §2.1/§14, Phase 1 plan §2

## Context
Need a shared source of truth between two phones, authentication, image storage
(receipts, Phase 5), and realtime updates (shopping list, Phase 4) — free at
two-user scale, with no servers to manage.

## Decision
**Supabase** — one managed provider for Postgres, Auth, Storage, Realtime and
scheduled jobs (pg_cron). Chosen over Firebase because the expense ledger is
deeply relational (expenses ↔ payers ↔ splits ↔ members) and Postgres +
Row-Level Security fits it far better than a document store. Chosen over a
custom backend to avoid undifferentiated infra work.

## Consequences
- All authorization is enforced at the database via RLS
  (see `supabase/migrations/0001_phase1_schema.sql`) — a compromised client
  cannot read another household's data.
- Free projects pause after 7 days of inactivity → mitigated by a daily
  keep-alive cron (`/api/keepalive`, `settleup/vercel.json`).
- The client uses only the anon key; the service-role key stays server-side
  (recurring-expense job, Phase 4).
- Exit ramp if pricing ever bites: Neon (Postgres) + Cloudflare Pages, at the
  cost of stitching auth/storage separately.
