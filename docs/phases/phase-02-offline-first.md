*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 2 — Offline-first → M2 "Works anywhere" (MOVED TO END — ADR-0009, Josh 2026-07-13)
- [ ] Dexie local store behind the Repo · outbox + sync engine · SW precache +
      background sync · LWW conflict resolution · sync-state pill (synced /
      pending / offline per design) · offline fallbacks for the server RPCs
      (expenses, invites, salary shares)

## Tally rebrand + polish batch (Josh, 2026-07-22)
- [x] **Rebrand SettleUp → Tally** — provided hexagon-T icons processed into
      192/512/maskable (full-bleed dark) + favicon + apple-touch-icon; manifest,
      metadata, Logo (now the real icon), welcome/invite/export strings. Same
      colour scheme. URL unchanged (splitclone-…vercel.app still serves).
- [x] **Settle-up reworked → "Clear the tally"** — you can only record a payment
      for money YOU owe (clearing your own debt); amounts owed *to* you are
      info-only (the other person clears on their side). 3+ members: Home hero
      shows the total net + a per-person breakdown, and the sheet lists
      "X owes you" per person.
- [x] **Spaces management** — the switcher is now a full manager (switch,
      rename, delete with guards: ≥1 space must remain, deleting the active one
      switches first) reachable from the header ▾ AND Settings → Manage.
      `repo.deleteGroup` (soft delete) in both repos.
- [x] **Settings gains Manage → Spaces + Recurring bills**; the separate Home
      "Upcoming/recurring" card is removed (recurring is set up during Add
      expense and managed from Settings).
- Notifications/activity kept (already shows who added each item).
