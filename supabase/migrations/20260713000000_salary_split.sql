-- ============================================================================
-- Phase 3: privacy-preserving salary-proportional shares (ADR-0010).
--
-- SECURITY DEFINER so private salaries never leave the database — the caller
-- (who must be an active member of the group) receives only the computed
-- share_cents. The algorithm mirrors lib/domain/split.ts splitWeighted():
-- floor(total * salary / sum), remainder cents to the largest fractional
-- parts, ties broken by input order. Keep the two implementations in lockstep.
-- ============================================================================

create or replace function salary_split_shares(
  p_group_id uuid,
  p_total bigint,
  p_member_ids uuid[]
) returns table (member_id uuid, share_cents bigint, has_salary boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  n_input int := coalesce(array_length(p_member_ids, 1), 0);
  n_found int;
  n_missing int;
  sum_sal numeric;
begin
  if auth.uid() is null or not exists (
    select 1 from group_member gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
      and gm.status = 'active' and gm.deleted_at is null
  ) then
    raise exception 'not a member of this group';
  end if;
  if p_total is null or p_total < 0 then
    raise exception 'total must be a non-negative amount in cents';
  end if;

  select count(*),
         count(*) filter (where coalesce(p.monthly_salary_cents, 0) <= 0),
         sum(coalesce(p.monthly_salary_cents, 0))
    into n_found, n_missing, sum_sal
  from unnest(p_member_ids) as mid
  join group_member gm on gm.id = mid
    and gm.group_id = p_group_id and gm.deleted_at is null
  left join profile p on p.user_id = gm.user_id;

  if n_found <> n_input then
    raise exception 'unknown member in list';
  end if;

  -- Any participant without a salary (incl. placeholders): signal fallback.
  if n_missing > 0 or sum_sal is null or sum_sal <= 0 then
    return query
      select ord.mid, null::bigint, false
      from unnest(p_member_ids) with ordinality as ord(mid, i)
      order by ord.i;
    return;
  end if;

  return query
  with mem as (
    select ord.i, ord.mid, coalesce(p.monthly_salary_cents, 0)::numeric as sal
    from unnest(p_member_ids) with ordinality as ord(mid, i)
    join group_member gm on gm.id = ord.mid and gm.group_id = p_group_id
    left join profile p on p.user_id = gm.user_id
  ),
  floors as (
    select m.i, m.mid,
           floor((p_total * m.sal) / sum_sal)::bigint as fl,
           (p_total * m.sal) / sum_sal - floor((p_total * m.sal) / sum_sal) as frac
    from mem m
  ),
  ranked as (
    select f.i, f.mid, f.fl,
           row_number() over (order by f.frac desc, f.i asc) as rk,
           (select p_total - sum(x.fl) from floors x) as rem
    from floors f
  )
  select r.mid, r.fl + case when r.rk <= r.rem then 1 else 0 end, true
  from ranked r
  order by r.i;
end $$;

revoke execute on function salary_split_shares(uuid, bigint, uuid[]) from public;
grant execute on function salary_split_shares(uuid, bigint, uuid[]) to authenticated;
