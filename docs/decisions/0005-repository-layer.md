# ADR-0005: Single Repo interface; online-first Phase 1, local-first Phase 2

**Status:** Accepted (2026-07-02) · **Source:** Phase 1 plan §3.2 ("architecture guardrail")

## Context
Phase 1 ships online-first for speed; Phase 2 rebuilds the data layer as
local-first (IndexedDB via Dexie + a durable outbox + sync engine). Screens
must not be rewritten when that happens.

## Decision
All UI code reads and writes through **one interface** —
`settleup/src/lib/data/repo.ts` — and never touches Supabase, Dexie, or fetch
directly. Implementations:

- `MemoryRepo` (done): in-memory demo household; the reference implementation
  of the contract's validation semantics, used until Supabase is connected and
  for the "explore the demo" flow.
- `SupabaseRepo` (epics E1–E5): online-first against Postgres/RLS.
- `LocalFirstRepo` (Phase 2): Dexie mirror + outbox that syncs to Supabase in
  the background.

`getRepo()` in `lib/data/index.ts` is the single place that picks the
implementation.

## Consequences
- Phase 2 is a data-layer swap, not an app rewrite.
- Contract tests written against `MemoryRepo` double as the spec for later
  implementations.
- Slight ceremony: new features must extend the interface first. That is the
  point.
