*(Part of the [Tally roadmap](../ROADMAP.md).)*

# Phase 8 — Splitty ✅ SHIPPED (2026-07-23) → M6 "Split with anyone"

> **Live:** the Splitty tab (5th bottom-nav tab) → scan a bill → items expand
> per-unit (Phase-7 qty work) → "Create split" → share a `/split/<code>` link
> on WhatsApp → guests join with just a name (no account), tick their items,
> add their own tip %, and lock in (editable until the host closes the bill).
> Host sees a live "who's in / covered of total" overview + Close bill. Fully
> standalone from the expense ledger (ADR-0013). Migration
> `20260726000000_splitty.sql` applied live (4 tables + 7 token-gated RPCs;
> the guest token lives in `split_guest_secret` with RLS-deny **and** the
> default anon/authenticated grants revoked — both layers deny). Repo methods
> in both implementations; `MemoryRepo` seeds a "Mzoli's braai" demo bill.
> Verified: live E2E of the deployed RPCs (join / claim / atomic double-claim
> guard / tip / lock / bad-token reject / owner-only close, then cascade
> cleanup); in-browser demo (join as a guest, claim 2 items, 15% tip →
> R138,00 exact, live overview); `npm test` (53) + build + lint green.
> **Admin-recovery fix (2026-07-24):** the admin's guest identity was only
> cached in localStorage, so returning to your own split from another device or
> after storage was cleared showed the join screen instead of admin controls.
> Migration `20260728000000_splitty_admin_identity.sql` adds
> `splitty_admin_identity(share_code)` (authenticated-only; returns the admin
> guest id+token when `auth.uid() = created_by`), and the `/split` page now
> recovers admin identity server-side when it doesn't recognize the visitor —
> so the creator is always remembered as admin. (Bonus: the demo's seeded bill
> now opens as its host, since the demo user created it.)
> **Realtime fix (2026-07-23):** the initial migration created the tables but
> forgot to add them to the `supabase_realtime` publication, so cross-user
> updates only appeared when the receiving client next acted. Migration
> `20260727000000_splitty_realtime.sql` adds `split_bill`/`split_guest`/
> `split_item` to the publication (free — same mechanism `shopping_item` uses),
> and `subscribeSplitBill` now also watches `split_bill` so "Close bill"
> propagates live. Claims/tips/locks now push to everyone in ~real time.
> **Not in v1 (by design):** no Expense row created, no shared-item cost-split
> (qty-expansion covers it), no payment collection, no link expiry, no reopen.
> Original spec (kept for reference):

> **Status: fully specced.** This section is deliberately exhaustive so any LLM
> (or human) can implement it from this document alone, without re-deriving the
> design decisions.

## Goal (Josh's words, condensed)
A **standalone bill-splitting module**, separate from the expense ledger,
reachable from a **5th bottom-nav tab called "Splitty"**. One person (the
**admin**) photographs a receipt, reviews/edits the scanned line items, and
shares a link on WhatsApp. Anyone who taps that link lands on a page **inside
the Tally web app but requires no account** — they type a display name,
tick the items that were theirs from a shared checklist, add their own tip
percentage (auto-calculated), and tap **"Lock in."** The admin (who goes
through the exact same claim screen for their own items, immediately after
creating the split) watches a **live overview**: who's locked in, who hasn't,
and the running total covered vs. the bill total. **Nothing here writes to
the expense ledger in v1** — no `Expense`, no `group_id`, no `Repo` balance
math involved. That's an explicit non-goal, not an oversight.

## Why this is architecturally different from everything else in the app
Every existing feature requires a signed-in Supabase session; RLS keyed on
`auth.uid()` is the security boundary (ADR-0005). Splitty **guests have no
session at all** — no signup, no magic link, nothing. This is a deliberate,
scoped exception, recorded in **[ADR-0013](../decisions/0013-splitty-guest-access.md)**:
guest writes go through `SECURITY DEFINER` RPCs that check a bearer-style
`guest_token` themselves (the function is the boundary), and the `anon` role
is granted execute on those RPCs directly — extending the precedent already
set by `invite_preview` (granted to `anon` today, but only for a *read*;
Splitty is the first *write* path `anon` can reach). **Read ADR-0013 in full
before writing the migration** — it explains exactly why the guest token
lives in its own unreadable table (`split_guest_secret`), not as a column on
`split_guest`, and why that specifically avoids a Realtime payload leak.

