# ADR-0009: Offline-first phase moved to the end of the project

**Status:** Accepted (2026-07-13) · **Decided by:** Josh · **Amends:** scope doc §12 phase order

## Context
The scope doc ordered offline-first as Phase 2, arguing it is architectural and
cheaper to build early. After a week of live use planning, Josh chose to
prioritize visible features (fair-share splits, recurring bills, shopping
list, reports) and do offline last.

## Decision
Execution order becomes: **Phase 1 → 3 → 4 → 5 → 2 (offline) → 6 (polish)**.
Phase numbering/names are kept to match the source documents; only the order
changes. Milestone M2 ("Works anywhere") moves to late in the project.

## Consequences
- The original "cheaper early" argument was really an argument for the
  *foundations*, and those are already in place from day one: the single Repo
  boundary (ADR-0005), client UUIDs, integer cents, soft deletes, and sync
  metadata (`version`/`updated_by`/`deleted_at`/`client_id`) on every table
  (ADR-0004). Deferring the sync engine itself costs no schema or screen rework.
- New server-side dependencies added meanwhile (create/update_expense RPCs,
  redeem_invite, salary_split_shares) will need offline fallbacks or outbox
  queueing when the offline phase lands — noted in ARCHITECTURE.md.
- Until then the app requires a connection; the minimal service worker keeps
  the shell loading on flaky networks but writes need the backend.
