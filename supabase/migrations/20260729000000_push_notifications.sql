-- ============================================================================
-- Push notifications (Phase 9, ADR-0014).
--
-- Web Push via VAPID. Postgres triggers detect the four (now five) events we
-- notify on and POST them to the `send-push` Edge Function via pg_net; that
-- function does the actual VAPID-signed Web Push send.
--
-- Notified events (deliberately narrow — Josh, 2026-07-25):
--   1. expense_added         (activity)      -> everyone but the actor
--   2. recurring_generated   (activity)      -> everyone (nobody "did" it)
--   3. settled               (activity)      -> the creditor only
--   4. shopping item added   (shopping_item) -> everyone but the actor
--   5. shopping item checked (shopping_item) -> everyone but the actor
--
-- 4 & 5 are rate-limited by a "quiet window" (see push_throttle) so a bulk
-- shop-planning session sends one notification, not one per item.
--
-- Every title is prefaced "Tally-ho! ". Per-recipient bodies (each person sees
-- THEIR share) are supported by sending a `messages` array, one entry per user.
-- ============================================================================

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- One row per subscribed device (a user can have several: phone, desktop…).
-- ---------------------------------------------------------------------------
create table push_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscription_user_idx on push_subscription (user_id);

alter table push_subscription enable row level security;

-- Self-service: the client manages only its own rows via PostgREST + RLS.
-- The SECURITY DEFINER trigger functions below and the service-role Edge
-- Function are the only things that ever read across users.
create policy push_subscription_owner on push_subscription for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Quiet window for the chatty shopping-list events. One row per
-- (actor, group, kind); we only notify if the last send was long enough ago.
-- ---------------------------------------------------------------------------
create table push_throttle (
  actor_id uuid not null,
  group_id uuid not null,
  kind text not null,
  last_sent_at timestamptz not null default now(),
  primary key (actor_id, group_id, kind)
);

alter table push_throttle enable row level security;
-- No policies: only the SECURITY DEFINER trigger functions touch this.

-- How long to stay quiet after a shopping-list notification.
create or replace function _push_quiet_window() returns interval
language sql immutable as $$ select interval '10 minutes' $$;

-- True if we may notify now (and records the send). False if inside the
-- quiet window.
create or replace function _push_throttle_ok(p_actor uuid, p_group uuid, p_kind text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_last timestamptz;
begin
  select last_sent_at into v_last
    from push_throttle
    where actor_id = p_actor and group_id = p_group and kind = p_kind;

  if v_last is not null and v_last > now() - _push_quiet_window() then
    return false;
  end if;

  insert into push_throttle (actor_id, group_id, kind)
  values (p_actor, p_group, p_kind)
  on conflict (actor_id, group_id, kind)
    do update set last_sent_at = now();
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Shared sender: POSTs a `messages` array to the send-push Edge Function.
-- URL + shared secret live in Supabase Vault, never in committed SQL.
-- ---------------------------------------------------------------------------
create or replace function _push_send(p_messages jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_secret text;
begin
  if p_messages is null or jsonb_array_length(p_messages) = 0 then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'send_push_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'send_push_shared_secret';

  -- Not configured yet (e.g. before the function is deployed) — do nothing
  -- rather than break the write that triggered us.
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-shared-secret', v_secret
    ),
    body := jsonb_build_object('messages', p_messages)
  );
end $$;

-- Display name for a user, falling back to "Someone".
create or replace function _push_actor_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(display_name), ''), 'Someone')
  from profile where user_id = p_user
$$;

-- Rand formatting to match the app's fmt() — "R1 234,56".
create or replace function _push_fmt(p_cents bigint) returns text
language plpgsql immutable as $$
declare
  v_neg boolean := p_cents < 0;
  v_abs bigint := abs(p_cents);
  v_rand text := to_char(v_abs / 100, 'FM999G999G999');
begin
  -- to_char's group separator is locale-dependent; force a space like fmt().
  v_rand := replace(replace(v_rand, ',', ' '), '.', ' ');
  return (case when v_neg then '-' else '' end)
    || 'R' || v_rand || ',' || lpad((v_abs % 100)::text, 2, '0');
end $$;

-- ---------------------------------------------------------------------------
-- Trigger 1: activity-table events (expense_added, recurring_generated,
-- settled). Every other activity_type is ignored — those never push.
-- ---------------------------------------------------------------------------
create or replace function activity_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_msgs jsonb := '[]'::jsonb;
  v_actor text;
  v_exp record;
  v_set record;
  v_row record;
  v_title text;
  v_url text;
