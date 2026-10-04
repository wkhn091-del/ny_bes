-- SpaceHub — Script 2 / Module A (CRO): "customers who booked this also booked" signal.
-- Aggregated only: a pair is returned only when at least p_min_users distinct customers booked both spaces,
-- so no individual's booking history can be inferred from a recommendation.

create or replace function public.space_co_bookings(p_space_id text, p_days integer default 180, p_min_users integer default 3)
returns table (space_id text, customers integer)
language sql
stable
security definer
set search_path = ''
as $$
  with buyers as (
    select distinct b.user_id
    from public.bookings b
    where b.space_id = p_space_id
      and b.user_id is not null
      and b.status in ('active', 'released')
      and b.confirmed_at >= now() - make_interval(days => greatest(30, least(p_days, 365)))
  )
  select o.space_id, count(distinct o.user_id)::int as customers
  from public.bookings o
  join buyers on buyers.user_id = o.user_id
  join public.spaces_mirror s on s.id = o.space_id and s.active
  where o.space_id <> p_space_id
    and o.status in ('active', 'released')
    and o.confirmed_at >= now() - make_interval(days => greatest(30, least(p_days, 365)))
  group by o.space_id
  having count(distinct o.user_id) >= greatest(3, p_min_users)
  order by customers desc
  limit 6;
$$;

revoke execute on function public.space_co_bookings(text, integer, integer) from public, anon, authenticated;
grant execute on function public.space_co_bookings(text, integer, integer) to service_role;
