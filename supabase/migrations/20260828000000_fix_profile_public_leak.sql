-- ============================================================================
-- SECURITY FIX (Phase 6 re-audit, 2026-08-28) — profile_public leaked every
-- profile in the system, to anyone.
--
-- WHAT WAS WRONG
-- --------------
-- `profile_public` was created as a plain view owned by `postgres` with
-- security_invoker = false. A view in that mode executes with its OWNER's
-- rights, so RLS on the underlying `profile` table never applied to it. On top
-- of that, the default grants gave anon and authenticated full INSERT/UPDATE/
-- DELETE/TRUNCATE on the view.
--
-- Demonstrated against production before this fix:
--   • as `authenticated` with a JWT owning nothing:
--       select count(*) from profile         ->  0   (RLS correct)
--       select count(*) from profile_public  ->  9   (every profile)
--   • as `anon` (unauthenticated, and the anon key ships in the client bundle):
--       select count(*) from profile_public  ->  9
--   • as `authenticated`, `update profile_public set display_name = ...`
--     against another user's row SUCCEEDED — RLS bypassed.
--
-- So: display_name and avatar_url of every user were readable by the public
-- internet, any signed-in user could rename anyone, and any profile that had
-- `salary_visible = true` would have had its salary exposed to anon too. (No
-- salary was actually exposed at the time of the fix because no user had opted
-- in yet — but the mechanism was live, and `salary_visible` means "my Tally
-- may see it", never "the internet may see it".)
--
-- WHY NOT JUST security_invoker = true
-- ------------------------------------
-- Two reasons, both of which would have made things worse:
--   1. RLS on `profile` is `user_id = auth.uid()`, so the view would return
--      only your OWN row — breaking member-name hydration in listMembers().
--   2. Fixing that with a co-member RLS policy on `profile` would grant
--      co-members SELECT on the BASE table, and RLS is row-level, not
--      column-level — so they could read `monthly_salary_cents` raw, straight
--      past the salary_visible gate. That would trade one leak for a worse one
--      (ADR-0010: salaries never leave the database).
--
-- THE FIX
-- -------
-- Keep the view definer-rights (so the salary CASE gate still works) but make
-- the view itself enforce the boundary in its WHERE clause: you may see your
-- own row, plus rows of people you actually share a Tally with. auth.uid() is
-- NULL for anon, so anon matches nothing. Then strip the write grants.
-- ============================================================================

create or replace view profile_public as
select
  p.user_id,
  p.display_name,
  p.avatar_url,
  -- Unchanged: salary is only ever exposed when the owner opted in.
  case when p.salary_visible then p.monthly_salary_cents else null end
    as monthly_salary_cents
from profile p
where
  -- yourself
  p.user_id = auth.uid()
  -- or someone you share an active Tally membership with
  or exists (
    select 1
    from group_member me
    join group_member them on them.group_id = me.group_id
    where me.user_id = auth.uid()
      and me.deleted_at is null
      and me.status = 'active'
      and them.user_id = p.user_id
      and them.deleted_at is null
      and them.status <> 'left'
  );

-- This view is a read projection. Nothing should ever write through it — the
-- default grants that allowed it were the second half of the vulnerability.
revoke all on public.profile_public from anon;
revoke all on public.profile_public from authenticated;
grant select on public.profile_public to authenticated;
