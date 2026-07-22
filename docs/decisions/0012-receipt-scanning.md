# ADR-0012: Receipt line-item scanning via a central Gemini Edge Function

**Status:** Accepted (2026-07-22) · **Source:** Josh (Phase 7); ROADMAP Phase 7 spec

## Context
Josh wants to photograph a till slip while adding an expense, get a checklist
of line items + prices, tick the relevant ones, and have the total copied into
the expense (editable) before the normal split/space flow. Requirements:
in-app camera, no receipt storage, works across spaces, and — critically — no
per-user Google account (pipe everyone through one central key).

## Decision
- **Extraction runs server-side in a Supabase Edge Function `scan-receipt`**
  (Deno). The client sends the compressed image bytes (base64) in the request
  body; the function calls **Gemini `gemini-flash-latest`** with a strict
  `response_schema` (JSON) + `temperature: 0` and returns
  `{ merchant, total_cents, items: [{name, qty, line_total_cents}] }`. The
  image is used only for the call and **discarded** — never stored, never in
  the outbox, no `receipt_url`.
- **One central key.** `GEMINI_API_KEY` is a Supabase Function secret (Josh's
  personal Google AI Studio key — `AQ.`-format, auth via `x-goog-api-key`).
  Users never link Google and never see the key. Free tier (1,500 vision
  req/day) easily covers a household.
- **Auth:** the function requires a real signed-in Supabase user
  (`auth.getUser()` inside — the anon key alone is rejected 401) to protect the
  quota from anonymous abuse.
- **Client flow:** a "Scan a receipt" button in the Add-expense sheet →
  camera/file capture (`<input capture="environment">`) → `compressImage`
  (≤1600px JPEG) → `repo.scanReceipt` → an item **checklist** (ticked by
  default, editable price, running total) → "Add to expense" copies the ticked
  total into the amount (still editable) and the chosen items into the note →
  the normal flow (category auto-detect, split, participants, active space)
  continues. Unticked items are dropped.
- **Repo boundary:** `repo.scanReceipt(base64, mime)` (ADR-0005). `SupabaseRepo`
  invokes the function; `MemoryRepo` returns a canned Checkers slip so the demo
  household can try the flow offline.

## Consequences
- Extraction quality is high (verified: a synthetic Checkers slip returned all
  7 items to the exact cent, summing to the printed total) but **not offline** —
  on-device OCR/LLM options are inaccurate or impractical for free (ROADMAP
  Phase 7). Capture can happen anywhere; extraction needs connectivity. When
  the offline phase (ADR-0009) lands, scanning stays online-only.
- **Privacy:** Gemini's free tier permits Google to use submitted content to
  improve products. Grocery slips are low-sensitivity; a paid key or Google
  Document AI would avoid this if ever wanted (swap the call, keep the
  function's interface).
- Prompt + model are versioned in `supabase/functions/scan-receipt/index.ts`
  so extraction behaviour is reproducible.
