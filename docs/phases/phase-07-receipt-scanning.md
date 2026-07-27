*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 7 — Receipt line-item scanning ✅ SHIPPED (2026-07-22) → M5 "Scan the slip"

**Live:** scan-receipt Edge Function (Gemini `gemini-flash-latest`, central key
as a Function secret, auth-gated) + in-flow client (capture → item checklist →
tick → total copied into the editable amount → normal split/space flow; image
never stored). ADR-0012. E2E-verified live (synthetic Checkers slip → 7 items
exact to the cent, total matches; anon rejected 401) and in-browser (untick 2
items → R374,44 → R211,46 → saved with only the ticked items in the note).
MemoryRepo returns a canned slip for the demo. Offline: capture yes, extraction
no (online-only, per the spec below).

**Update (2026-07-23) — cumulative-quantity line items.** Restaurant/bar slips
list a quantity in the left column (e.g. `5  Jack Black  R175,00`). The Edge
Function now reasons about that column: it decides whether the printed price is
the **line total** (5 × R35) or a mis-printed **unit price** (using the grand
total as the tie-breaker), then **expands the row into one line item per unit**
(`Jack Black (1 of 5)` … `(5 of 5)`), dividing the line total across them with
largest-remainder so the units sum **exactly** to the line total. So the
checklist shows every drink/dish individually and you can tick only the ones
that were yours. Qty is clamped to 50; a missing/`1` qty stays a single row.
Expansion is server-side, so the client checklist is unchanged.

---

## Original spec (2026-07-18)

**Goal (Josh's words):** while creating an expense, optionally **scan a
receipt**; the app extracts a **checklist of items with prices**; the user
**ticks the items relevant to this expense** (a 15-item slip where only 10
belong → tick those 10); the **selected total is copied into the expense
amount** (editable, in case of a misscan); then the **normal expense flow**
continues (split method, participants, and the currently-active space). The
unticked items are simply dropped. **Receipts are NOT stored** — the image is
used only for extraction, then discarded.

## The flow (exact)
1. In the **Add-expense sheet**, a new **"Scan a receipt"** entry point
   (alongside typing the amount). Capture options:
   - **In-app camera** via `getUserMedia` (or `<input type="file"
     accept="image/*" capture="environment">` which opens the camera on
     Android/iOS PWAs). If live camera isn't feasible on a given device, the
     file/capture input is the guaranteed fallback — acceptable per Josh.
   - Compress client-side (reuse `lib/image.ts`) before sending.
2. The image goes to the extractor (see architecture) → returns line items
   `[{name, qty, unit_price_cents, line_total_cents}]` + a detected total.
3. **Item checklist (review screen):** every line as a **ticked-by-default
   checkbox row** (name · price). User unticks the irrelevant ones. A live
   running total of the ticked items shows at the bottom.
4. **"Add to expense"** → the ticked items' total is written into the amount
   field; the item names go into the expense note (so the detail screen shows
   what was bought). **Amount stays editable** — if a price scanned wrong the
   user just fixes it, or edits an item's price in the checklist first.
5. Continue the **normal expense flow already built**: category auto-detects
   from the merchant/first item (overridable, ADR-0011), the split segmented
   control (equal/exact/proportional), participants, and it saves into
   **whatever space is currently active** (couple, apartment, trip — the
   spaces switcher already scopes everything). No special-casing per space.
6. Nothing about the receipt is persisted — no Storage upload, no
   `receipt_url`. (The separate Phase-5 "attach a receipt photo" feature still
   exists for anyone who *does* want to keep the image; scanning is its own,
   storage-free path.)

## Can this be offline / on-device? (Josh's "prize number one")
Short answer: **capture works offline, but accurate extraction does not — for
free.** Findings:
- **On-device OCR (Tesseract.js, WASM):** runs fully offline and free, but
  produces raw text, not structured line items. Turning a Checkers/PnP/Woolies
  slip into clean name+price pairs from that text needs bespoke per-retailer
  parsing and is unreliable across layouts. Also a multi-MB WASM download.
- **On-device vision LLM (WebLLM / Transformers.js / Chrome's built-in Gemini
  Nano "Prompt API"):** either multi-GB model downloads that are impractical
  on a phone PWA, or (Gemini Nano) experimental, Chrome-only, flag-gated, and
  not dependable on Android PWAs as of mid-2026.
- **Conclusion:** structured line-item extraction that actually works needs a
  server call. Since the whole app is online-first anyway (offline is the
  deferred Phase 2), **scanning is online-only**, and that's consistent.
  Graceful degradation when offline: the amount/expense flow still works by
  hand; scanning shows "you're offline — snap it and scan when you're back, or
  enter the amount manually." We do **not** queue the image (that would mean
  storing it, which Josh doesn't want). Revisit on-device extraction only if a
  genuinely good free on-device model ships later.

## Architecture (no per-user Google account; one central key)
- **Central key, server-side.** A single Gemini API key (Josh's personal
  Google account — low user count, so one key's free quota covers everyone)
  lives **only** as a Supabase **Edge Function secret**. Users never link
  their own Google/Gmail account; they never see the key. Every user's scan is
  piped through this one function. This is exactly the "run it through my
  personal account" model Josh asked for.
- **Edge Function `scan-receipt`** (Deno, Supabase, free-tier included):
  authenticated request (verifies the caller's JWT + that they belong to the
  active group) carries the **compressed image bytes in the request body**
  (not a stored path — nothing is persisted). The function calls Gemini Flash
  with a strict JSON-schema prompt and returns
  `{ items: [{name, qty, unit_price_cents, line_total_cents}], total_cents,
  merchant? }`. Cents are integers end-to-end; the function rounds/validates.
  The image is discarded when the request ends.
- **Model:** Gemini Flash free tier — 10 req/min, 1,500 req/day *including
  vision*, R0, no credit card. A household does ~30 scans/month, so the daily
  cap is a non-issue. Anthropic has no free API tier and OpenAI vision is paid,
  so Gemini is the only R0 fit. **Fallback if SA-slip quality disappoints:**
  Google Document AI (1,000 free pages/month) behind the same Edge Function —
  swap the call, keep the interface.
- **Privacy note to confirm with Josh:** Gemini's *free* tier allows Google to
  use submitted content to improve their products. Grocery slips are low
  sensitivity, but flagging it. A paid key (or Document AI) avoids this if ever
  wanted.

## Build order (when Josh provides the key)
1. Edge Function + versioned prompt; test harness against ~10 real SA slips
   (Checkers, PnP, Woolworths, Spar) to tune accuracy.
2. In-app capture (camera + file fallback) wired into the Add-expense sheet.
3. Item checklist review UI (tick/untick, editable price, running total).
4. "Add to expense" → amount + note; then the existing expense flow/split/space.
5. E2E + real-phone testing; graceful offline + rate-limit handling.

**What Josh needs to provide:** one free Gemini API key from Google AI Studio
(aistudio.google.com → "Get API key" → free, no card), pasted to Claude like
the Vercel token; Claude sets it as the `GEMINI_API_KEY` Edge Function secret.
Nothing else — no per-user setup, no Google linking, no billing.
