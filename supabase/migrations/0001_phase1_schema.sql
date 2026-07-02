-- ============================================================================
-- SettleUp — Phase 1 schema (epic E2)
-- Source: "SettleUp - Scope, Data Model & Roadmap" §9 and "Phase 1 Plan" §3.3.
--
-- Conventions:
--  * All money columns are integer cents (bigint). Never floats.
--  * All ids are client-generated UUIDs (offline-safe, retry-idempotent).
--  * Every synced table carries sync metadata from day one (created_at,
--    updated_at, version, updated_by, deleted_at, client_id) so Phase 2
--    offline sync needs no retrofit.
--  * Deletes are soft (deleted_at tombstone).
--  * Balances are NEVER stored — always derived client-side from expenses
--    + settlements.
--
-- Apply with: supabase db push   (or paste into the SQL editor — docs/SETUP.md)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type split_method as enum ('equal', 'exact', 'percent', 'shares', 'salary');
create type member_role as enum ('owner', 'member');
create type member_status as enum ('active', 'invited', 'left');
create type activity_type as enum (
  'expense_added', 'expense_edited', 'expense_deleted',
  'settled', 'member_joined', 'recurring_generated'
);

-- ---------------------------------------------------------------------------
-- profile — 1:1 with auth.users. Salary is the sensitive field (see RLS).
-- ---------------------------------------------------------------------------
create table profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  monthly_salary_cents bigint check (monthly_salary_cents is null or monthly_salary_cents >= 0),
  default_split_method split_method,
  default_group_id uuid, -- FK added after "group" exists
  salary_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- group ("space" in the UI: household, trip, shared budget)
-- ---------------------------------------------------------------------------
create table "group" (
  id uuid primary key,
  name text not null,
  currency text not null default 'ZAR' check (currency = 'ZAR'),
  simplify_debts boolean not null default true,
  archived boolean not null default false,
  created_by uuid not null references auth.users (id),
  -- sync metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  client_id text
);

alter table profile
  add constraint profile_default_group_fk
  foreign key (default_group_id) references "group" (id) on delete set null;

