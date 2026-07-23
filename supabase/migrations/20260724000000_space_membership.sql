-- ============================================================================
-- Space membership management (Josh, 2026-07-24)
--   * remove_group_member  — owner removes another member (not the owner)
--   * leave_group          — a non-owner member leaves; the owner cannot leave
--                            (they delete the space instead)
--   * redeem_invite        — reactivates a previously removed/left member so
--                            re-inviting works
-- Removal/leaving requires the member's net balance to be ZERO (scope §6.3) so
-- the ledger stays consistent — you can't drop someone who still owes / is owed.
-- All SECURITY DEFINER (they act on group_member rows the caller may not own).
-- ============================================================================

-- Net balance of a member in cents: paid − charged + settled-out − settled-in.
create or replace function _member_net_cents(p_member_id uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(ep.paid_cents) from expense_payer ep
              join expense e on e.id = ep.expense_id
              where ep.member_id = p_member_id and e.deleted_at is null), 0)
  - coalesce((select sum(es.share_cents) from expense_split es
              join expense e on e.id = es.expense_id
              where es.member_id = p_member_id and e.deleted_at is null), 0)
  + coalesce((select sum(amount_cents) from settlement
              where from_member_id = p_member_id and deleted_at is null), 0)
  - coalesce((select sum(amount_cents) from settlement
              where to_member_id = p_member_id and deleted_at is null), 0);
$$;

-- Owner removes a member. Returns the removed member's user_id (null for a
-- placeholder) so the caller can trigger the "you were removed" email.
create or replace function remove_group_member(p_member_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  select * into m from group_member where id = p_member_id and deleted_at is null;
  if not found then
    raise exception 'Member not found';
  end if;
  if not exists (
    select 1 from group_member gm
    where gm.group_id = m.group_id and gm.user_id = auth.uid()
      and gm.role = 'owner' and gm.deleted_at is null
  ) then
    raise exception 'Only the space owner can remove members';
  end if;
  if m.role = 'owner' then
    raise exception 'The space owner cannot be removed';
  end if;
  if _member_net_cents(p_member_id) <> 0 then
    raise exception 'Settle up with this person before removing them';
  end if;

  update group_member
    set status = 'left', deleted_at = now(), updated_by = auth.uid()
    where id = p_member_id;

  return m.user_id;
end $$;

-- A non-owner leaves the space. The owner cannot leave (must delete instead).
create or replace function leave_group(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  m record;
begin
  select * into m from group_member
    where group_id = p_group_id and user_id = auth.uid() and deleted_at is null;
  if not found then
    raise exception 'You are not a member of this space';
  end if;
  if m.role = 'owner' then
    raise exception 'You created this space — delete it instead of leaving';
  end if;
  if _member_net_cents(m.id) <> 0 then
    raise exception 'Settle up before leaving this space';
  end if;

  update group_member
    set status = 'left', deleted_at = now(), updated_by = auth.uid()
    where id = m.id;
end $$;

-- Reinvite support: redeem_invite reactivates a removed/left membership instead
-- of creating a duplicate row.
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

revoke execute on function _member_net_cents(uuid) from public;
revoke execute on function remove_group_member(uuid) from public;
revoke execute on function leave_group(uuid) from public;
grant execute on function remove_group_member(uuid) to authenticated;
grant execute on function leave_group(uuid) to authenticated;
grant execute on function redeem_invite(text) to authenticated;
