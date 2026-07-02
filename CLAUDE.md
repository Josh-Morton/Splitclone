# SettleUp — guide for LLMs (and humans) continuing this project

SettleUp is a Splitwise-style shared-expense tracker for a two-person household
(Josh + partner), in South African Rand, built as a Next.js PWA on Vercel +
Supabase (both free tier). This file is the entry point for continuing work
from any state — read it first, then follow the pointers.

## Start here, in order
1. **[docs/ROADMAP.md](docs/ROADMAP.md)** — the live status board. What's done,
   what's next. **Keep it updated as you work** — flip checkboxes, bump the
   "Last updated" line.
2. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the code is shaped,
   plus the cross-cutting rules you must not violate.
3. **[docs/decisions/](docs/decisions/README.md)** — settled decisions (ADRs).
   Don't relitigate them; supersede with a new ADR if something must change.
4. **[docs/SETUP.md](docs/SETUP.md)** — the manual Supabase/Vercel steps that
   need Josh's accounts.

## Source-of-truth documents (root of repo)
- `SettleUp - Scope, Data Model & Roadmap.docx` — full product scope, data
  model, split/settlement maths (§7 is implementable spec), security model,
  6-phase roadmap. Extract text with python-zipfile/pandoc if needed.
- `SettleUp - Phase 1 Plan, Roadmap & Infrastructure.docx` — Phase-1 epics
  E0–E6 with acceptance criteria; later phases in the same structure.
- `design_handoff_settleup/` — **the UI spec.** `README.md` has design tokens,
  every screen, all interactions. `SettleUp.dc.html` is a working prototype:
  open in a browser, tap "Skip — explore the demo household". Recreate its
  look/behavior in React; **never port `support.js`** (prototype runtime).

## The codebase (`settleup/`)
Next.js 16 App Router + TypeScript. Note `settleup/AGENTS.md`: this Next.js
version may differ from your training data — check `node_modules/next/dist/docs/`
when unsure.

- `src/lib/domain/` — pure maths (money, splits, balances, simplify,
  auto-category), fully unit-tested. The worked examples from scope doc §7 are
  encoded as tests.
- `src/lib/data/repo.ts` — **the only data boundary.** UI code never touches
  Supabase/fetch/IndexedDB directly (ADR-0005). `MemoryRepo` is the demo +
  reference implementation; `SupabaseRepo` is the next one to build (E4).
- `src/app/` — screens. Styling only via tokens in `globals.css` (ADR-0007).
- `supabase/migrations/0001_phase1_schema.sql` — schema + RLS, written, not
  yet applied (needs the Supabase project, docs/SETUP.md).

## Iron rules (from the ADRs — violating these breaks the product)
- Money = **integer cents**, always. Display via `fmt()` → `R1 200,00`.
- Splits must sum **exactly** to the total (largest-remainder). Use the domain
  functions; never hand-roll money division.
- Balances are **derived, never stored/synced**.
- Ids are **client-generated UUIDs**; deletes are **soft** (tombstone + undo).
- Only the **anon key** in client code; RLS is the security boundary; salary
  is private by default.
- Dark-mode-only, mobile-first, system fonts, design tokens only.

## Verify before claiming done
```bash
cd settleup && npm test && npm run build
```
Phase-1 exit criteria are in the plan doc §3.6; milestone M1 = one week of
real use with balances always matching a hand calculation.
