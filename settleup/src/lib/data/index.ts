export * from "./repo";
export * from "./memory-repo";

import { MemoryRepo, seedDemo } from "./memory-repo";
import type { Repo } from "./repo";

let demoRepo: { repo: Repo; groupId: string } | null = null;

/**
 * Returns the app's Repo. Currently the in-memory demo household; once
 * Supabase env vars are configured (epic E1/E2), this switches to the
 * Supabase-backed implementation — screens don't change.
 */
export async function getRepo(): Promise<{ repo: Repo; groupId: string }> {
  // TODO(E1): if NEXT_PUBLIC_SUPABASE_URL is set, return SupabaseRepo instead.
  if (!demoRepo) {
    const repo = new MemoryRepo();
    const { groupId } = await seedDemo(repo);
    demoRepo = { repo, groupId };
  }
  return demoRepo;
}
