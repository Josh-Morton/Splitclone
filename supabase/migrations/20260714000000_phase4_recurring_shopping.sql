-- ============================================================================
-- Phase 4: recurring expenses + shared shopping list (scope §6.6–6.7, plan §4.3)
--
--  * recurring_expense: template rules that generate real expenses on schedule
--  * shopping_item: the shared list (realtime-enabled)
--  * process_due_recurring(): generates due expenses — run daily by pg_cron
--    AND callable per-group by clients as catch-up on app open
--  * run_recurring_now(): the "Add now" button
--
-- Split maths in SQL mirrors lib/domain/split.ts (largest remainder, ties by
-- input order). Salary-proportional falls back to equal when any participant
-- lacks a salary — same rule as the client.
-- ============================================================================

create type recurring_frequency as enum ('weekly', 'monthly');

create table recurring_expense (
  id uuid primary key,
  group_id uuid not null references "group" (id) on delete cascade,
  description text not null,
  category text not null default 'other',
  amount_cents bigint not null check (amount_cents > 0),
  frequency recurring_frequency not null default 'monthly',
  -- day-of-month 1–28 (monthly) or 0–6 (weekly)
  anchor int not null check (anchor between 0 and 28),
  next_run date not null,
  end_date date,
  payer_member_id uuid not null references group_member (id),
  split_method split_method not null default 'salary' check (split_method in ('equal','salary')),
  participant_member_ids uuid[] not null check (array_length(participant_member_ids, 1) >= 1),
  paused boolean not null default false,
  created_by uuid not null references auth.users (id),
  -- sync metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  client_id text
);

create index recurring_group_idx on recurring_expense (group_id);
create index recurring_due_idx on recurring_expense (next_run) where paused = false and deleted_at is null;

create table shopping_item (
  id uuid primary key,
  group_id uuid not null references "group" (id) on delete cascade,
  name text not null,
  qty numeric,
  est_price_cents bigint check (est_price_cents is null or est_price_cents >= 0),
  checked boolean not null default false,
  added_by uuid not null references auth.users (id),
  -- sync metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  client_id text
);

create index shopping_group_idx on shopping_item (group_id, created_at);

alter table expense
  add constraint expense_recurring_fk
  foreign key (recurring_id) references recurring_expense (id) on delete set null;

create trigger recurring_bump before update on recurring_expense
  for each row execute function bump_sync_meta();
create trigger shopping_bump before update on shopping_item
  for each row execute function bump_sync_meta();

-- RLS: group members only (same pattern as expense/settlement)
alter table recurring_expense enable row level security;
alter table shopping_item enable row level security;

create policy recurring_all on recurring_expense for all
  using (group_id in (select my_group_ids()))
  with check (group_id in (select my_group_ids()));

create policy shopping_all on shopping_item for all
  using (group_id in (select my_group_ids()))
  with check (group_id in (select my_group_ids()));

-- Realtime for the shared list (both phones see edits live)
alter publication supabase_realtime add table shopping_item;

-- ----------------------------------------------------------------------------
-- Generation
-- ----------------------------------------------------------------------------

-- Largest-remainder weighted shares; mirrors lib/domain/split.ts splitWeighted.
create or replace function _weighted_shares(p_total bigint, p_ids uuid[], p_weights numeric[])
returns table (mid uuid, cents bigint)
language sql immutable as $$
  with w as (
    select ord.i, ord.mid_, p_weights[ord.i] as wt
    from unnest(p_ids) with ordinality as ord(mid_, i)
  ),
  tot as (select sum(wt) as sw from w),
  floors as (
    select w.i, w.mid_,
           floor((p_total * w.wt) / t.sw)::bigint as fl,
           (p_total * w.wt) / t.sw - floor((p_total * w.wt) / t.sw) as frac
    from w, tot t
  ),
  ranked as (
    select f.i, f.mid_, f.fl,
           row_number() over (order by f.frac desc, f.i asc) as rk,
           (select p_total - sum(x.fl) from floors x) as rem
    from floors f
  )
  select r.mid_, r.fl + case when r.rk <= r.rem then 1 else 0 end
  from ranked r order by r.i;
$$;

