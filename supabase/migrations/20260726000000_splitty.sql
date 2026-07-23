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
-- RLS-with-no-policy already denies every row; we ALSO revoke the table-level
-- grants Supabase hands anon/authenticated by default, so both layers deny
-- (defense-in-depth — the token is only ever read by the SECURITY DEFINER RPCs,
-- which run as the owner and bypass both).
revoke all on table split_guest_secret from anon, authenticated;

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