begin
  if new.type not in ('expense_added', 'recurring_generated', 'settled') then
    return new;
  end if;

  if new.type in ('expense_added', 'recurring_generated') then
    select e.id, e.description, e.amount_cents into v_exp
      from expense e where e.id = new.target_id and e.deleted_at is null;
    if not found then return new; end if;

    v_url := '/?expense=' || v_exp.id;

    if new.type = 'expense_added' then
      v_actor := _push_actor_name(new.actor_id);
      v_title := 'Tally-ho! ' || v_actor || ' added an expense';
    else
      -- Automatic: nobody "did" it live, so nobody is excluded below.
      v_title := 'Tally-ho! ' || v_exp.description || ' was added';
    end if;

    -- One message per recipient so each sees their OWN share.
    for v_row in
      select gm.user_id, coalesce(es.share_cents, 0) as share_cents
        from group_member gm
        left join expense_split es
          on es.member_id = gm.id and es.expense_id = v_exp.id
        where gm.group_id = new.group_id
          and gm.user_id is not null
          and gm.status = 'active' and gm.deleted_at is null
          and (new.type = 'recurring_generated' or gm.user_id <> new.actor_id)
    loop
      v_msgs := v_msgs || jsonb_build_object(
        'user_id', v_row.user_id,
        'title', v_title,
        'body', case
          when new.type = 'recurring_generated'
            then _push_fmt(v_exp.amount_cents) || ' split automatically — your share '
                 || _push_fmt(v_row.share_cents)
          else '"' || v_exp.description || '" — your share ' || _push_fmt(v_row.share_cents)
        end,
        'url', v_url
      );
    end loop;

  else -- 'settled': tell the creditor only; the payer already knows.
    select s.amount_cents, gm.user_id as to_user
      into v_set
      from settlement s
      join group_member gm on gm.id = s.to_member_id
      where s.id = new.target_id and s.deleted_at is null;
    if not found or v_set.to_user is null or v_set.to_user = new.actor_id then
      return new;
    end if;

    v_actor := _push_actor_name(new.actor_id);
    v_msgs := v_msgs || jsonb_build_object(
      'user_id', v_set.to_user,
      'title', 'Tally-ho! ' || v_actor || ' paid you',
      'body', _push_fmt(v_set.amount_cents) || ' recorded',
      'url', '/'
    );
  end if;

  perform _push_send(v_msgs);
  return new;
end $$;

create trigger activity_push_trigger after insert on activity
  for each row execute function activity_push();

-- ---------------------------------------------------------------------------
-- Triggers 2 & 3: shopping list added / crossed off. Both quiet-windowed.
-- The shopping list was never logged to `activity` (that table is the
-- expense/settlement audit trail), so these read shopping_item directly.
-- ---------------------------------------------------------------------------
create or replace function _push_shopping(
  p_group uuid, p_actor uuid, p_kind text, p_item text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_msgs jsonb := '[]'::jsonb;
  v_count int;
  v_title text;
  v_body text;
  v_row record;
begin
  if p_actor is null then return; end if;
  if not _push_throttle_ok(p_actor, p_group, p_kind) then return; end if;

  select count(*) into v_count from shopping_item
    where group_id = p_group and deleted_at is null and checked = false;

  v_title := 'Tally-ho! ' || _push_actor_name(p_actor)
    || case when p_kind = 'list_add' then ' added to the list'
            else ' crossed something off' end;
  v_body := '"' || p_item || '" — ' || v_count || ' item'
    || (case when v_count = 1 then '' else 's' end) || ' still to buy';

  for v_row in
    select gm.user_id from group_member gm
      where gm.group_id = p_group and gm.user_id is not null
        and gm.user_id <> p_actor
        and gm.status = 'active' and gm.deleted_at is null
  loop
    v_msgs := v_msgs || jsonb_build_object(
      'user_id', v_row.user_id, 'title', v_title, 'body', v_body, 'url', '/?tab=list'
    );
  end loop;

  perform _push_send(v_msgs);
end $$;

create or replace function shopping_item_added_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null or new.checked then return new; end if;
  perform _push_shopping(new.group_id, new.added_by, 'list_add', new.name);
  return new;
end $$;

create trigger shopping_item_added_push_trigger after insert on shopping_item
  for each row execute function shopping_item_added_push();

-- Crossed off = checked flipped false -> true, on a live row.
create or replace function shopping_item_checked_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() first: it reads the caller's JWT claim and is the most reliable
  -- "who did this" for a PostgREST update (setShoppingItemChecked doesn't
  -- always stamp updated_by). Falls back to the row's own metadata.
  if new.checked and not old.checked and new.deleted_at is null then
    perform _push_shopping(
      new.group_id, coalesce(auth.uid(), new.updated_by, new.added_by), 'list_check', new.name
    );
  end if;
  return new;
end $$;

create trigger shopping_item_checked_push_trigger after update on shopping_item
  for each row execute function shopping_item_checked_push();

-- ---------------------------------------------------------------------------
-- Grants: all of the above run from triggers as the definer; nothing here is
-- client-callable, so no execute grants to anon/authenticated.
-- ---------------------------------------------------------------------------
revoke execute on function _push_send(jsonb) from public;
revoke execute on function _push_throttle_ok(uuid, uuid, text) from public;
revoke execute on function _push_shopping(uuid, uuid, text, text) from public;
revoke execute on function _push_actor_name(uuid) from public;
