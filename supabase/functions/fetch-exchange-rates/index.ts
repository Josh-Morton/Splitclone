// Supabase Edge Function: fetch-exchange-rates (Phase 14, ADR-0017/ADR-0018)
//
// Refreshes the `exchange_rate` cache once a day, called by pg_cron via
// pg_net (see refresh_exchange_rates() in the Phase 14 migration).
//
// Deployed with --no-verify-jwt and authenticated by `x-shared-secret`, the
// same shape as send-push: pg_net carries no Supabase session, so the
// platform's JWT gate would reject every scheduled call.
//
// Provider: open.er-api.com — free, no API key, ~166 currencies. ADR-0018
// switched to it from Frankfurter, which quotes only 30 ECB currencies and
// therefore couldn't price the destinations this feature exists for (Dubai,
// Mauritius, Namibia, Botswana...).
//
// Rates are stored as "1 unit of X = N ZAR". The provider returns the
// inverse (1 ZAR = N units of X), so every rate is reciprocated on the way in
// and the app never has to remember which direction it is.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shared-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const shared = Deno.env.get("PUSH_SHARED_SECRET");
  if (!shared || req.headers.get("x-shared-secret") !== shared) {
    return json({ error: "unauthorized" }, 401);
  }

  const res = await fetch("https://open.er-api.com/v6/latest/ZAR");
  if (!res.ok) {
    // Leave the cache alone: a stale rate is far better than none, and
    // expense entry must never be blocked by the provider being down.
    return json({ error: `provider ${res.status}`, kept_cache: true }, 502);
  }
  const payload = await res.json();
  if (payload?.result !== "success" || !payload?.rates) {
    return json({ error: "unexpected provider payload", kept_cache: true }, 502);
  }

  // payload.rates[X] = how many X you get for 1 ZAR. We want the reverse.
  const rows: { currency_code: string; rate_to_zar: number; fetched_at: string }[] = [];
  const now = new Date().toISOString();
  for (const [code, perZar] of Object.entries(payload.rates as Record<string, number>)) {
    if (typeof perZar !== "number" || !isFinite(perZar) || perZar <= 0) continue;
    rows.push({
      currency_code: code.toUpperCase(),
      rate_to_zar: code.toUpperCase() === "ZAR" ? 1 : 1 / perZar,
      fetched_at: now,
    });
  }
  if (!rows.some((r) => r.currency_code === "ZAR")) {
    rows.push({ currency_code: "ZAR", rate_to_zar: 1, fetched_at: now });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { error } = await sb.from("exchange_rate").upsert(rows, { onConflict: "currency_code" });
  if (error) return json({ error: error.message }, 500);

  return json({ updated: rows.length, base_date: payload.time_last_update_utc ?? null });
});
