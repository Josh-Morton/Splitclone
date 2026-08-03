-- ============================================================================
-- Phase 14: per-expense foreign currency, converted and locked to ZAR at entry
-- (ADR-0017, amended by ADR-0018 for the rate provider).
--
-- The ledger stays ZAR. `expense.amount_cents` remains the authoritative Rand
-- amount and is what every split, balance, report and export reads — exactly
-- as before. The columns added here only RECORD what the amount was converted
-- from, so the app can show "R1 317,52 (from $80,00 @ R16,4690)".
-- ============================================================================

-- Daily-refreshed cache. Expense entry reads this table; it never calls the
-- rate provider synchronously (ADR-0017), so a provider outage degrades to
-- "yesterday's rate" rather than blocking anyone from logging an expense.
create table if not exists exchange_rate (
  currency_code text primary key,
  -- 1 unit of currency_code = this many ZAR.
  rate_to_zar numeric not null check (rate_to_zar > 0),
  fetched_at timestamptz not null default now()
);

alter table exchange_rate enable row level security;

-- Public reference data: any signed-in user may read it, nobody may write it
-- from the client (the Edge Function uses the service role).
drop policy if exists exchange_rate_read on exchange_rate;
create policy exchange_rate_read on exchange_rate
  for select to authenticated using (true);

-- Null on every existing row and on every new ZAR expense. Null means "this
-- was always Rand", not "we lost the currency".
alter table expense add column if not exists original_currency text;
alter table expense add column if not exists original_amount_cents bigint;
alter table expense add column if not exists fx_rate_to_zar numeric;

-- Either a full conversion record or none of it — never a half-populated row
-- that the UI would have to guess about.
alter table expense drop constraint if exists expense_currency_complete;
alter table expense add constraint expense_currency_complete check (
  (original_currency is null and original_amount_cents is null and fx_rate_to_zar is null)
  or (original_currency is not null and original_amount_cents is not null and fx_rate_to_zar is not null)
);

alter table expense drop constraint if exists expense_fx_rate_positive;
alter table expense add constraint expense_fx_rate_positive check (
  fx_rate_to_zar is null or fx_rate_to_zar > 0
);

alter table expense drop constraint if exists expense_original_amount_positive;
alter table expense add constraint expense_original_amount_positive check (
  original_amount_cents is null or original_amount_cents > 0
);

-- Sticky currency + quick-pick ordering, per user rather than per device so a
-- trip set up on the phone carries to the laptop (Josh's call).
alter table profile add column if not exists recent_currencies text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Rate refresh: daily via pg_cron -> the fetch-exchange-rates Edge Function,
-- the same shape Phase 4 uses for recurring bills and Phase 9 for push.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create or replace function refresh_exchange_rates() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  -- Reuses the shared secret Phase 9 already stored; both functions
  -- authenticate pg_net callers the same way.
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'fetch_rates_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'send_push_shared_secret';
  if v_url is null or v_secret is null then
    raise notice 'refresh_exchange_rates: vault secrets missing, skipping';
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-shared-secret', v_secret
    ),
    body := '{}'::jsonb
  );
end $$;

revoke execute on function refresh_exchange_rates() from public;

-- 03:10 UTC daily — after the provider's daily update, and clear of the
-- recurring-bill job so the two don't contend.
select cron.unschedule('refresh-exchange-rates')
  where exists (select 1 from cron.job where jobname = 'refresh-exchange-rates');
select cron.schedule('refresh-exchange-rates', '10 3 * * *', $$select refresh_exchange_rates()$$);

-- ---------------------------------------------------------------------------
-- Teach the expense write RPCs about the conversion columns. Everything else
-- about them is unchanged; `amount_cents` is still what the client computed
-- and still what the splits were derived from.
-- ---------------------------------------------------------------------------
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
    split_method, note, recurring_id, created_by, updated_by, client_id,
    original_currency, original_amount_cents, fx_rate_to_zar
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

grant execute on function create_expense(jsonb, jsonb, jsonb) to authenticated;
grant execute on function update_expense(uuid, jsonb, jsonb, jsonb) to authenticated;