## The two user journeys, exact steps

**Admin (signed in, inside the main app):**
1. Taps the **Splitty** tab → sees a list of bills they've created (via
   `splittyListMyBills()`), each with a status pill (open/closed) and a live
   "R430 of R650 covered" line. Empty state: "Split a bill" button.
2. Taps **"+ New split"** → capture flow: **reuses the exact same
   camera/file-capture + `repo.scanReceipt()` call already built for the
   expense receipt scanner** (`src/components/receipt-scan-sheet.tsx` is the
   reference implementation — same `compressImage` → `blobToBase64` →
   `repo.scanReceipt(base64, "image/jpeg")` call, same `ScanResult`/`ScanItem`
   types from `repo.ts`). This already includes the qty-expansion work from
   earlier this session, so "5× Jack Black" arrives as 5 separate rows —
   important, because it's *why* Splitty doesn't need any shared-item /
   split-a-single-row-between-people logic (see "Item claiming" below).
3. **Review/edit checklist** — same UI pattern as `ReceiptScanSheet`'s review
   phase (tick/untick... actually no ticking here, every row becomes a real
   line item; the admin can rename a row, fix a price, or delete a row
   entirely before creating the split). Sees the running total.
4. Taps **"Create split"** → calls
   `repo.splittyCreateBill(merchant, receiptTotalCents, items)`. This:
   - creates the `split_bill` row + a `share_code`
   - auto-creates the admin's **own** `split_guest` row (`is_admin = true`,
     `display_name` pulled from their `profile.display_name`)
   - returns `{ shareCode, guestId, guestToken }`
   - the client immediately writes `{guestId, guestToken}` to
     `localStorage["splitty_guest_" + shareCode]` — **the same storage key
     scheme guests use** (see below), so the admin can be routed to
     `/split/<shareCode>` in their own browser and land on **the identical
     page component** everyone else uses, already recognized (no name prompt,
     because their token is already in local storage).
5. Client navigates to `/split/<shareCode>`. Because `is_admin` is true for
   this guest, that page additionally renders:
   - a **share panel** — reuses the WhatsApp-share pattern verbatim from
     `src/components/invite-sheet.tsx` (`navigator.share` when available,
     "Copy invite message" fallback, `canNativeShare` check) pointed at
     `${window.location.origin}/split/${shareCode}` instead of
     `/join/${code}`.
   - a **live overview** section: every guest (from `split_guest`, updated in
     realtime), their locked/unlocked badge, their contribution total
     (computed client-side — see "Money math" below), and unclaimed items
     called out separately.
   - a **"Close bill"** button → `repo.splittyCloseBill(shareCode)`. Freezes
     everything (guests can still view, not edit).
6. Below all that, the admin sees **the same claim checklist guests see** (own
   items to tick, own tip %, own Lock in) — because, per the data model, the
   admin *is* a `split_guest` row like anyone else.

**Guest (taps the WhatsApp link, no account):**
1. Lands on `/split/<shareCode>` — a **public route**, not gated behind
   `useSessionState()` the way `/join/[code]` is (that page redirects
   signed-out visitors to `/welcome`; **this page must not** — it has to work
   for someone who has never opened Tally before and never will sign up).
