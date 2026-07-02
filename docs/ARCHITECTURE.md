# SettleUp — Architecture

> Companion to the two source specs (`SettleUp - Scope, Data Model & Roadmap.docx`,
> `SettleUp - Phase 1 Plan, Roadmap & Infrastructure.docx`) and the design
> handoff (`design_handoff_settleup/`). Those explain *what and why*; this
> explains *how the code is shaped*. Settled choices live in
> [docs/decisions/](decisions/README.md).

## System shape

```
┌──────────────────────────────────────────────┐
│  Next.js PWA (Vercel, free)   settleup/      │
│                                              │
│  Screens (src/app)                           │
│      │  only ever call…                      │
│  Repo interface (src/lib/data/repo.ts)       │
│      │  implementations:                     │
│      ├─ MemoryRepo    (demo household, done) │
│      ├─ SupabaseRepo  (Phase 1, E1–E5)       │
│      └─ LocalFirstRepo(Phase 2: Dexie+outbox)│
│      │                                       │
│  Domain maths (src/lib/domain) — pure fns    │
│    money · splits · balances · simplify ·    │
│    auto-category                             │
└──────────────┬───────────────────────────────┘
               │ Supabase JS (anon key, RLS-constrained)
┌──────────────▼───────────────────────────────┐
│  Supabase (free tier)                        │
│  Postgres (schema + RLS in supabase/         │
│  migrations/) · Auth (email OTP) · Storage   │
│  (receipts, P5) · Realtime (list, P4) ·      │
│  pg_cron (recurring generation, P4)          │
└──────────────────────────────────────────────┘
```

## Layers and their rules

### 1. Domain (`settleup/src/lib/domain/`) — pure, no I/O
The maths of the product, ported faithfully from the prototype and scope doc §7.
Everything is a pure function; everything is unit-tested (`__tests__/`).

| Module | Contents | Key invariant |
|---|---|---|
| `money.ts` | `fmt` (`R1 200,00`), `fmtR`, `parseCents` | integer cents only |
| `split.ts` | `splitEqual`, `splitWeighted`, `computeSplit`, reconciliation validators | every split sums exactly to the total (largest-remainder) |
| `balance.ts` | `computeBalances`, `simplifyDebts` | balances derived, never stored; nets sum to zero |
| `category.ts` | `autoCategory` keyword map, category display meta | map order matters; keep in sync with prototype |
| `types.ts` | entity types incl. `SyncMeta` on every synced record | ids are client UUIDs; deletes are soft |

### 2. Data (`settleup/src/lib/data/`) — the only I/O boundary
UI never talks to Supabase/IndexedDB directly (ADR-0005). `repo.ts` defines the
contract including validation semantics (amount > 0, payers and splits must sum
to the total → `ValidationError`). `getRepo()` selects the implementation;
currently the seeded `MemoryRepo` demo until Supabase env vars exist.

### 3. Screens (`settleup/src/app/`)
App Router, dark-only, mobile-first (~430px column). Styling uses only the
design tokens in `globals.css` (ADR-0007). The design handoff README + the
interactive prototype (`design_handoff_settleup/SettleUp.dc.html` — open in a
browser, tap "Skip — explore the demo household") are the UI spec: screens,
interactions, motion, currency formatting. `support.js` in the handoff is a
prototype runtime — never port it.

### 4. Database (`supabase/migrations/`)
`0001_phase1_schema.sql` creates the Phase-1 tables (profile, group,
group_member, invite, expense, expense_payer, expense_split, settlement,
activity) with:
- integer-cents `bigint` money columns, positive-amount checks
- sync metadata on every table (`version`, `updated_by`, `deleted_at`, `client_id`)
- deferred constraint triggers rejecting unbalanced expenses
- RLS: users touch only groups they actively belong to; salary is owner-only
  unless `salary_visible` (group-mates read via the `profile_public` view)
- auto-created profile row on signup

## Cross-cutting rules (do not violate)

1. **Money is integer cents.** No floats, ever. Format only at display time.
2. **Splits must reconcile exactly.** Use the domain split functions; never
   hand-roll division.
3. **Balances are computed, never persisted.**
4. **All ids are client-generated UUIDs** (`uuid` package).
5. **Deletes are soft** (tombstones) with a 4s Undo in the UI.
6. **UI goes through the Repo.** New data needs = extend `repo.ts` first.
7. **Secrets:** only the anon key ships to the client; service-role key is
   server-only (Phase 4 jobs). RLS is the real security boundary.
8. **Styling:** tokens from `globals.css` only; dark-mode-only; system fonts.

## Offline strategy (Phase 2 preview)
Phase 1 is online-first behind the Repo. Phase 2 adds: Dexie (IndexedDB)
mirror of the schema → durable outbox of local writes → sync engine (push
outbox, pull by cursor) → per-field LWW via `version` + `updated_by` →
service-worker precache + background sync. The schema already carries
everything this needs (ADR-0004).

## Testing strategy
- Domain: exhaustive unit tests incl. the scope doc's worked examples and
  cent-remainder sweeps (`npm test` in `settleup/`).
- Data: contract tests against `MemoryRepo` (`src/lib/data/__tests__/`) —
  reuse the same suite for `SupabaseRepo`/`LocalFirstRepo` when they land.
- Phase 1 exit (E6): balance scenario tests vs hand calculations, then a
  one-week real-data trial (milestone M1).
