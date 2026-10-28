// Supabase Edge Function: scan-receipt (Phase 7, ADR-0012)
//
// Extracts line items + total from a receipt photo using Gemini Flash. The
// Gemini API key lives ONLY here as the `GEMINI_API_KEY` secret — never in the
// client, and users never link their own Google account (one central key runs
// it for everyone). The image is received in the request body and discarded
// when the response is sent; nothing is stored.
//
// Auth: requires a real signed-in Supabase user (protects the free quota from
// anonymous abuse). Returns { merchant?, total_cents, items: [...] }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// MODEL SELECTION (BUG-016, revised for BUG-021)
//
// Two lessons, both learned in production:
//
// 1. Don't depend on a moving alias. `gemini-flash-latest` is repointed with
//    two weeks' notice, and a retired target fails with 404 (BUG-016).
// 2. Don't lead with the newest model on a free-tier key. The 2026-10-20 fix
//    pinned gemini-3.8-flash; on the free tier it returns repeated
//    503 UNAVAILABLE ("high demand") — widely reported Sept–Oct 2026 — and the
//    alias now points at it too. Every scan failed (BUG-021).
//
// So Flash-Lite leads: current, recommended by Google for new projects
// alongside 3.8 Flash, and the free tier's high-capacity option. Bigger models
// sit behind it, so a busy or exhausted model degrades to the next instead of
// failing the scan. GEMINI_MODEL (a function secret) still overrides the first
// choice without a redeploy.
const MODEL_CHAIN = [
  Deno.env.get("GEMINI_MODEL"),
  "gemini-3.5-flash-lite", // GA 2026-07-21 — free-tier capacity, low demand
  "gemini-3.1-flash-lite", // GA 2026-05-07 — older Lite, separate quota bucket
  "gemini-3.6-flash", // GA 2026-07-21 — stronger, but tight free quota (429s)
  "gemini-3.8-flash", // GA 2026-09-02 — strongest, but overloaded on free tier
].filter((m, i, all): m is string => Boolean(m) && all.indexOf(m) === i);

/**
 * Should the scan move on to the next model? Yes for anything specific to THIS
 * model: missing/unsupported (404/400), its own quota (429 — free-tier quotas
 * are per model), or overloaded/erroring (5xx). Not for 401/403: a bad or
 * restricted key fails identically on every model, so trying more just burns
 * time.
 */
const tryNextModel = (status: number) =>
  status === 404 || status === 400 || status === 429 || status >= 500;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Google's own error status + message, trimmed — safe to log and return. */