2. Page checks `localStorage["splitty_guest_" + shareCode]`:
   - **absent** → show a one-field form: "What's your name?" → on submit,
     `repo.splittyJoin(shareCode, name)` → save the returned
     `{guestId, guestToken}` to that localStorage key → proceed to step 3.
   - **present** → skip straight to step 3 (this is what makes reopening the
     link later, or the admin's own redirect in step 5 above, "just work").
3. Renders the **item checklist**: every `split_item` for the bill, live via
   Realtime. Unclaimed rows are tappable (claims them via
   `repo.splittyClaimItem`); rows claimed by someone else render disabled +
   greyed with that person's name; rows claimed by *this* guest show a
   filled checkmark and are tappable to release
   (`repo.splittyUnclaimItem`) — but **only while this guest is unlocked**
   (see "Locking" below).
4. **Tip selector**: segmented buttons (0% / 10% / 15% / 20% / custom input),
   calls `repo.splittySetTip(shareCode, guestToken, percent)` on change. A
   running total shows live: `sum(their claimed items) × (1 + tip/100)`.
5. **"Lock in"** button → `repo.splittySetLocked(shareCode, guestToken, true)`.
   Once locked, item rows and the tip selector become read-only for that
   guest, replaced by an **"Edit"** link that calls
   `splittySetLocked(..., false)` to unlock and resume changing things —
   **this stays possible for as long as `split_bill.status === "open"`**; once
   the admin closes the bill, editing is impossible for anyone, locked or not
   (confirmed decision: editable-until-admin-closes, not one-shot).
6. A small **shared overview** (same data the admin sees) is visible to every
   guest too, not just the admin — "see who else has paid" was part of the
   ask ("reflect on the main person's home page" — guests benefit from the
   same visibility, and RLS already makes these rows publicly readable, so
   there's no reason to hide it from them).

## Item claiming: exclusive, one claimant per row — confirmed decision
Per your answer: because the scan-receipt qty-expansion (already shipped)
turns "5× Jack Black — R175" into 5 separate `split_item` rows, two people
each grab their own "Jack Black" row without any need for a shared/split-cost
claim. **`split_item.claimed_by_guest_id` is a single nullable FK, not a join
table.** Claiming is enforced atomically in SQL (`update ... where
claimed_by_guest_id is null`) so two simultaneous taps can't both "win" the
same row — the loser gets `'Someone already grabbed that one'`.

## Money math — deliberately outside the strict expense-ledger invariant
`lib/domain/split.ts`'s "every split sums exactly to the total" rule and the
DB's deferred `validate_expense_totals` trigger apply to real `Expense`
rows — **Splitty touches neither**, so that invariant does not apply here.
A guest's contribution total is **derived, never stored** (consistent with
the spirit of ADR-0004's "balances are derived" even though this isn't the
balance system): `Math.round(sum(claimed item line_total_cents) * (1 +
tipPercent / 100))`, computed client-side every render from live `split_item`
+ `split_guest` data. Still integer cents throughout for storage/display
(the iron rule from CLAUDE.md), just not required to reconcile against
`receipt_total_cents` — unclaimed items and differing tip percentages mean
the sum of all guests' totals will *not* generally equal the receipt total,
and that's fine; the overview screen shows both numbers side by side so
humans can eyeball the gap, it doesn't try to force them equal.

## Data model — full migration SQL
New file: `supabase/migrations/20260726000000_splitty.sql`. Entirely new
tables, no FKs to `group`/`expense`/`group_member` — Splitty is intentionally
outside the group model (see ADR-0013's consequences section for why).

```sql
-- ============================================================================
-- Splitty (Phase 8): standalone bill-splitting, no account required for
-- guests. See ADR-0013 for the security model (function-boundary, not RLS).
-- ============================================================================

create table split_bill (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  created_by uuid not null references auth.users (id),
  merchant text,
  receipt_total_cents bigint not null check (receipt_total_cents >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table split_guest (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references split_bill (id) on delete cascade,
  display_name text not null,
  tip_percent numeric not null default 0 check (tip_percent >= 0 and tip_percent <= 100),
  locked_in boolean not null default false,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now()
);

-- The guest's bearer token, in its OWN table with no SELECT policy at all —
-- never exposed to any client, including the guest who owns it (they already
-- have it, returned once at join time and cached in localStorage). This is
-- what stops Realtime from ever broadcasting it (see ADR-0013).
create table split_guest_secret (
  guest_id uuid primary key references split_guest (id) on delete cascade,
  token uuid not null default gen_random_uuid()
);

create table split_item (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references split_bill (id) on delete cascade,
  name text not null,
  line_total_cents bigint not null check (line_total_cents > 0),
  position int not null default 0,
  claimed_by_guest_id uuid references split_guest (id) on delete set null
);

create index split_guest_bill_idx on split_guest (bill_id);
create index split_item_bill_idx on split_item (bill_id);

-- ---------------------------------------------------------------------------
-- RLS: reads are public-with-obscurity (same accepted tradeoff as
-- invite_select using(true) — see ADR-0013). Writes have NO policies at all;
-- they only happen through the SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------
alter table split_bill enable row level security;
alter table split_guest enable row level security;
alter table split_guest_secret enable row level security;
alter table split_item enable row level security;

create policy split_bill_select on split_bill for select using (true);
create policy split_guest_select on split_guest for select using (true);
create policy split_item_select on split_item for select using (true);
-- split_guest_secret: deliberately NO policies of any kind (default-deny),
-- not even a "using (false)" — this table is invisible to every client role.

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Admin creates a bill from the (possibly hand-edited) scan-receipt output.
-- p_items shape: [{ "name": text, "line_total_cents": bigint }, ...] in
-- display order. Requires a signed-in user.
create or replace function splitty_create_bill(
  p_merchant text,
  p_receipt_total_cents bigint,
  p_items jsonb
) returns table (bill_id uuid, share_code text, guest_id uuid, guest_token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bill_id uuid;
  v_code text;
  v_guest_id uuid;
  v_token uuid;
  v_name text;
  item jsonb;
  i int := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to create a split';
  end if;

  v_code := left(replace(gen_random_uuid()::text, '-', ''), 16);
  select coalesce(display_name, 'You') into v_name from profile where user_id = v_uid;

  insert into split_bill (share_code, created_by, merchant, receipt_total_cents)
  values (v_code, v_uid, nullif(trim(p_merchant), ''), greatest(p_receipt_total_cents, 0))
  returning id into v_bill_id;

  insert into split_guest (bill_id, display_name, is_admin)
  values (v_bill_id, coalesce(v_name, 'You'), true)
  returning id into v_guest_id;

  v_token := gen_random_uuid();
  insert into split_guest_secret (guest_id, token) values (v_guest_id, v_token);

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if (item ->> 'name') is not null and trim(item ->> 'name') <> ''
       and (item ->> 'line_total_cents')::bigint > 0 then
      insert into split_item (bill_id, name, line_total_cents, position)
      values (v_bill_id, trim(item ->> 'name'), (item ->> 'line_total_cents')::bigint, i);
      i := i + 1;
    end if;
  end loop;

  if i = 0 then
    raise exception 'A split needs at least one item';
  end if;

  return query select v_bill_id, v_code, v_guest_id, v_token;
end $$;

-- Guest joins with just a name. No auth required.
create or replace function splitty_join(p_share_code text, p_display_name text)
returns table (guest_id uuid, guest_token uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_bill record;
  v_guest_id uuid;
  v_token uuid;
  v_name text := left(trim(coalesce(p_display_name, '')), 40);
begin
  if v_name = '' then
    raise exception 'Enter your name';
  end if;

  select * into v_bill from split_bill where share_code = p_share_code;
  if not found then
    raise exception 'Split not found';
  end if;
  if v_bill.status = 'closed' then
    raise exception 'This split is closed';
  end if;

  insert into split_guest (bill_id, display_name) values (v_bill.id, v_name)
  returning id into v_guest_id;

  v_token := gen_random_uuid();
  insert into split_guest_secret (guest_id, token) values (v_guest_id, v_token);

  return query select v_guest_id, v_token;
end $$;

-- Shared helper: resolve + validate a (share_code, guest_token) pair.
-- Raises on any mismatch — deliberately doesn't distinguish "wrong code" from
-- "wrong token" in the error message (no information leak either way).
create or replace function _splitty_guest(p_share_code text, p_guest_token uuid)
returns table (bill_id uuid, bill_status text, guest_id uuid, locked_in boolean)
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select b.id as bill_id, b.status as bill_status, g.id as guest_id, g.locked_in
  into r
  from split_bill b
  join split_guest g on g.bill_id = b.id
  join split_guest_secret s on s.guest_id = g.id
  where b.share_code = p_share_code and s.token = p_guest_token;

  if not found then
    raise exception 'Not recognized — rejoin the split';
  end if;

  return query select r.bill_id, r.bill_status, r.guest_id, r.locked_in;
end $$;

create or replace function splitty_claim_item(p_share_code text, p_guest_token uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your items'; end if;

  update split_item set claimed_by_guest_id = g.guest_id
    where id = p_item_id and bill_id = g.bill_id and claimed_by_guest_id is null;
  if not found then
    raise exception 'Someone already grabbed that one';
  end if;
end $$;

create or replace function splitty_unclaim_item(p_share_code text, p_guest_token uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your items'; end if;

  update split_item set claimed_by_guest_id = null
    where id = p_item_id and bill_id = g.bill_id and claimed_by_guest_id = g.guest_id;
  if not found then
    raise exception 'That item is not yours to release';
  end if;
end $$;

create or replace function splitty_set_tip(p_share_code text, p_guest_token uuid, p_tip_percent numeric)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your tip'; end if;

  update split_guest set tip_percent = greatest(0, least(100, p_tip_percent))
    where id = g.guest_id;
end $$;

create or replace function splitty_set_locked(p_share_code text, p_guest_token uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;

  update split_guest set locked_in = p_locked where id = g.guest_id;
end $$;

-- Admin-only. Requires the signed-in creator.
create or replace function splitty_close_bill(p_share_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from split_bill where share_code = p_share_code and created_by = auth.uid()
  ) then
    raise exception 'Only the creator can close this split';
  end if;

  update split_bill set status = 'closed', closed_at = now() where share_code = p_share_code;
end $$;

-- ---------------------------------------------------------------------------
-- Grants — anon gets the guest-facing writes (extends the invite_preview
-- precedent from a read to real writes; see ADR-0013).
-- ---------------------------------------------------------------------------
revoke execute on function splitty_create_bill(text, bigint, jsonb) from public;
revoke execute on function splitty_join(text, text) from public;
revoke execute on function _splitty_guest(text, uuid) from public;
revoke execute on function splitty_claim_item(text, uuid, uuid) from public;
revoke execute on function splitty_unclaim_item(text, uuid, uuid) from public;
revoke execute on function splitty_set_tip(text, uuid, numeric) from public;
revoke execute on function splitty_set_locked(text, uuid, boolean) from public;
revoke execute on function splitty_close_bill(text) from public;

grant execute on function splitty_create_bill(text, bigint, jsonb) to authenticated;
grant execute on function splitty_close_bill(text) to authenticated;

grant execute on function splitty_join(text, text) to anon, authenticated;
grant execute on function splitty_claim_item(text, uuid, uuid) to anon, authenticated;
grant execute on function splitty_unclaim_item(text, uuid, uuid) to anon, authenticated;
grant execute on function splitty_set_tip(text, uuid, numeric) to anon, authenticated;
grant execute on function splitty_set_locked(text, uuid, boolean) to anon, authenticated;
-- _splitty_guest is an internal helper only ever called by the RPCs above
-- (which run as the function owner) — it does NOT need a grant to anon/
-- authenticated, and should not get one.
```

**Apply exactly like every other migration in this project**: port 5432 is
blocked on this network, so use the Supabase Management API
`database/query` endpoint (`POST /v1/projects/zgoinuagmornkwgqomhq/database/query`,
`User-Agent: SupabaseCLI/2.109.1`), then record the version in
`supabase_migrations.schema_migrations` — see the notes on earlier migrations
in this file for the exact working incantation.

## Repo interface additions (`src/lib/data/repo.ts`)
New types, alongside the existing `ScanResult`/`ScanItem`:

```ts
export interface SplitBillItemInput {
  name: string;
  lineTotalCents: Cents;
}

export interface SplitBillGuest {
  id: string;
  displayName: string;
  tipPercent: number;
  lockedIn: boolean;
  isAdmin: boolean;
}

export interface SplitBillItem {
  id: string;
  name: string;
  lineTotalCents: Cents;
  claimedByGuestId: string | null;
}

export interface SplitBill {
  billId: string;
  shareCode: string;
  merchant: string | null;
  receiptTotalCents: Cents;
  status: "open" | "closed";
  items: SplitBillItem[];
  guests: SplitBillGuest[];
}
```

New `Repo` methods (append to the interface, own section like `// --- receipt
scanning ---` already has):

```ts
// --- Splitty (Phase 8; standalone from the expense ledger — ADR-0013) ---
/** Admin only (signed in). Creates the bill + the admin's own guest row. */
splittyCreateBill(
  merchant: string | null,
  receiptTotalCents: Cents,
  items: SplitBillItemInput[]
): Promise<{ shareCode: string; guestId: string; guestToken: string }>;
/** No auth required. */
splittyJoin(shareCode: string, displayName: string): Promise<{ guestId: string; guestToken: string }>;
/** No auth required. Null if the code doesn't exist. */
splittyGetBill(shareCode: string): Promise<SplitBill | null>;
splittyClaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void>;
splittyUnclaimItem(shareCode: string, guestToken: string, itemId: string): Promise<void>;
splittySetTip(shareCode: string, guestToken: string, tipPercent: number): Promise<void>;
splittySetLocked(shareCode: string, guestToken: string, locked: boolean): Promise<void>;
/** Admin only (signed in, must be the creator). */
splittyCloseBill(shareCode: string): Promise<void>;
/** Admin only — bills the signed-in user created, newest first. */
splittyListMyBills(): Promise<
  { shareCode: string; merchant: string | null; status: "open" | "closed"; createdAt: string }[]
>;
/** Realtime: invoke cb when items/guests change on this bill. Returns unsubscribe. */
subscribeSplitBill(shareCode: string, cb: () => void): () => void;
```

**`SupabaseRepo` implementation notes:**
- `splittyCreateBill` / `splittyJoin` / `splittyClaimItem` / etc. are thin
  `this.sb.rpc("splitty_...", {...})` wrappers, same shape as
  `redeemInvite`/`removeMember` already in this file — surface the RPC's
  `error.message` via `ValidationError`, matching the existing `this.fail()`
  helper pattern.
- `splittyGetBill` is **not** an RPC — it's three plain `.from().select()`
  calls (bill by `share_code`, items by `bill_id`, guests by `bill_id`, each
  ordered sensibly — items by `position`, guests by `joined_at`) then
  assembled client-side into one `SplitBill` object. This works unauthenticated
  because of the `select using (true)` policies above. Return `null` if the
  bill query comes back empty (`maybeSingle()`).
- `subscribeSplitBill` mirrors `subscribeShoppingItems` exactly — two
  `postgres_changes` listeners on one channel (`split_item` and `split_guest`,
  both `filter: bill_id=eq.<id>` — note this needs the bill's `id`, not its
  `share_code`, resolved via one extra lookup or passed in from the caller,
  who already has it from `splittyGetBill`).
- **Crucially**, none of these calls should go through `this.uid()` (the
  helper that throws if signed out) except `splittyCreateBill`,
  `splittyCloseBill`, and `splittyListMyBills` — the rest must work with no
  session at all. Double-check `SupabaseRepo`'s constructor/`this.sb` doesn't
  assume a session exists anywhere in the call path for the guest methods.

**`MemoryRepo` (demo) notes:** every feature in this app has a demo story
(ADR-0005's `getDemoRepo()`). Splitty's multi-device magic obviously can't be
demoed in a single in-memory session, so keep it simple: seed one canned open
bill ("Demo braai", 4 items, one fake already-locked-in guest "Sam" who's
claimed 2 of them) so the Splitty tab isn't empty in demo mode, and make
`splittyCreateBill`/`splittyJoin`/etc. mutate that same in-memory bill (same
spirit as the rest of `MemoryRepo` — real behavior, just not persisted or
cross-device). Document in a comment that the guest link literally cannot be
opened on a second device in demo mode (there's no server), same caveat
pattern already used for `scanReceipt`'s canned response.

## New/changed UI files
- **`src/app/split/[code]/page.tsx`** (new, public route) — the guest/admin
  claim page. Structurally similar to `src/app/join/[code]/page.tsx` but
  **must not** gate on `useSessionState()` — it has to render for a visitor
  with zero Tally history. Owns: localStorage read/write for
  `splitty_guest_<code>`, the name-entry form, the item checklist, tip
  selector, lock/unlock, and (conditionally, when `isAdmin` on the resolved
  guest) the share panel + overview + close-bill button.
- **`src/components/splitty-tab.tsx`** (new) — the 5th tab's content: list
  from `splittyListMyBills()`, a live coverage line per bill (needs its own
  `splittyGetBill` + `subscribeSplitBill` per visible row, or a lighter
  bulk-status RPC if that turns out to be too chatty — start simple, revisit
  if it's slow), "+ New split" entry point into the capture flow.
- **Capture flow** — strongly prefer **extending `receipt-scan-sheet.tsx`**
  with a `mode: "expense" | "splitty"` prop (it already has the exact capture
  → scan → editable-checklist UI needed) over duplicating it. In `"splitty"`
  mode, the terminal action is "Create split" → `repo.splittyCreateBill(...)`
  → write `localStorage["splitty_guest_" + shareCode]` → `router.push`
  to `/split/<shareCode>`, instead of `"expense"` mode's `onAdd(...)` callback
  into the Add-expense sheet.
- **Share panel** — reuse `invite-sheet.tsx`'s share block (lines ~219–258:
  the code display, `canNativeShare` branch, `shareInvite`/`copyMessage`
  functions) as the template; swap the message copy and the `/join/` → `/split/`
  path.
- **`src/components/tab-bar.tsx`** — add `"splitty"` to the `Tab` union, an
  icon path, and a label. Five `flex: 1` buttons in the existing bar will fit
  (confirmed acceptable per Josh — narrower per-tab but not broken); no other
  layout change needed.
- **`src/app/page.tsx`** — wire the new tab case to render `<SplittyTab
  repo={...} />`, following the existing tab-switch pattern already there for
  home/expenses/list/reports.

## Explicit non-goals for v1 (confirmed)
- **No `Expense` row, ever, in v1.** Splitty is fully outside the
  group/expense/balance system. (A later "convert a closed split into a real
  expense" phase is plausible future work, not part of this spec — it would
  need its own design pass, likely an authenticated RPC run by the bill's
  creator since only they have a real session and group membership.)
- **No splitting a single item's cost across multiple guests** — the
  qty-expansion from Phase 7 already produces one row per unit, so this
  isn't needed (confirmed decision).
- **No payment collection/money movement** — Splitty only tracks who claimed
  what and their tip; it never charges or transfers anything.
- **No share-link expiry** — closed bills just go read-only forever; no
  cleanup job.
- **No re-opening a closed bill** in v1 (plausible stretch RPC
  `splitty_reopen_bill`, same auth shape as `splitty_close_bill` — not built
  now, don't add it unless asked).
- **No requirement that per-guest totals reconcile to the receipt total** —
  see "Money math" above.

## Build order (when this gets picked up)
1. Migration `20260726000000_splitty.sql` (SQL above, verbatim) — apply via
   the Management API, record in `schema_migrations`.
2. `Repo` interface additions + `SupabaseRepo` implementation +
   `MemoryRepo` canned demo bill.
3. `receipt-scan-sheet.tsx` `mode` prop + "Create split" terminal action.
4. `/split/[code]/page.tsx` — name-entry → checklist → tip → lock, guest-only
   first (get the core loop working end-to-end with two real browser tabs
   before adding admin-only UI).
5. Admin-only additions to the same page: share panel, overview, close-bill.
6. `SplittyTab` + tab-bar + `page.tsx` wiring.
7. E2E-verify with **two real browser sessions** (not just one tab) — this is
   the first feature in the app where two genuinely different, unauthenticated
   parties interact live, so test claim races (`splitty_claim_item`'s atomic
   `update ... where claimed_by_guest_id is null` in particular) deliberately,
   not just the happy path.
8. Update this ROADMAP section's status line, write the "✅ SHIPPED" note
   (matching every other phase's convention), verify + ship per CLAUDE.md.
