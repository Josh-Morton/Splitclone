# ADR-0006: Email authentication (password primary, magic-link fallback)

**Status:** Accepted (2026-07-02); **revised 2026-07-22** to add email+password. · **Source:** Scope doc §14 open decision #1; design handoff; Josh (2026-07-22)

## Revision (2026-07-22) — add Log in / Sign up with a password
Josh wanted a conventional **log-in / sign-up** landing page. The welcome screen
now offers **email + password** (`signInWithPassword` / `signUp`) as the primary
path, with a **magic-link fallback** ("Email me a sign-in link") kept for older
accounts (created before passwords) and anyone who prefers it, plus "Forgot
password?" (`resetPasswordForEmail`). Email confirmation is **disabled**
(`mailer_autoconfirm = true`) so sign-up returns a session instantly — no email
round-trip, sidestepping the free-tier template limitation entirely. The invite
flow is unchanged: a pending invite code set by `/join` survives auth and is
redeemed by `postAuthDestination` / onboarding (E2E-verified: new password
signup → onboarding → redeem into the inviter's space). Change password lives in
Settings later if needed. Original decision follows for history.

---


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
