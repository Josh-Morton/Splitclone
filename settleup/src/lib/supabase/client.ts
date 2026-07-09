/**
 * Supabase browser client — singleton.
 *
 * Auth model (Phase 1): the PWA is a client-side app; supabase-js holds the
 * session in localStorage and auto-refreshes tokens. RLS (not the Next.js
 * server) is the security boundary, so there is no server-side session
 * plumbing. detectSessionInUrl handles magic-link landings.
 *
 * Env vars (settleup/.env.local locally, Vercel project settings in prod):
 *   NEXT_PUBLIC_SUPABASE_URL      — the project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — the anon key (safe for the client; RLS
 *                                   constrains all access)
 *
 * The service-role key must NEVER appear in client code or NEXT_PUBLIC_ vars.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see docs/SETUP.md)."
    );
  }
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
    );
  }
  return client;
}
