-- ============================================================================
-- Phase 21 — Splitty on its own (ADR-0022).
--
-- 1. Rand tips: split_guest.tip_cents. Set by splitty_set_tip_amount; a
--    percentage (splitty_set_tip) clears it, and a Rand amount zeroes the
--    percentage, so exactly one of them is ever in force.
-- 2. splitty_create_bill takes the creator's name, for people starting a
--    split without a Tally account (anonymous sessions). The old 3-argument
--    version is DROPPED first, so PostgREST never sees two candidates; the
--    new 4th argument defaults to null, so existing callers are unchanged.
--    Also fixes the name fallback: an empty profile name used to come
--    through as '' because coalesce() only catches null.
-- 3. A shared daily scan budget (Africa/Johannesburg day) plus a per-account
--    cap. consume_scan/refund_scan are for the scan-receipt Edge Function's
--    service role only; scans_remaining_today() is public, and scan_usage is
--    in Realtime so the "(N Splits remaining for today)" counter moves live.
-- 4. splitty_event: first-party usage events, written only via splitty_track.
--    No policies, so only the dashboard / SQL can read it.
-- 5. Ledger guard: anonymous users (Splitty creators) can't create a Tally or
--    redeem an invite. Every other ledger table is reachable only through
--    Tally membership.
-- ============================================================================

-- 1. Rand tips --------------------------------------------------------------
alter table split_guest
  add column if not exists tip_cents bigint
  check (tip_cents is null or (tip_cents >= 0 and tip_cents <= 10000000));

create or replace function splitty_set_tip(p_share_code text, p_guest_token uuid, p_tip_percent numeric)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your tip'; end if;

  update split_guest
    set tip_percent = greatest(0, least(100, p_tip_percent)), tip_cents = null
    where id = g.guest_id;
end $$;

create or replace function splitty_set_tip_amount(p_share_code text, p_guest_token uuid, p_tip_cents bigint)
returns void language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from _splitty_guest(p_share_code, p_guest_token);
  if g.bill_status = 'closed' then raise exception 'This split is closed'; end if;
  if g.locked_in then raise exception 'Unlock to change your tip'; end if;
  if p_tip_cents is null or p_tip_cents < 0 or p_tip_cents > 10000000 then
    raise exception 'Enter a tip between R0 and R100 000';
  end if;

  update split_guest set tip_cents = p_tip_cents, tip_percent = 0 where id = g.guest_id;
end $$;

revoke execute on function splitty_set_tip_amount(text, uuid, bigint) from public;
grant execute on function splitty_set_tip_amount(text, uuid, bigint) to anon, authenticated;

-- 2. Creator name -----------------------------------------------------------
drop function if exists splitty_create_bill(text, bigint, jsonb);

