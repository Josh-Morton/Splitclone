"use client";

/**
 * Post-auth routing: after a session exists, decide where the user lands.
 * New user (no display name) → onboarding; no household yet → create-space
 * step; otherwise the app.
 */

import { getSupabaseRepo } from "./data";

export async function postAuthDestination(): Promise<string> {
  const repo = getSupabaseRepo();
  const user = await repo.getCurrentUser();
  if (!user) return "/welcome";
  if (!user.displayName) return "/onboarding";
  const groups = await repo.listGroups();
  if (groups.length === 0) return "/onboarding?step=space";
  return "/";
}
