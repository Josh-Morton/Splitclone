"use client";

/**
 * Post-auth routing: after a session exists, decide where the user lands.
 * New user (no display name) → onboarding; no household yet → create-space
 * step; otherwise the app.
 */

import { getSupabaseRepo } from "./data";
import { getPendingInviteCode } from "./session";

export async function postAuthDestination(): Promise<string> {
  const repo = getSupabaseRepo();
  // Fetched together: this runs on every sign-in, and the two are
  // independent. Only the last branch reads `groups`, so on the early-return
  // paths it's a wasted (parallel, non-blocking) query rather than a wasted
  // round trip of latency (Phase 16).
  const [user, groups] = await Promise.all([repo.getCurrentUser(), repo.listGroups()]);
  if (!user) return "/welcome";
  if (!user.displayName) return "/onboarding";
  // A pending invite (they arrived via a /join link before signing in) beats
  // the create-a-space onboarding step — accepting it IS their onboarding.
  const pending = getPendingInviteCode();
  if (pending) return `/join/${encodeURIComponent(pending)}`;
  if (groups.length === 0) return "/onboarding?step=space";
  return "/";
}
