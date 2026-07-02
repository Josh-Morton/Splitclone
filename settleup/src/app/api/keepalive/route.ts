/**
 * Keep-alive ping (Phase 1 plan, epic E0): Supabase free projects pause after
 * 7 days of inactivity. A Vercel cron (see vercel.json) hits this route daily;
 * it performs one trivial read so the project never sleeps.
 *
 * No-ops harmlessly until Supabase env vars are configured.
 */

import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: true, supabase: "not configured" });
  }
  try {
    // Cheapest possible authenticated request: ask PostgREST for the OpenAPI
    // root. Touches the database enough to count as activity.
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    return NextResponse.json({ ok: res.ok, status: res.status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
