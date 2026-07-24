-- ============================================================================
-- Splitty admin-identity recovery (Phase 8 follow-up).
--
-- The admin's guest identity (id + token) is cached in localStorage when they
-- create a bill. If that's lost (another device, PWA eviction, cleared
-- storage), they'd come back to their own split as an unrecognized guest. But
-- the admin is the AUTHENTICATED creator (split_bill.created_by), so we can
-- hand their admin guest identity back to them server-side, no localStorage
-- needed. Only the creator can call this (auth.uid() must match created_by).
-- ============================================================================

create or replace function splitty_admin_identity(p_share_code text)
returns table (guest_id uuid, guest_token uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select g.id, s.token
  from split_bill b
  join split_guest g on g.bill_id = b.id and g.is_admin = true
  join split_guest_secret s on s.guest_id = g.id
  where b.share_code = p_share_code and b.created_by = auth.uid()
  limit 1;
end $$;

revoke execute on function splitty_admin_identity(text) from public;
-- Also strip the default anon grant — this is an authenticated-only recovery
-- (anon can never be a creator, so it's harmless, but keep it tidy per ADR-0013).
revoke execute on function splitty_admin_identity(text) from anon;
grant execute on function splitty_admin_identity(text) to authenticated;
