/**
 * Deciding whether a failed token refresh actually ended the session
 * (BUG-014).
 *
 * This is deliberately a separate, DOM-free module rather than living in
 * session.ts: it is the single most consequential branch in the auth flow —
 * getting it wrong forces real people to log in again — so it needs to be
 * unit-testable without a browser.
 *
 * The asymmetry that drives every decision here: wrongly keeping a dead
 * session costs one failed request, which the UI already handles. Wrongly
 * discarding a live one costs the user their login, and (before this fix)
 * their login on every other device too. So the rule is: only end the session
 * when the auth server has *explicitly rejected* the refresh token. Anything
 * else — offline, DNS failure, 5xx, a rotation race, an error shape we don't
 * recognise — is treated as transient.
 */

import { AuthRefreshDiscardedError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AuthError } from "@supabase/supabase-js";

export function isSessionReallyOver(error: AuthError | null | undefined): boolean {
  if (!error) return false;
  // Offline, DNS failure, 5xx — the token was never even judged.
  if (isAuthRetryableFetchError(error)) return false;
  // A concurrent refresh won the race and rotated the token first. The
  // session is fine, and whichever call won has already saved it.
  if (error instanceof AuthRefreshDiscardedError) return false;
  // 400/401 from the auth server is the one case that means "this refresh
  // token is no longer valid".
  const status = (error as { status?: number }).status;
  return status === 400 || status === 401;
}
