-- ============================================================================
-- Phase 6: fixed-split recurring (Josh) — a recurring rule can lock in exact
-- per-member share values instead of a method that recomputes each month.
--
-- Adds:
--   * recurring_expense.fixed_shares jsonb — [{member_id, share_cents}, …]
--     (used only when split_method = 'exact')
--   * 'exact' allowed in the split_method CHECK
--   * generation branch that reuses the stored shares verbatim, with the same
--     cent-exact discipline; falls back to equal (and still generates) if the
--     stored shares no longer reconcile (a participant left, amount changed).
-- ============================================================================

alter table recurring_expense
  drop constraint if exists recurring_expense_split_method_check;

alter table recurring_expense
  add constraint recurring_expense_split_method_check
  check (split_method in ('equal', 'salary', 'exact'));

alter table recurring_expense
  add column if not exists fixed_shares jsonb;

-- Regenerate the rule → expense helper with a fixed-shares branch.
create or replace function _generate_from_rule(r recurring_expense, p_spent_at timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid := gen_random_uuid();
  n int := array_length(r.participant_member_ids, 1);
  use_salary boolean := false;
  use_fixed boolean := false;
  weights numeric[];
  fixed_sum bigint;
  fixed_valid boolean := false;
begin
  -- Fixed shares: valid only if every stored member is still a live member of
  -- the group and the shares sum exactly to the rule amount.
  if r.split_method = 'exact' and r.fixed_shares is not null then
    select coalesce(sum((s->>'share_cents')::bigint), 0) into fixed_sum
    from jsonb_array_elements(r.fixed_shares) s;
    select fixed_sum = r.amount_cents
       and not exists (
         select 1 from jsonb_array_elements(r.fixed_shares) s
         left join group_member gm
           on gm.id = (s->>'member_id')::uuid
          and gm.group_id = r.group_id and gm.deleted_at is null
         where gm.id is null
       )
      into fixed_valid;
    use_fixed := fixed_valid;
  end if;

  if not use_fixed and r.split_method = 'salary' then
    select array_agg(coalesce(p.monthly_salary_cents, 0)::numeric order by ord.i)
      into weights
    from unnest(r.participant_member_ids) with ordinality as ord(mid, i)
    join group_member gm on gm.id = ord.mid
    left join profile p on p.user_id = gm.user_id;
    use_salary := not exists (select 1 from unnest(weights) x where x <= 0);
  end if;
  if not use_fixed and not use_salary then
    weights := array_fill(1::numeric, array[n]);
  end if;

  insert into expense (id, group_id, description, category, amount_cents, spent_at,
                       split_method, recurring_id, created_by, updated_by)
  values (eid, r.group_id, r.description, r.category, r.amount_cents, p_spent_at,
          case
            when use_fixed then 'exact'::split_method
            when use_salary then 'salary'::split_method
            else 'equal'::split_method
          end,
          r.id, r.created_by, r.created_by);

  insert into expense_payer (id, expense_id, member_id, paid_cents)
  values (gen_random_uuid(), eid, r.payer_member_id, r.amount_cents);

  if use_fixed then
    insert into expense_split (id, expense_id, member_id, share_cents)
    select gen_random_uuid(), eid, (s->>'member_id')::uuid, (s->>'share_cents')::bigint
    from jsonb_array_elements(r.fixed_shares) s;
  else
    insert into expense_split (id, expense_id, member_id, share_cents)
    select gen_random_uuid(), eid, w.mid, w.cents
    from _weighted_shares(r.amount_cents, r.participant_member_ids, weights) w;
  end if;

  insert into activity (id, group_id, actor_id, type, target_id)
  values (gen_random_uuid(), r.group_id, r.created_by, 'recurring_generated', eid);

  return eid;
end $$;

revoke execute on function _generate_from_rule(recurring_expense, timestamptz) from public;
