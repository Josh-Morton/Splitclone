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

const GEMINI_MODEL = "gemini-flash-latest";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const PROMPT =
  "You are reading a South African shop till slip. Extract ONLY the individual " +
  "line items the customer purchased — ignore the store name/address, VAT lines, " +
  "subtotals, totals, tender/change, loyalty and any non-item text. For each item " +
  "give its name as printed and its price. All amounts are South African Rand: " +
  "convert every amount to an integer number of cents (e.g. R37.99 -> 3799). If a " +
  "quantity is shown, include it. Also return the printed grand total in cents.";

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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
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
      }
    );

    if (!geminiRes.ok) {
      const body = await geminiRes.text();
      // 429 = daily/rate limit reached
      const status = geminiRes.status === 429 ? 429 : 502;
      return json(
        { error: status === 429 ? "Scan limit reached, try again later" : "Could not read the receipt" , detail: body.slice(0, 300) },
        status
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

    // Normalise: keep only valid item rows with a positive integer price.
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((raw) => {
        const it = raw as Record<string, unknown>;
        const line = Math.round(Number(it.line_total_cents));
        const name = typeof it.name === "string" ? it.name.trim() : "";
        if (!name || !Number.isFinite(line) || line <= 0) return null;
        return {
          name,
          qty: Number.isFinite(Number(it.qty)) && Number(it.qty) > 0 ? Number(it.qty) : null,
          line_total_cents: line,
        };
      })
      .filter((x): x is { name: string; qty: number | null; line_total_cents: number } => x !== null);

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