async function upstreamReason(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const e = JSON.parse(text)?.error;
    if (e) return `${e.status ?? ""} ${String(e.message ?? "").slice(0, 160)}`.trim();
  } catch {
    /* not JSON */
  }
  return text.slice(0, 160);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const PROMPT = [
  "You are reading a South African till slip or restaurant bill. Extract ONLY the",
  "individual line items the customer bought — ignore store name/address, VAT,",
  "subtotals, totals, tips, tender/change, loyalty and any non-item text.",
  "",
  "QUANTITIES ARE CRITICAL. Restaurant bills and many tills print a quantity",
  "(usually a small number on the LEFT of the line) with a single price on the",
  "RIGHT, e.g. '5  Jack Black  250.00'. The quantity is that left-hand number, NOT",
  "part of the price.",
  "",
  "For each line return: name (as printed, without the qty number), qty (integer,",
  "default 1), and BOTH unit_price_cents and line_total_cents, where line_total is",
  "the amount for the whole line and unit = line_total / qty.",
  "",
  "Decide whether the printed price is the LINE TOTAL or a UNIT price by reasoning",
  "about the grand total: the sum of all line_totals should equal (or be very",
  "close to) the printed grand total. In most SA receipts the printed amount on a",
  "quantity line is the LINE TOTAL (all units together) — e.g. '5 Jack Black",
  "250.00' means 5 beers for R250 total, unit R50. But sometimes it is the per-unit",
  "price — e.g. '5 Jack Black 50.00' where the line total is really R250. Use the",
  "grand total to pick the interpretation that makes the receipt add up.",
  "",
  "All amounts are South African Rand — convert every amount to an integer number",
  "of cents (R37.99 -> 3799). Also return the printed grand total in cents.",
].join("\n");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    merchant: { type: "string" },
    total_cents: { type: "integer" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "number" },
          unit_price_cents: { type: "integer" },
          line_total_cents: { type: "integer" },
        },
        required: ["name", "line_total_cents"],
      },
    },
  },
  required: ["items", "total_cents"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Require a real signed-in user (not just the anon key).
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not signed in" }, 401);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Scanner not configured" }, 500);

    const { image_base64, mime_type } = await req.json().catch(() => ({}));
    if (!image_base64 || typeof image_base64 !== "string") {
      return json({ error: "No image provided" }, 400);
    }
    // Guard the free quota / payload size (~4MB of base64 ≈ 3MB image).
    if (image_base64.length > 6_000_000) {
      return json({ error: "Image too large — retake at a lower quality" }, 413);
    }

    const callGemini = (model: string) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: mime_type || "image/jpeg", data: image_base64 } },
              ],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: RESPONSE_SCHEMA,
            temperature: 0,
          },
        }),
      });

    // Walk the chain until one model answers. Every failed attempt is logged
    // (model, status, Google's reason — never the key) so the next failure is
    // diagnosable from the function logs rather than guessed at.
    let geminiRes = await callGemini(MODEL_CHAIN[0]);
    let usedModel = MODEL_CHAIN[0];
    const attempts: string[] = [];
    for (let i = 1; !geminiRes.ok && tryNextModel(geminiRes.status) && i < MODEL_CHAIN.length; i++) {
      const reason = await upstreamReason(geminiRes);
      attempts.push(`${usedModel}:${geminiRes.status}`);
      console.error(`scan-receipt: ${usedModel} -> ${geminiRes.status} ${reason}; trying ${MODEL_CHAIN[i]}`);
      geminiRes = await callGemini(MODEL_CHAIN[i]);
      usedModel = MODEL_CHAIN[i];
    }

    if (!geminiRes.ok) {
      const reason = await upstreamReason(geminiRes);
      attempts.push(`${usedModel}:${geminiRes.status}`);
      console.error(`scan-receipt: all models failed — ${attempts.join(", ")} — last: ${reason}`);
      const busy = geminiRes.status >= 500;
      const quota = geminiRes.status === 429;
      return json(
        {
          // Said in words, with the code kept in brackets so a screenshot is
          // still diagnosable (BUG-009/016/021).
          error: quota
            ? "Today's free scan limit is used up — try again tomorrow, or add the amount by hand (limit reached · 429)"
            : busy
              ? "Google's receipt reader is busy right now — try again in a minute (scanner busy · " +
                geminiRes.status +
                ")"
              : `Could not read the receipt (scanner error ${geminiRes.status})`,
          model: usedModel,
          attempts,
          detail: reason,
        },
        quota ? 429 : busy ? 503 : 502
      );
    }

    const out = await geminiRes.json();
    const text: string | undefined = out?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ error: "The receipt couldn't be read — try a clearer photo" }, 422);

    let parsed: { merchant?: string; total_cents?: number; items?: unknown[] };
    try {
      parsed = JSON.parse(text);
    } catch {
      return json({ error: "The receipt couldn't be read — try a clearer photo" }, 422);
    }

    // Normalise + EXPAND quantity lines into individual items so people can tick
    // who had what. "5 Jack Black — R250" becomes 5 rows of R50 each, split
    // cent-exactly (largest-remainder) so they still sum to the line total.
    const items: { name: string; qty: number | null; line_total_cents: number }[] = [];
    for (const raw of Array.isArray(parsed.items) ? parsed.items : []) {
      const it = raw as Record<string, unknown>;
      const name = typeof it.name === "string" ? it.name.trim() : "";
      const line = Math.round(Number(it.line_total_cents));
      let qty = Math.round(Number(it.qty));
      if (!name || !Number.isFinite(line) || line <= 0) continue;
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      qty = Math.min(qty, 50); // guard against a mis-read quantity

      if (qty === 1) {
        items.push({ name, qty: null, line_total_cents: line });
        continue;
      }
      // Distribute the line total across `qty` units, cent-exact.
      const base = Math.floor(line / qty);
      const remainder = line - base * qty;
      for (let i = 0; i < qty; i++) {
        items.push({
          name: `${name} (${i + 1} of ${qty})`,
          qty: null,
          line_total_cents: base + (i < remainder ? 1 : 0),
        });
      }
    }

    if (items.length === 0) {
      return json({ error: "No items found on that photo — try again or add the amount by hand" }, 422);
    }

    const total_cents = Number.isFinite(Number(parsed.total_cents))
      ? Math.round(Number(parsed.total_cents))
      : items.reduce((a, i) => a + i.line_total_cents, 0);

    return json({ merchant: parsed.merchant ?? null, total_cents, items });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
