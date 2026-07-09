-- ============================================================================
-- Expense write RPCs.
--
-- Why: expense + expense_payer + expense_split must be written in ONE
-- transaction so the deferred reconciliation triggers (payers/splits must sum
-- to the total) see the complete set. PostgREST can't do multi-table inserts
-- in one request, so the client calls these functions instead.
--
-- SECURITY INVOKER (the default): RLS still applies to every insert/update,
-- so callers can only write into groups they belong to.
--
-- The client remains responsible for computing splits (domain layer); these
-- functions are plumbing + the database re-validates totals via the triggers.
-- ============================================================================

create or replace function create_expense(
  p_expense jsonb,
  p_payers jsonb,
  p_splits jsonb
) returns setof expense
language plpgsql as $$
declare
  eid uuid;
begin
  insert into expense (
    id, group_id, description, category, amount_cents, spent_at,
    split_method, note, recurring_id, created_by, updated_by, client_id
  ) values (
    coalesce((p_expense->>'id')::uuid, gen_random_uuid()),
    (p_expense->>'group_id')::uuid,
    coalesce(p_expense->>'description', ''),
    coalesce(p_expense->>'category', 'other'),
    (p_expense->>'amount_cents')::bigint,
    coalesce((p_expense->>'spent_at')::timestamptz, now()),
    coalesce((p_expense->>'split_method')::split_method, 'equal'),
    p_expense->>'note',
    (p_expense->>'recurring_id')::uuid,
    auth.uid(),
    auth.uid(),
    p_expense->>'client_id'
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

-- Rewrites payers/splits wholesale in the same transaction, so the deferred
-- totals check always fires against the complete new set.
create or replace function update_expense(
  p_id uuid,
  p_expense jsonb,
  p_payers jsonb,
  p_splits jsonb
) returns setof expense
language plpgsql as $$
begin
  update expense set
    description = coalesce(p_expense->>'description', description),
    category = coalesce(p_expense->>'category', category),
    amount_cents = coalesce((p_expense->>'amount_cents')::bigint, amount_cents),
    spent_at = coalesce((p_expense->>'spent_at')::timestamptz, spent_at),
    split_method = coalesce((p_expense->>'split_method')::split_method, split_method),
    note = p_expense->>'note',
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

-- RLS on expense_payer/expense_split allows all group members to modify, and
-- these run as invoker, so no privilege escalation. Grant execute explicitly.
grant execute on function create_expense(jsonb, jsonb, jsonb) to authenticated;
grant execute on function update_expense(uuid, jsonb, jsonb, jsonb) to authenticated;
