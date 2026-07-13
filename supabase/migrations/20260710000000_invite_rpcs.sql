-- ============================================================================
-- Invite redemption RPCs (epic E3).
--
-- Why SECURITY DEFINER: the joining user is NOT yet a member of the group, so
-- RLS (correctly) blocks them from touching group_member rows. Knowing the
-- invite code IS the authorization — exactly like a Slack/WhatsApp invite
-- link. Both functions validate the code and expiry themselves and only
-- perform the narrow action the code permits.
-- ============================================================================

-- Preview: lets the join screen show "Josh invited you to Our household"
-- before the user signs in (granted to anon on purpose — the code is the
-- capability; it exposes only group name + inviter display name).
create or replace function invite_preview(p_code text)
returns table (group_name text, inviter_name text)
language sql stable security definer set search_path = public as $$
  select g.name, coalesce(nullif(p.display_name, ''), 'Someone')
  from invite i
  join "group" g on g.id = i.group_id
  join profile p on p.user_id = i.created_by
  where i.code = upper(trim(p_code))
    and g.deleted_at is null
    and (i.expires_at is null or i.expires_at > now());
$$;

-- Redeem: adds the signed-in user to the invite's group. If the invite was
-- created for a placeholder member ("Sam"), that member row is upgraded so
-- their expense history transfers to the real account. Idempotent: an
-- existing member just gets the group back.
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

revoke execute on function invite_preview(text) from public;
revoke execute on function redeem_invite(text) from public;
grant execute on function invite_preview(text) to anon, authenticated;
grant execute on function redeem_invite(text) to authenticated;
