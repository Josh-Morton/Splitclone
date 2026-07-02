# SettleUp

A Splitwise-style shared-expense tracker for couples & households, in South
African Rand — no paywalls, works offline, adds salary-proportional "fair
share" splitting and a shared shopping list.

**Stack:** Next.js PWA (Vercel) + Supabase (Postgres, Auth, Storage, Realtime).
Free tier end-to-end for a two-person household.

| I want to… | Go to |
|---|---|
| See status & what's next | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Understand the code | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| See why decisions were made | [docs/decisions/](docs/decisions/README.md) |
| Set up Supabase/Vercel | [docs/SETUP.md](docs/SETUP.md) |
| Continue as an LLM/new contributor | [CLAUDE.md](CLAUDE.md) |
| See the intended UI | open `design_handoff_settleup/SettleUp.dc.html` in a browser |

## Repo layout
```
settleup/                  the Next.js PWA (app code, domain maths, tests)
supabase/migrations/       database schema + Row-Level Security
docs/                      architecture, ADRs, roadmap/status, setup guide
design_handoff_settleup/   high-fidelity design prototype (the UI spec)
*.docx                     source planning documents (scope + phase-1 plan)
```

## Quick start
```bash
cd settleup
npm install
npm run dev    # demo household at http://localhost:3000
npm test       # 41 unit tests (splits, balances, money, repo contract)
```
