-- ============================================================================
-- Category provenance + the backfill audit log (Phase 18 §5, ADR-0019).
--
-- 1. expense.category_source records WHO chose the category: 'auto' (the
--    matcher), 'manual' (a person picked it in the category picker) or
--    'learned' (a learned rule, Phase 18 §2). Every existing row is 'auto':
--    no provenance was ever stored, which is exactly why the legacy backfill
--    only touches fallback buckets. From here on a re-run can skip anything a
--    person chose.
--
-- 2. create_expense / update_expense read it from p_expense. On update a
--    missing key keeps the stored value, so an older client (which never
--    sends it) changes nothing. Both are otherwise identical to the versions
--    in 20260803000000_multi_currency_expenses.sql.
--
-- 3. category_backfill logs every category the backfill script
--    (settleup/scripts/backfill-categories.ts) changes: run id, table, row,
--    before, after, and why. It's what makes a run reversible. Service-only:
--    RLS on with no policies, and no grants to the API roles.
--
-- Additive only. No existing value changes.
-- ============================================================================

alter table expense
  add column if not exists category_source text not null default 'auto'
  check (category_source in ('auto', 'manual', 'learned'));

create table if not exists category_backfill (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  table_name text not null check (table_name in ('expense', 'recurring_expense')),
  row_id uuid not null,
  category_before text not null,
  category_after text not null,
  reason text not null check (reason in ('household', 'engine')),
  applied_at timestamptz not null default now(),
  reverted_at timestamptz
);
create index if not exists category_backfill_run on category_backfill (run_id);

alter table category_backfill enable row level security;
revoke all on category_backfill from anon, authenticated;

create or replace function create_expense(p_expense jsonb, p_payers jsonb, p_splits jsonb)
returns setof expense language plpgsql as $$
declare
  eid uuid;
begin
  insert into expense (
    id, group_id, description, category, category_source, amount_cents, spent_at,
    split_method, note, recurring_id, created_by, updated_by, client_id,
    original_currency, original_amount_cents, fx_rate_to_zar
  ) values (
    coalesce((p_expense->>'id')::uuid, gen_random_uuid()),
    (p_expense->>'group_id')::uuid,
    coalesce(p_expense->>'description', ''),
    coalesce(p_expense->>'category', 'other'),
    coalesce(p_expense->>'category_source', 'auto'),
    (p_expense->>'amount_cents')::bigint,
    coalesce((p_expense->>'spent_at')::timestamptz, now()),
    coalesce((p_expense->>'split_method')::split_method, 'equal'),
    p_expense->>'note',
    (p_expense->>'recurring_id')::uuid,
    auth.uid(),
    auth.uid(),
    p_expense->>'client_id',
    p_expense->>'original_currency',
    (p_expense->>'original_amount_cents')::bigint,
    (p_expense->>'fx_rate_to_zar')::numeric
  ) returning id into eid;

  insert into expense_payer (id, expense_id, member_id, paid_cents)
  select gen_random_uuid(), eid, (e->>'member_id')::uuid, (e->>'paid_cents')::bigint
  from jsonb_array_elements(p_payers) e;

  insert into expense_split (id, expense_id, member_id, share_cents, weight)
  select gen_random_uuid(), eid, (e->>'member_id')::uuid, (e->>'share_cents')::bigint,
         (e->>'weight')::numeric
  from jsonb_array_elements(p_splits) e;

  insert into activity (id, group_id, actor_id, type, target_id)
  values (gen_random_uuid(), (p_expense->>'group_id')::uuid, auth.uid(), 'expense_added', eid);

  return query select * from expense where id = eid;
end $$;

create or replace function update_expense(p_id uuid, p_expense jsonb, p_payers jsonb, p_splits jsonb)
returns setof expense language plpgsql as $$
begin
  update expense set
    description = coalesce(p_expense->>'description', description),
    category = coalesce(p_expense->>'category', category),
    -- Only sent when a person picked the category in this edit; otherwise
    -- the stored provenance stands.
    category_source = coalesce(p_expense->>'category_source', category_source),
    amount_cents = coalesce((p_expense->>'amount_cents')::bigint, amount_cents),
    spent_at = coalesce((p_expense->>'spent_at')::timestamptz, spent_at),
    split_method = coalesce((p_expense->>'split_method')::split_method, split_method),
    note = p_expense->>'note',
    -- Written unconditionally: the client always sends the full trio (or all
    -- nulls when the expense is back to plain Rand), so an edit that clears
    -- the foreign currency clears these too.
    original_currency = p_expense->>'original_currency',
    original_amount_cents = (p_expense->>'original_amount_cents')::bigint,
    fx_rate_to_zar = (p_expense->>'fx_rate_to_zar')::numeric,
    updated_by = auth.uid()
  where id = p_id;

  if not found then
    raise exception 'expense % not found or not accessible', p_id;
  end if;

  delete from expense_payer where expense_id = p_id;
  delete from expense_split where expense_id = p_id;

  insert into expense_payer (id, expense_id, member_id, paid_cents)
  select gen_random_uuid(), p_id, (e->>'member_id')::uuid, (e->>'paid_cents')::bigint
  from jsonb_array_elements(p_payers) e;

  insert into expense_split (id, expense_id, member_id, share_cents, weight)
  select gen_random_uuid(), p_id, (e->>'member_id')::uuid, (e->>'share_cents')::bigint,
         (e->>'weight')::numeric
  from jsonb_array_elements(p_splits) e;

  insert into activity (id, group_id, actor_id, type, target_id)
  select gen_random_uuid(), e.group_id, auth.uid(), 'expense_edited', e.id
  from expense e where e.id = p_id;

  return query select * from expense where id = p_id;
end $$;

notify pgrst, 'reload schema';
