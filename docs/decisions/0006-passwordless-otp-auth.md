# ADR-0006: Passwordless email OTP authentication

**Status:** Accepted (2026-07-02) · **Source:** Scope doc §14 open decision #1; design handoff (Welcome/OTP screens)

## Context
Two known users; lowest possible sign-in friction wanted. The design handoff
already draws the flow as email → 6-digit code (no password fields anywhere).

## Decision
**Passwordless email OTP** via Supabase Auth (`signInWithOtp`). No passwords
stored or reset flows to build. Sessions persist via Supabase's refresh tokens
so the installed PWA stays signed in.

## Consequences
- Matches the designed screens exactly (Welcome → OTP → onboarding).
- Sign-in depends on email deliverability; Supabase's built-in email service is
  rate-limited (~2/hour on free) — fine for two users who sign in rarely, but
  if it ever pinches, plug in a free Resend/SMTP sender.
- Password reset (scope §6.1) becomes moot — one less flow.
