# SETUP — the manual steps (need Josh's accounts)

Everything in the repo is ready; these are the only steps that require a human
with account access. ~30 minutes total. Infrastructure cost: **R0/month**.

## 1. GitHub repo (5 min)
1. Create a private repo (e.g. `settleup`) on GitHub.
2. From this folder:
   ```bash
   git remote add origin git@github.com:<you>/settleup.git
   git push -u origin main
   ```

## 2. Supabase project (10 min)
1. https://supabase.com → New project (free tier). Region: closest to ZA
   (currently `af-south-1` / Cape Town if offered, otherwise EU-west).
2. **Run the migration.** Two ways — pick one:

   **a) SQL Editor (no tooling).** Open it directly at
   **https://supabase.com/dashboard/project/_/sql/new** (the `_` auto-redirects
   to your project; this is the "New query" editor if you can't find the sidebar
   icon — it's the `</>`-style "SQL Editor" item on the left). Paste the entire
   contents of `supabase/migrations/20260702000000_phase1_schema.sql`, then click
   **Run** (or ⌘/Ctrl+Enter). You should see "Success. No rows returned".

   **b) CLI (repeatable, recommended).** From the repo root:
   ```bash
   supabase login                       # opens a browser to authorize
   supabase link --project-ref <ref>    # <ref> is in your project URL / Settings → General
   supabase db push                     # applies everything in supabase/migrations/
   ```
   The `<ref>` is the 20-char id in `https://<ref>.supabase.co` (or Dashboard →
   Settings → General → "Reference ID"). `link` will prompt for your database
   password (set when you created the project; resettable under Settings →
   Database).
3. **Auth:** Authentication → Providers → Email: enable, and turn ON
   "Email OTP" / magic code sign-in (we use passwordless OTP, ADR-0006).
   Disable "Confirm email" double-opt-in if you want the fastest first sign-in.
4. **Keys:** Settings → API → copy the Project URL and `anon` key into
   `settleup/.env.local` (copy `settleup/.env.example`). Never copy the
   `service_role` key into any `NEXT_PUBLIC_` var.

## 3. Vercel deploy (10 min)
1. https://vercel.com → Add New Project → import the GitHub repo.
2. **Root Directory:** set to `settleup/` (the app lives in a subfolder).
3. Environment variables: add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. Every push to `main` now auto-deploys.
5. The `vercel.json` cron pings `/api/keepalive` daily so the free Supabase
   project never pauses.

## 4. Install on phones (2 min)
Open the deployed URL in Chrome on Android → menu → **Add to Home screen**.
It should open full-screen with the SettleUp icon.

## Local development
```bash
cd settleup
npm install
npm run dev      # http://localhost:3000 — demo household until env vars set
npm test         # domain + repo tests
npm run build    # must pass before pushing
```

## Verification checklist after setup
- [ ] Deployed URL loads over HTTPS and installs to a home screen
- [ ] SQL editor shows the 9 tables with RLS enabled
- [ ] `/api/keepalive` returns `{"ok":true,...}`
- [ ] Two test users: user A cannot select user B's group via the REST API
      (test in the dashboard's API docs with each user's JWT)
