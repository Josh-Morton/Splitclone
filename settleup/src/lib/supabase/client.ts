/**
 * Supabase browser client factory — epic E1 wires this up.
 *
 * Env vars (set in .env.local locally and in Vercel project settings):
 *   NEXT_PUBLIC_SUPABASE_URL      — the project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — the anon key (safe for the client; all
 *                                   access is constrained by RLS, see
 *                                   supabase/migrations/0001_phase1_schema.sql)
 *
 * The service-role key must NEVER appear in this file or any client bundle;
 * it is only for server-side jobs (recurring generation, Phase 4).
 */

import { createBrowserClient } from "@supabase/ssr";

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see docs/SETUP.md)."
    );
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
