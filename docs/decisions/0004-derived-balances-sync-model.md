# ADR-0004: Derived balances; client UUIDs; soft deletes; last-writer-wins sync

**Status:** Accepted (2026-07-02) · **Source:** Scope doc §8.2–8.4, §9.4

## Context
Two phones edit the same ledger, sometimes offline (Phase 2). Sync conflicts
must never corrupt balances.

## Decision
Four rules, applied from day one so Phase 2 needs no retrofit:

1. **Balances are never stored or synced.** They are pure functions of the
   expense + settlement set (`lib/domain/balance.ts`). Once the record set
   converges, balances agree by construction — the ledger self-heals.
2. **Ids are client-generated UUIDs.** A record created offline keeps its
   identity when synced; retries are idempotent (no duplicate-on-retry).
3. **Deletes are soft** (`deleted_at` tombstone) so a delete on one device
   propagates and is not resurrected by a stale create. Also powers the
   4-second Undo toast in the UI.
4. **Conflicts resolve by last-writer-wins** using a per-record logical clock
   (`version`), with actor id as tiebreaker. Every synced table carries
   `created_at / updated_at / version / updated_by / deleted_at / client_id`.
   Shopping-list operations (add/toggle/remove) merge commutatively.

Debt simplification is the greedy largest-creditor-vs-largest-debtor heuristic
(same as Splitwise); it only produces *suggested* payments — history is never
rewritten.

## Consequences
- Every table pays a small metadata cost now; offline sync becomes a data-layer
  swap instead of a schema migration later.
- LWW means a truly simultaneous edit of the same field loses one side — an
  accepted trade-off for a two-person household (the activity feed keeps the
  audit trail).
