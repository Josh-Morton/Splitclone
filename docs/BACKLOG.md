*(Part of the [Tally roadmap](ROADMAP.md).)*

# Backlog

Cross-cutting loose ends that aren't worth a phase of their own — either too
small, or waiting on something outside this repo (an account, a real need
arising). Add new items here rather than letting them accumulate inside
`ROADMAP.md` or a phase file.

## Other open items
- **Custom SMTP for real OTP email codes** (e.g. free Resend tier) — manual,
  needs Josh's account. Magic-link/password sign-in is the flow until then.
  See [Phase 1](phases/phase-01-core-ledger.md).
- **Multi-currency support** — the app is ZAR-only today: `fmt()`/`fmtR()`
  (`src/lib/domain/money.ts`), the `group.currency` check constraint, and now
  push-notification copy (`_push_fmt()`) all hardcode Rand. Flagged by Josh
  while reviewing Phase 9, not a near-term priority — revisit only if a real
  need appears (e.g. a non-South-African household). Full note in
  [Phase 9](phases/phase-09-push-notifications.md#backlog-multi-currency-not-part-of-this-phase).

## Design-fidelity backlog (audit vs design handoff, 2026-07-13)
Gaps between the built app and `design_handoff_settleup/README.md`, each with
its target phase. The audit confirmed all iron rules hold and Phase-1 exit
criteria are met (bar the E6 trial); these are the visible deltas:

- ~~Salary-proportional split doesn't work for a real couple~~ → **fixed in
  Phase 3** (privacy-preserving server RPC, ADR-0010)
- ~~Partner's real display name never shown~~ → **fixed in Phase 3**
- ~~Settings (editable name/salary, privacy toggle)~~ → **basic sheet shipped
  in Phase 3**; simplify-debts toggle + full-screen fidelity in Phase 6
- Header per design: tappable space name → Spaces switcher sheet, notification
  bell → Activity, avatar → Settings (currently Invite/Sign-out pills) →
  **Phase 5/6**
- Spaces switcher + create-space sheet (multi-space UI; data layer already
  supports) → **Phase 6** *(now fully specced under Phase 6 → "Household
  (space) management")*
- Sync-state pill (synced/syncing/offline) → moves with **Phase 2 (end)**
- Upcoming-recurring card on Home → **Phase 4**
- Note input on Add/Edit sheet (schema + detail view support notes already) →
  **Phase 4**
- Avatar photos (add-photo affordance in onboarding/settings) → **Phase 5**
  (needs Storage)
- Group rename UI; member-leave-with-zero-balance rule → **Phase 6**
- Percentage/shares split methods: implemented + tested in the domain layer but
  deliberately **not surfaced** — the final design's segmented control has
  exactly three options (Equal · Exact · Proportional); design supersedes scope
  §6.5 here. Revisit only if a real need appears.