create function splitty_create_bill(
  p_merchant text,
  p_receipt_total_cents bigint,
  p_items jsonb,
  p_display_name text default null
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
  -- A Tally user's profile name wins; otherwise the name they typed; else "Host".
  select nullif(trim(display_name), '') into v_name from profile where user_id = v_uid;
  v_name := coalesce(v_name, nullif(left(trim(coalesce(p_display_name, '')), 40), ''), 'Host');

  insert into split_bill (share_code, created_by, merchant, receipt_total_cents)
  values (v_code, v_uid, nullif(trim(p_merchant), ''), greatest(p_receipt_total_cents, 0))
  returning id into v_bill_id;

  insert into split_guest (bill_id, display_name, is_admin)
  values (v_bill_id, v_name, true)
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

revoke execute on function splitty_create_bill(text, bigint, jsonb, text) from public, anon;
grant execute on function splitty_create_bill(text, bigint, jsonb, text) to authenticated;

-- 3. Daily scan budget -------------------------------------------------------
create table if not exists scan_usage (
  day date primary key,
  scans int not null default 0 check (scans >= 0)
);
create table if not exists scan_usage_user (
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  scans int not null default 0 check (scans >= 0),
  primary key (day, user_id)
);

alter table scan_usage enable row level security;
alter table scan_usage_user enable row level security;
-- The daily total is public (it's the counter); nobody but the functions writes.
drop policy if exists scan_usage_select on scan_usage;
create policy scan_usage_select on scan_usage for select using (true);
revoke insert, update, delete, truncate on scan_usage from anon, authenticated;
revoke all on scan_usage_user from anon, authenticated;

-- The one place the numbers live.
create or replace function scan_budget() returns int language sql immutable as $$ select 100 $$;
create or replace function scan_user_cap() returns int language sql immutable as $$ select 15 $$;
create or replace function scan_day() returns date language sql stable as $$
  select (now() at time zone 'Africa/Johannesburg')::date
$$;

create or replace function scans_remaining_today() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, scan_budget() - coalesce((select scans from scan_usage where day = scan_day()), 0))
$$;

-- Reserve one scan for p_user, or raise. Returns what's left today after it.
create or replace function consume_scan(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  d date := scan_day();
  used int;
  mine int;
begin
  insert into scan_usage (day, scans) values (d, 0) on conflict (day) do nothing;
  select scans into used from scan_usage where day = d for update;
  if used >= scan_budget() then
    raise exception 'scan_budget_exhausted';
  end if;

  insert into scan_usage_user (day, user_id, scans) values (d, p_user, 0) on conflict do nothing;
  select scans into mine from scan_usage_user where day = d and user_id = p_user for update;
  if mine >= scan_user_cap() then
    raise exception 'scan_user_cap_reached';
  end if;

  update scan_usage set scans = scans + 1 where day = d;
  update scan_usage_user set scans = scans + 1 where day = d and user_id = p_user;
  return scan_budget() - used - 1;
end $$;

-- Give back a reserved scan that never reached a result (Google failed, or
-- read nothing).
create or replace function refund_scan(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d date := scan_day();
begin
  update scan_usage set scans = greatest(0, scans - 1) where day = d;
  update scan_usage_user set scans = greatest(0, scans - 1) where day = d and user_id = p_user;
end $$;

revoke execute on function consume_scan(uuid) from public, anon, authenticated;
revoke execute on function refund_scan(uuid) from public, anon, authenticated;
grant execute on function consume_scan(uuid) to service_role;
grant execute on function refund_scan(uuid) to service_role;
revoke execute on function scans_remaining_today() from public;
grant execute on function scans_remaining_today() to anon, authenticated;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scan_usage'
  ) then
    alter publication supabase_realtime add table scan_usage;
  end if;
end $$;

-- 4. Usage events -----------------------------------------------------------
create table if not exists splitty_event (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('splitty_opened', 'bill_opened', 'share_tapped', 'split_created')),
  share_code text,
  ref text,
  source text check (source is null or source in ('splitty_page', 'tally_tab')),
  device_id uuid,
  user_id uuid,
  is_anonymous boolean
);
create index if not exists splitty_event_created on splitty_event (created_at);
create index if not exists splitty_event_ref on splitty_event (ref) where ref is not null;

alter table splitty_event enable row level security;
revoke all on splitty_event from anon, authenticated;

create or replace function splitty_track(
  p_event text,
  p_share_code text default null,
  p_ref text default null,
  p_source text default null,
  p_device_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('splitty_opened', 'bill_opened', 'share_tapped', 'split_created') then
    raise exception 'Unknown event';
  end if;
  insert into splitty_event (event, share_code, ref, source, device_id, user_id, is_anonymous)
  values (
    p_event,
    nullif(left(trim(coalesce(p_share_code, '')), 64), ''),
    nullif(left(trim(coalesce(p_ref, '')), 64), ''),
    case when p_source in ('splitty_page', 'tally_tab') then p_source end,
    p_device_id,
    auth.uid(),
    case when auth.uid() is null then null
         else coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) end
  );
end $$;

revoke execute on function splitty_track(text, text, text, text, uuid) from public;
grant execute on function splitty_track(text, text, text, text, uuid) to anon, authenticated;

-- 5. Ledger guard -----------------------------------------------------------
drop policy if exists group_insert_not_anonymous on "group";
create policy group_insert_not_anonymous on "group" as restrictive for insert to authenticated
  with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

create or replace function redeem_invite(p_code text)
returns table (group_id uuid, group_name text)
language plpgsql security definer set search_path = public as $$
declare
  inv record;
  uid uuid := auth.uid();
  upgraded boolean := false;
begin
  if uid is null then
    raise exception 'Sign in to accept an invite';
  end if;
  -- Splitty's no-account sessions (ADR-0022) never join a Tally.
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Create a Tally account to accept an invite';
  end if;

  select * into inv from invite i where i.code = upper(trim(p_code));
  if not found then
    raise exception 'Invalid invite code';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'This invite has expired';
  end if;

  -- Already an active member? Nothing to do.
  if exists (
    select 1 from group_member gm
    where gm.group_id = inv.group_id and gm.user_id = uid and gm.deleted_at is null
  ) then
    return query select g.id, g.name from "group" g where g.id = inv.group_id;
    return;
  end if;

  -- Previously removed/left? Reactivate that membership (no duplicate row).
  update group_member gm
    set status = 'active', deleted_at = null, updated_by = uid
    where gm.group_id = inv.group_id and gm.user_id = uid and gm.deleted_at is not null;
  if found then
    insert into activity (id, group_id, actor_id, type, target_id)
    values (gen_random_uuid(), inv.group_id, uid, 'member_joined', inv.group_id);
    return query select g.id, g.name from "group" g where g.id = inv.group_id;
    return;
  end if;

  if inv.upgrades_member_id is not null then
    update group_member gm
    set user_id = uid, placeholder_name = null, status = 'active', updated_by = uid
    where gm.id = inv.upgrades_member_id
      and gm.user_id is null
      and gm.deleted_at is null;
    upgraded := found;
  end if;

  if not upgraded then
    insert into group_member (id, group_id, user_id, role, status, updated_by)
    values (gen_random_uuid(), inv.group_id, uid, 'member', 'active', uid);
  end if;

  insert into activity (id, group_id, actor_id, type, target_id)
  values (gen_random_uuid(), inv.group_id, uid, 'member_joined', inv.group_id);

  return query select g.id, g.name from "group" g where g.id = inv.group_id;
end $$;

notify pgrst, 'reload schema';