-- ---------------------------------------------------------------------------
-- group_member — join between users and groups; user_id null = placeholder
-- (non-app) member recorded by name, upgradeable on invite.
-- ---------------------------------------------------------------------------
create table group_member (
  id uuid primary key,
  group_id uuid not null references "group" (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  placeholder_name text,
  role member_role not null default 'member',
  status member_status not null default 'active',
  check (user_id is not null or placeholder_name is not null),
  -- sync metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  client_id text
);

create unique index group_member_unique_user on group_member (group_id, user_id)
  where user_id is not null and deleted_at is null;
create index group_member_group_idx on group_member (group_id);
create index group_member_user_idx on group_member (user_id);

-- ---------------------------------------------------------------------------
-- invite — shareable code that lets the partner join the household (epic E3).
-- ---------------------------------------------------------------------------
create table invite (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references "group" (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users (id),
  expires_at timestamptz,
  -- if set, accepting this invite upgrades the placeholder member instead of
  -- creating a new one
  upgrades_member_id uuid references group_member (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- expense + expense_payer + expense_split
-- Integrity rule (scope doc §9.3): Σ payers.paid_cents = amount_cents and
-- Σ splits.share_cents = amount_cents. Enforced by the validate_expense()
-- trigger below (deferred to statement end so rows insert as a set), and
-- re-checked in the app layer.
-- ---------------------------------------------------------------------------
create table expense (
  id uuid primary key,
  group_id uuid not null references "group" (id) on delete cascade,
  description text not null default '',
  category text not null default 'other',
  amount_cents bigint not null check (amount_cents > 0),
  spent_at timestamptz not null default now(),
  split_method split_method not null default 'equal',
  receipt_url text,
  recurring_id uuid, -- FK to recurring_expense added in Phase 4 migration
  note text,
  created_by uuid not null references auth.users (id),
  -- sync metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  client_id text
);

create index expense_group_idx on expense (group_id, spent_at desc);

create table expense_payer (
  id uuid primary key,
  expense_id uuid not null references expense (id) on delete cascade,
  member_id uuid not null references group_member (id),
  paid_cents bigint not null check (paid_cents >= 0)
);

create index expense_payer_expense_idx on expense_payer (expense_id);

create table expense_split (
  id uuid primary key,
  expense_id uuid not null references expense (id) on delete cascade,
  member_id uuid not null references group_member (id),
  share_cents bigint not null check (share_cents >= 0),
  weight numeric -- raw input for shares/percent/salary methods (audit)
);

create index expense_split_expense_idx on expense_split (expense_id);

-- Payers/splits must reference members of the same group as the expense.
create or replace function check_member_in_expense_group() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from expense e
    join group_member gm on gm.id = new.member_id
    where e.id = new.expense_id and gm.group_id = e.group_id
  ) then
    raise exception 'member % is not in the expense''s group', new.member_id;
  end if;
  return new;
end $$;

create trigger expense_payer_member_group
  before insert or update on expense_payer
  for each row execute function check_member_in_expense_group();
create trigger expense_split_member_group
  before insert or update on expense_split
  for each row execute function check_member_in_expense_group();

-- Reconciliation: totals must match once the statement completes.
create or replace function validate_expense_totals() returns trigger
language plpgsql as $$
declare
  exp record;
  paid bigint;
  shared bigint;
begin
  for exp in
    select distinct e.id, e.amount_cents from expense e
    where e.id = coalesce(new.expense_id, old.expense_id) and e.deleted_at is null
  loop
    select coalesce(sum(paid_cents), 0) into paid from expense_payer where expense_id = exp.id;
    select coalesce(sum(share_cents), 0) into shared from expense_split where expense_id = exp.id;
    if paid <> exp.amount_cents then
      raise exception 'expense %: payers sum % <> total %', exp.id, paid, exp.amount_cents;
    end if;
    if shared <> exp.amount_cents then
      raise exception 'expense %: splits sum % <> total %', exp.id, shared, exp.amount_cents;
    end if;
  end loop;
  return null;
end $$;

-- Deferred constraint triggers so payer/split rows can be inserted as a set
-- within one transaction before the check fires.
create constraint trigger expense_payer_totals
  after insert or update or delete on expense_payer
  deferrable initially deferred
  for each row execute function validate_expense_totals();
create constraint trigger expense_split_totals
  after insert or update or delete on expense_split
  deferrable initially deferred
  for each row execute function validate_expense_totals();

-- ---------------------------------------------------------------------------
-- settlement — a recorded payment between two members
-- ---------------------------------------------------------------------------
create table settlement (
  id uuid primary key,
  group_id uuid not null references "group" (id) on delete cascade,
  from_member_id uuid not null references group_member (id),
  to_member_id uuid not null references group_member (id),
  amount_cents bigint not null check (amount_cents > 0),
  settled_at timestamptz not null default now(),
  check (from_member_id <> to_member_id),
  -- sync metadata
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  updated_by uuid references auth.users (id),
  deleted_at timestamptz,
  client_id text
);

create index settlement_group_idx on settlement (group_id, settled_at desc);

-- ---------------------------------------------------------------------------
-- activity — append-only audit feed
-- ---------------------------------------------------------------------------
create table activity (
  id uuid primary key,
  group_id uuid not null references "group" (id) on delete cascade,
  actor_id uuid not null references auth.users (id),
  type activity_type not null,
  target_id uuid not null,
  created_at timestamptz not null default now()
);

create index activity_group_idx on activity (group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at / version maintenance
-- ---------------------------------------------------------------------------
create or replace function bump_sync_meta() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end $$;

create trigger group_bump before update on "group"
  for each row execute function bump_sync_meta();
create trigger group_member_bump before update on group_member
  for each row execute function bump_sync_meta();
create trigger expense_bump before update on expense
  for each row execute function bump_sync_meta();
create trigger settlement_bump before update on settlement
  for each row execute function bump_sync_meta();

-- ============================================================================
-- Row-Level Security (scope doc §10)
-- A user may only touch rows in groups they actively belong to. The salary
-- column is protected by exposing profiles of group-mates through a view that
-- strips it unless salary_visible.
-- ============================================================================
alter table profile enable row level security;
alter table "group" enable row level security;
alter table group_member enable row level security;
alter table invite enable row level security;
alter table expense enable row level security;
alter table expense_payer enable row level security;
alter table expense_split enable row level security;
alter table settlement enable row level security;
alter table activity enable row level security;

-- Helper: the groups the current user actively belongs to.
-- security definer so policies can use it without recursive RLS on group_member.
create or replace function my_group_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select group_id from group_member
  where user_id = auth.uid() and status = 'active' and deleted_at is null
$$;

-- profile: owner-only. Group-mates read via profile_public (below), which
-- never exposes the salary unless its owner opted in.
create policy profile_select_own on profile for select using (user_id = auth.uid());
create policy profile_insert_own on profile for insert with check (user_id = auth.uid());
create policy profile_update_own on profile for update using (user_id = auth.uid());

create view profile_public with (security_invoker = false) as
  select user_id, display_name, avatar_url,
         case when salary_visible then monthly_salary_cents else null end as monthly_salary_cents
  from profile;
grant select on profile_public to authenticated;

-- group: members read; any authenticated user may create (becoming owner via
-- app logic); only members update.
create policy group_select on "group" for select
  using (id in (select my_group_ids()) or created_by = auth.uid());
create policy group_insert on "group" for insert
  with check (created_by = auth.uid());
create policy group_update on "group" for update
  using (id in (select my_group_ids()));

-- group_member: members of the group read/write (adding placeholders, invites
-- upgrading members). Self-insert allows accepting an invite.
create policy group_member_select on group_member for select
  using (group_id in (select my_group_ids()) or user_id = auth.uid());
create policy group_member_insert on group_member for insert
  with check (
    group_id in (select my_group_ids())
    or user_id = auth.uid() -- joining via invite / creating own group
  );
create policy group_member_update on group_member for update
  using (group_id in (select my_group_ids()));

-- invite: group members create/read; anyone authenticated may look up a code
-- to accept it (code knowledge is the capability).
create policy invite_select on invite for select using (true);
create policy invite_insert on invite for insert
  with check (group_id in (select my_group_ids()) and created_by = auth.uid());
create policy invite_delete on invite for delete
  using (group_id in (select my_group_ids()));

-- expense / payer / split / settlement / activity: group members only.
create policy expense_all on expense for all
  using (group_id in (select my_group_ids()))
  with check (group_id in (select my_group_ids()));

create policy expense_payer_all on expense_payer for all
  using (expense_id in (select id from expense where group_id in (select my_group_ids())))
  with check (expense_id in (select id from expense where group_id in (select my_group_ids())));

create policy expense_split_all on expense_split for all
  using (expense_id in (select id from expense where group_id in (select my_group_ids())))
  with check (expense_id in (select id from expense where group_id in (select my_group_ids())));

create policy settlement_all on settlement for all
  using (group_id in (select my_group_ids()))
  with check (group_id in (select my_group_ids()));

create policy activity_select on activity for select
  using (group_id in (select my_group_ids()));
create policy activity_insert on activity for insert
  with check (group_id in (select my_group_ids()) and actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Auto-create a profile row on signup.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
