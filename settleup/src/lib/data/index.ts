export * from "./repo";
export * from "./memory-repo";
export * from "./supabase-repo";

import { MemoryRepo, seedDemo } from "./memory-repo";
import { SupabaseRepo } from "./supabase-repo";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import type { Repo } from "./repo";

export type RepoMode = "supabase" | "demo";

let demo: { repo: Repo; groupId: string } | null = null;
let supa: SupabaseRepo | null = null;

/**
 * The demo household (in-memory, seeded) — powers "Skip — explore the demo
 * household" and local development without Supabase env vars.
 */
export async function getDemoRepo(): Promise<{ repo: Repo; groupId: string }> {
  if (!demo) {
    const repo = new MemoryRepo();
    const { groupId } = await seedDemo(repo);
    demo = { repo, groupId };
  }
  return demo;
}

/** The real, RLS-backed repo. Caller must be signed in for reads to return data. */
export function getSupabaseRepo(): SupabaseRepo {
  if (!supa) supa = new SupabaseRepo(getSupabase());
  return supa;
}

export { isSupabaseConfigured };
