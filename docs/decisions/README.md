# Architecture Decision Records

Every significant, hard-to-reverse technical choice gets an ADR. Decisions
sourced from the planning docs are recorded here too, so this folder is the
single authoritative list — an LLM (or human) resuming the project should treat
these as settled unless an ADR is explicitly superseded.

Format: one file per decision, numbered, with Status / Context / Decision /
Consequences. To change a decision, write a new ADR that supersedes the old one
(don't edit history).

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-nextjs-pwa.md) | Next.js PWA, not native mobile | Accepted |
| [0002](0002-supabase-backend.md) | Supabase (Postgres + Auth + Storage + Realtime) backend | Accepted |
| [0003](0003-integer-cents-money.md) | Integer cents + largest-remainder splits | Accepted |
| [0004](0004-derived-balances-sync-model.md) | Balances derived (never stored/synced); client UUIDs; soft deletes; LWW | Accepted |
| [0005](0005-repository-layer.md) | Single Repo interface; online-first Phase 1, Dexie local-first Phase 2 | Accepted |
| [0006](0006-passwordless-otp-auth.md) | Passwordless email OTP auth | Accepted |
| [0007](0007-plain-css-design-tokens.md) | Plain CSS + design-token custom properties (no Tailwind/UI kit) | Accepted |
| [0008](0008-auto-categorization.md) | Auto-categorization from description keywords; no manual picker | Accepted |
| [0009](0009-offline-phase-deferred.md) | Offline-first phase moved to end of project (order: 1→3→4→5→2→6) | Accepted |
| [0010](0010-salary-split-rpc.md) | Salary-proportional shares computed server-side (privacy-preserving RPC) | Accepted |
| [0011](0011-two-level-categories.md) | Two-level category taxonomy (parent→subcategory), auto-assign + manual override | Accepted (amends 0008) |
