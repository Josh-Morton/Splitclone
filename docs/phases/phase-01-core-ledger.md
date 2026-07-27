*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 1 — Core ledger (MVP) → milestone M1 "It works for us"

- [x] **E1 Auth & onboarding** — email OTP sign-in (ADR-0006; code entry +
      magic-link fallback), onboarding (name → optional salary → create space),
      client-side session + route guards, demo mode. Join-space-by-code lands
      with E3. (2026-07-09, verified in browser)
- [x] **E2 Schema live** — migration + expense RPCs applied; RLS verified with
      two test users via REST (cross-tenant reads AND writes blocked; salary
      private; unbalanced expenses rejected by deferred triggers) (2026-07-09)
- [x] **E3 Groups & members** — invite codes + share links (`/join/<code>`),
      invite-accept screen with group/inviter preview (works signed-out; code
      remembered through auth), placeholder members addable from the
      Members & invite sheet, **upgrade-on-invite transfers the placeholder's
      history** (redeem_invite/invite_preview SECURITY DEFINER RPCs; E2E-tested
      live with two users incl. idempotent re-redeem, 2026-07-10). Join-by-code
      also on the onboarding space step.
- [x] **E4 Expenses — complete** — SupabaseRepo, Add/Edit sheet (equal · exact ·
      proportional, auto-category, date picker), **multi-payer** with per-payer
      amounts + remaining validation, soft-delete + undo, **bottom tab bar**
      (Home/Expenses/List/Reports; List & Reports are Phase 4/5 placeholders),
      **Expenses tab** (date-grouped, category tiles, "your share %",
      lent/borrowed nets), **expense detail screen** (paid-by + split cards
      with % pills and member nets, edit/delete). Browser-verified incl.
      hand-checked balances (2026-07-13)
- [x] **E5 Balances & settle up (basic)** — Home balance hero with live nets,
      settle-up sheet (fewest-payments list, record payment → balance clears;
      verified in browser 2026-07-09). Pairwise view for 3+ members comes with
      the full shell
- [ ] **E6 Verification** — balance scenario tests vs hand calcs; one-week
      real-data trial with both users