-- Generate one expense from a rule at a given date. Internal helper.
create or replace function _generate_from_rule(r recurring_expense, p_spent_at timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := gen_random_uuid();
  n int := array_length(r.participant_member_ids, 1);
  use_salary boolean := false;
  weights numeric[];
begin
  if r.split_method = 'salary' then
    select array_agg(coalesce(p.monthly_salary_cents, 0)::numeric order by ord.i)
      into weights
    from unnest(r.participant_member_ids) with ordinality as ord(mid, i)
    join group_member gm on gm.id = ord.mid
    left join profile p on p.user_id = gm.user_id;
    use_salary := not exists (select 1 from unnest(weights) x where x <= 0);
  end if;
  if not use_salary then
    weights := array_fill(1::numeric, array[n]);
  end if;

  insert into expense (id, group_id, description, category, amount_cents, spent_at,
                       split_method, recurring_id, created_by, updated_by)
  values (eid, r.group_id, r.description, r.category, r.amount_cents, p_spent_at,
          case when use_salary then 'salary'::split_method else 'equal'::split_method end,
          r.id, r.created_by, r.created_by);

  insert into expense_payer (id, expense_id, member_id, paid_cents)
  values (gen_random_uuid(), eid, r.payer_member_id, r.amount_cents);

  insert into expense_split (id, expense_id, member_id, share_cents)
  select gen_random_uuid(), eid, s.mid, s.cents
  from _weighted_shares(r.amount_cents, r.participant_member_ids, weights) s;

  insert into activity (id, group_id, actor_id, type, target_id)
  values (gen_random_uuid(), r.group_id, r.created_by, 'recurring_generated', eid);

  return eid;
end $$;

create or replace function _advance_next_run(p_next date, p_freq recurring_frequency, p_anchor int)
returns date
language sql immutable as $$
  select case
    when p_freq = 'weekly' then p_next + 7
    else (date_trunc('month', p_next) + interval '1 month'
          + make_interval(days => least(p_anchor, 28) - 1))::date
  end;
$$;

-- Process all due rules (cron: p_group_id null) or one group's (client catch-up).
create or replace function process_due_recurring(p_group_id uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  r recurring_expense;
  generated int := 0;
  guard int;
begin
  -- Clients may only process groups they belong to; cron (no auth) does all.
  if auth.uid() is not null and p_group_id is not null then
    if not exists (select 1 from group_member gm where gm.group_id = p_group_id
                   and gm.user_id = auth.uid() and gm.status = 'active' and gm.deleted_at is null) then
      raise exception 'not a member of this group';
    end if;
  elsif auth.uid() is not null and p_group_id is null then
    raise exception 'clients must pass a group id';
  end if;

  for r in
    select * from recurring_expense
    where (p_group_id is null or group_id = p_group_id)
      and paused = false and deleted_at is null and next_run <= current_date
    for update skip locked
  loop
    guard := 0;
    while r.next_run <= current_date and guard < 24
          and (r.end_date is null or r.next_run <= r.end_date) loop
      perform _generate_from_rule(r, r.next_run::timestamptz);
      r.next_run := _advance_next_run(r.next_run, r.frequency, r.anchor);
      generated := generated + 1;
      guard := guard + 1;
    end loop;
    update recurring_expense
      set next_run = r.next_run,
          paused = case when r.end_date is not null and r.next_run > r.end_date then true else paused end
      where id = r.id;
  end loop;
  return generated;
end $$;

-- "Add now": generate immediately (dated now) and advance one period.
create or replace function run_recurring_now(p_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r recurring_expense;
  eid uuid;
begin
  select * into r from recurring_expense
    where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'recurring rule not found';
  end if;
  if auth.uid() is null or not exists (
    select 1 from group_member gm where gm.group_id = r.group_id
    and gm.user_id = auth.uid() and gm.status = 'active' and gm.deleted_at is null
  ) then
    raise exception 'not a member of this group';
  end if;

  eid := _generate_from_rule(r, now());
  update recurring_expense
    set next_run = _advance_next_run(r.next_run, r.frequency, r.anchor)
    where id = p_id;
  return eid;
end $$;

revoke execute on function _generate_from_rule(recurring_expense, timestamptz) from public;
revoke execute on function process_due_recurring(uuid) from public;
revoke execute on function run_recurring_now(uuid) from public;
grant execute on function process_due_recurring(uuid) to authenticated;
grant execute on function run_recurring_now(uuid) to authenticated;

-- Daily generation at 04:15 UTC (also covered by client catch-up on app open).
create extension if not exists pg_cron;
select cron.schedule('settleup-recurring-daily', '15 4 * * *', $$select process_due_recurring()$$);
