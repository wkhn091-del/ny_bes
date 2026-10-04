-- SpaceHub — Module B: customer portal
-- Billing defaults, favorites, loyalty points (FIFO lots with 12-month expiry), step-up grants,
-- session listing, and account-deletion support. Run after 0001 and 0002.

-- ─────────────────────────────────────────────────────────────
-- Profiles: saved billing defaults. All profile writes go through server code (step-up for
-- phone / billing), so the direct column grant from 0001 is withdrawn.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column company_name text check (char_length(company_name) <= 120),
  add column company_tax_id text check (company_tax_id is null or company_tax_id ~ '^[0-9]{9}$');

drop policy if exists profiles_update_own on public.profiles;
revoke update on public.profiles from authenticated;

-- ─────────────────────────────────────────────────────────────
-- Bookings: points redemption + anonymisation on account deletion.
-- A points redemption is a discount like the others (discount_source = 'points'), so the
-- total_consistent constraint keeps holding without changes.
-- ─────────────────────────────────────────────────────────────
alter table public.bookings drop constraint if exists bookings_discount_source_check;
alter table public.bookings
  add constraint bookings_discount_source_check check (discount_source in ('auto', 'coupon', 'points'));

alter table public.bookings
  add column points_redeemed integer not null default 0 check (points_redeemed >= 0 and points_redeemed % 100 = 0),
  add constraint points_match_discount check (
    (points_redeemed = 0 and discount_source is distinct from 'points')
    or (points_redeemed > 0 and discount_source = 'points' and discount_amount = (points_redeemed / 100) * 500)
  );

-- Deleted accounts keep their financial rows (tax record retention) without personal data.
alter table public.bookings drop constraint bookings_user_id_fkey;
alter table public.bookings alter column user_id drop not null;
alter table public.bookings
  add constraint bookings_user_id_fkey foreign key (user_id) references public.profiles (id) on delete set null;
alter table public.bookings alter column customer_email drop not null;

-- ─────────────────────────────────────────────────────────────
-- Favorites
-- ─────────────────────────────────────────────────────────────
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  space_id text not null references public.spaces_mirror (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, space_id)
);

create index favorites_user_created_idx on public.favorites (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Loyalty ledger
-- earn    : a lot (+points) with `remaining` and `expires_at`; consumed FIFO by expiry date
-- redeem  : −points at hold creation; `allocations` records which lots were drawn from
-- restore : +points when a booking that used points is cancelled/expired; refills the same lots
-- expire  : −remaining of a lot that reached its expiry date
-- Balance = Σ remaining of unexpired earn lots.
-- ─────────────────────────────────────────────────────────────
create type public.loyalty_kind as enum ('earn', 'redeem', 'restore', 'expire');

create table public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  kind public.loyalty_kind not null,
  points integer not null check (points <> 0),
  remaining integer check (remaining >= 0),
  expires_at timestamptz,
  lot_id uuid references public.loyalty_ledger (id) on delete cascade,
  allocations jsonb,
  expiry_reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint earn_shape check (
    (kind = 'earn' and points > 0 and remaining is not null and remaining <= points and expires_at is not null)
    or (kind <> 'earn' and remaining is null)
  ),
  constraint sign_by_kind check (
    (kind in ('earn', 'restore') and points > 0) or (kind in ('redeem', 'expire') and points < 0)
  )
);

create unique index loyalty_one_entry_per_booking on public.loyalty_ledger (booking_id, kind)
  where kind in ('earn', 'redeem', 'restore');
create index loyalty_open_lots_idx on public.loyalty_ledger (user_id, expires_at)
  where kind = 'earn' and remaining > 0;
create index loyalty_user_created_idx on public.loyalty_ledger (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Step-up grants: a 10-minute window for sensitive changes after re-verifying the email code.
-- ─────────────────────────────────────────────────────────────
create table public.step_up_grants (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- RLS: customers read their own rows; every write goes through server code (service role).
-- ─────────────────────────────────────────────────────────────
alter table public.favorites enable row level security;
alter table public.loyalty_ledger enable row level security;
alter table public.step_up_grants enable row level security;

create policy favorites_select_own on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));

create policy loyalty_select_own on public.loyalty_ledger
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.favorites, public.loyalty_ledger from anon, authenticated;
revoke all on public.step_up_grants from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- create_booking_hold v2: adds atomic points redemption.
-- ─────────────────────────────────────────────────────────────
drop function public.create_booking_hold(uuid, text, timestamptz, timestamptz, integer, boolean, integer, integer, text, integer, integer, integer, numeric, uuid, text, text, text, text, jsonb, text, integer);

create or replace function public.create_booking_hold(
  p_user_id uuid,
  p_space_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_seats integer,
  p_is_day_pass boolean,
  p_base_amount integer,
  p_discount_amount integer,
  p_discount_source text,
  p_addons_amount integer,
  p_total_amount integer,
  p_vat_amount integer,
  p_vat_rate numeric,
  p_coupon_id uuid,
  p_company_name text,
  p_company_tax_id text,
  p_customer_email text,
  p_customer_name text,
  p_addons jsonb,
  p_public_code text,
  p_hold_minutes integer default 15,
  p_points_redeem integer default 0
)
returns table (booking_id uuid, public_code text, hold_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_space public.spaces_mirror%rowtype;
  v_branch_name text;
  v_range tstzrange;
  v_booking_id uuid;
  v_expires timestamptz;
  v_need integer;
  v_take integer;
  v_alloc jsonb := '[]'::jsonb;
  v_lot record;
begin
  if coalesce(p_points_redeem, 0) < 0
     or (p_points_redeem > 0 and (
          p_discount_source is distinct from 'points'
          or p_points_redeem % 100 <> 0
          or p_discount_amount <> (p_points_redeem / 100) * 500))
     or (coalesce(p_points_redeem, 0) = 0 and p_discount_source = 'points') then
    raise exception 'POINTS_INVALID' using errcode = 'P0001';
  end if;

  -- Serialises every hold attempt for this space (pool or exclusive).
  select * into v_space from public.spaces_mirror s where s.id = p_space_id and s.active for update;
  if not found then
    raise exception 'SPACE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select b.name into v_branch_name from public.branches_mirror b where b.id = v_space.branch_id;
  perform public.validate_booking_window(v_space.branch_id, p_start, p_end);

  if p_is_day_pass and v_space.type <> 'privateOffice' then
    raise exception 'DAY_PASS_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  update public.bookings b
     set status = 'expired'
   where b.space_id = p_space_id and b.status = 'pending_payment' and b.hold_expires_at < now();

  v_range := tstzrange(p_start, p_end, '[)');

  if v_space.type = 'hotDesk' then
    if p_seats < 1 or p_seats > v_space.pool_size then
      raise exception 'INVALID_SEATS' using errcode = 'P0001';
    end if;
    if public.peak_pool_usage(p_space_id, p_start, p_end) + p_seats > v_space.pool_size then
      raise exception 'CAPACITY_EXCEEDED' using errcode = 'P0001';
    end if;
  elsif p_seats <> 1 then
    raise exception 'INVALID_SEATS' using errcode = 'P0001';
  end if;

  if p_coupon_id is not null and not exists (
    select 1 from public.coupons c
    where c.id = p_coupon_id and c.active
      and (c.valid_from is null or c.valid_from <= now())
      and (c.valid_until is null or c.valid_until > now())
      and (c.max_uses is null or c.used_count < c.max_uses)
  ) then
    raise exception 'COUPON_INVALID' using errcode = 'P0001';
  end if;

  v_expires := now() + make_interval(mins => greatest(5, least(p_hold_minutes, 60)));

  begin
    insert into public.bookings (
      public_code, user_id, space_id, branch_id, space_type, space_name, branch_name, during, seats,
      is_day_pass, status, hold_expires_at, base_amount, discount_amount, discount_source, addons_amount,
      total_amount, vat_amount, vat_rate, coupon_id, company_name, company_tax_id, customer_email, customer_name,
      points_redeemed
    ) values (
      p_public_code, p_user_id, v_space.id, v_space.branch_id, v_space.type, v_space.name, v_branch_name, v_range,
      p_seats, p_is_day_pass, 'pending_payment', v_expires, p_base_amount, p_discount_amount, p_discount_source,
      p_addons_amount, p_total_amount, p_vat_amount, p_vat_rate, p_coupon_id, p_company_name, p_company_tax_id,
      p_customer_email, p_customer_name, coalesce(p_points_redeem, 0)
    )
    returning id into v_booking_id;
  exception
    when exclusion_violation then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into public.booking_addons (booking_id, addon_id, name, pricing_mode, unit_price, quantity, line_total)
  select v_booking_id, x.addon_id, x.name, x.pricing_mode, x.unit_price, x.quantity, x.line_total
  from jsonb_to_recordset(coalesce(p_addons, '[]'::jsonb))
    as x(addon_id text, name text, pricing_mode text, unit_price integer, quantity numeric, line_total integer);

  if p_points_redeem > 0 then
    -- One redemption at a time per customer; lots are drawn oldest-expiry first.
    perform pg_advisory_xact_lock(hashtextextended('loyalty:' || p_user_id::text, 0));
    v_need := p_points_redeem;
    for v_lot in
      select l.id, l.remaining
      from public.loyalty_ledger l
      where l.user_id = p_user_id and l.kind = 'earn' and l.remaining > 0 and l.expires_at > now()
      order by l.expires_at, l.created_at
      for update
    loop
      exit when v_need = 0;
      v_take := least(v_lot.remaining, v_need);
      update public.loyalty_ledger set remaining = remaining - v_take where id = v_lot.id;
      v_alloc := v_alloc || jsonb_build_array(jsonb_build_object('lot', v_lot.id, 'points', v_take));
      v_need := v_need - v_take;
    end loop;
    if v_need > 0 then
      raise exception 'POINTS_INSUFFICIENT' using errcode = 'P0001';
    end if;
    insert into public.loyalty_ledger (user_id, booking_id, kind, points, allocations)
    values (p_user_id, v_booking_id, 'redeem', -p_points_redeem, v_alloc);
  end if;

  return query select v_booking_id, p_public_code, v_expires;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- confirm_booking_payment v2: a lapsed hold whose points were already returned is never
-- re-activated (that would let the points be spent twice) — it is refunded as a conflict.
-- ─────────────────────────────────────────────────────────────
create or replace function public.confirm_booking_payment(p_booking_id uuid, p_session_id text, p_payment_intent text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id text;
  v_booking public.bookings%rowtype;
  v_pool integer;
begin
  select b.space_id into v_space_id from public.bookings b where b.id = p_booking_id;
  if v_space_id is null then
    return 'not_found';
  end if;

  select s.pool_size into v_pool from public.spaces_mirror s where s.id = v_space_id for update;
  select * into v_booking from public.bookings b where b.id = p_booking_id for update;

  if v_booking.stripe_checkout_session_id is distinct from p_session_id then
    return 'not_found';
  end if;
  if v_booking.status = 'active' then
    return 'already';
  end if;
  if v_booking.status in ('cancelled', 'released') then
    return 'conflict';
  end if;
  if v_booking.status = 'expired' and v_booking.points_redeemed > 0 then
    return 'conflict';
  end if;

  if v_booking.status = 'expired' or v_booking.hold_expires_at < now() then
    if v_booking.space_type = 'hotDesk' then
      if public.peak_pool_usage(v_booking.space_id, lower(v_booking.during), upper(v_booking.during), v_booking.id)
         + v_booking.seats > v_pool then
        update public.bookings set status = 'expired' where id = v_booking.id;
        return 'conflict';
      end if;
    elsif exists (
      select 1 from public.bookings o
      where o.space_id = v_booking.space_id and o.id <> v_booking.id
        and o.during && v_booking.during
        and (o.status = 'active' or (o.status = 'pending_payment' and o.hold_expires_at > now()))
    ) then
      update public.bookings set status = 'expired' where id = v_booking.id;
      return 'conflict';
    end if;
  end if;

  begin
    update public.bookings
       set status = 'active',
           confirmed_at = now(),
           hold_expires_at = null,
           stripe_payment_intent_id = p_payment_intent
     where id = v_booking.id;
  exception
    when exclusion_violation then
      update public.bookings set status = 'expired' where id = v_booking.id;
      return 'conflict';
  end;

  if v_booking.coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = v_booking.coupon_id;
    insert into public.coupon_redemptions (coupon_id, user_id, booking_id)
    values (v_booking.coupon_id, v_booking.user_id, v_booking.id)
    on conflict do nothing;
  end if;

  return 'confirmed';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Points come back when a booking that used them is cancelled (always refunded) or its hold
-- expires. A release (no refund) keeps them spent. Runs for every code path that changes status.
-- ─────────────────────────────────────────────────────────────
create or replace function public.restore_points_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redeem public.loyalty_ledger%rowtype;
  v_restored uuid;
  v_alloc jsonb;
begin
  if new.points_redeemed = 0
     or new.status not in ('cancelled', 'expired')
     or old.status not in ('pending_payment', 'active') then
    return new;
  end if;

  select * into v_redeem from public.loyalty_ledger l where l.booking_id = new.id and l.kind = 'redeem';
  if not found then
    return new;
  end if;

  insert into public.loyalty_ledger (user_id, booking_id, kind, points)
  values (v_redeem.user_id, new.id, 'restore', -v_redeem.points)
  on conflict (booking_id, kind) where kind in ('earn', 'redeem', 'restore') do nothing
  returning id into v_restored;

  if v_restored is not null then
    for v_alloc in select * from jsonb_array_elements(coalesce(v_redeem.allocations, '[]'::jsonb))
    loop
      update public.loyalty_ledger
         set remaining = remaining + (v_alloc ->> 'points')::int
       where id = (v_alloc ->> 'lot')::uuid and kind = 'earn';
    end loop;
  end if;
  return new;
end;
$$;

create trigger bookings_restore_points
  after update of status on public.bookings
  for each row execute function public.restore_points_on_cancel();

-- ─────────────────────────────────────────────────────────────
-- Earning: 1 point per ₪1 paid on the space price (add-ons excluded), granted only once the
-- booking actually took place (still active after it ended — released/cancelled earn nothing).
-- ─────────────────────────────────────────────────────────────
create or replace function public.award_loyalty_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select b.id, b.user_id, ((b.base_amount - b.discount_amount) / 100)::int as pts
    from public.bookings b
    where b.status = 'active'
      and b.user_id is not null
      and b.ends_at <= now()
      and b.ends_at > now() - interval '30 days'
      and not exists (select 1 from public.loyalty_ledger l where l.booking_id = b.id and l.kind = 'earn')
  ), inserted as (
    insert into public.loyalty_ledger (user_id, booking_id, kind, points, remaining, expires_at)
    select d.user_id, d.id, 'earn', d.pts, d.pts, now() + interval '12 months'
    from due d
    where d.pts > 0
    on conflict (booking_id, kind) where kind in ('earn', 'redeem', 'restore') do nothing
    returning 1
  )
  select count(*)::int into v_count from inserted;
  return v_count;
end;
$$;

create or replace function public.expire_loyalty_points()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot record;
  v_count integer := 0;
begin
  for v_lot in
    select l.id, l.user_id, l.remaining
    from public.loyalty_ledger l
    where l.kind = 'earn' and l.remaining > 0 and l.expires_at <= now()
    for update skip locked
  loop
    update public.loyalty_ledger set remaining = 0 where id = v_lot.id;
    insert into public.loyalty_ledger (user_id, kind, points, lot_id)
    values (v_lot.user_id, 'expire', -v_lot.remaining, v_lot.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.loyalty_balance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.remaining), 0)::int
  from public.loyalty_ledger l
  where l.user_id = p_user_id and l.kind = 'earn' and l.remaining > 0 and l.expires_at > now();
$$;

-- ─────────────────────────────────────────────────────────────
-- Sessions (Supabase Auth): list and revoke the caller's own sessions from the security tab.
-- Revoking deletes the session and its refresh tokens; an already-issued access token stays
-- valid until it expires (JWT expiry: 1 hour).
-- ─────────────────────────────────────────────────────────────
create or replace function public.list_user_sessions(p_user_id uuid)
returns table (id uuid, created_at timestamptz, last_active_at timestamptz, user_agent text, ip text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
         left(s.user_agent, 300), host(s.ip)
  from auth.sessions s
  where s.user_id = p_user_id and (s.not_after is null or s.not_after > now())
  order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc
  limit 50;
$$;

create or replace function public.revoke_user_session(p_user_id uuid, p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Grants
-- ─────────────────────────────────────────────────────────────
revoke execute on function public.create_booking_hold(uuid, text, timestamptz, timestamptz, integer, boolean, integer, integer, text, integer, integer, integer, numeric, uuid, text, text, text, text, jsonb, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.confirm_booking_payment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.restore_points_on_cancel() from public, anon, authenticated;
revoke execute on function public.award_loyalty_points() from public, anon, authenticated;
revoke execute on function public.expire_loyalty_points() from public, anon, authenticated;
revoke execute on function public.loyalty_balance(uuid) from public, anon, authenticated;
revoke execute on function public.list_user_sessions(uuid) from public, anon, authenticated;
revoke execute on function public.revoke_user_session(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_booking_hold(uuid, text, timestamptz, timestamptz, integer, boolean, integer, integer, text, integer, integer, integer, numeric, uuid, text, text, text, text, jsonb, text, integer, integer) to service_role;
grant execute on function public.confirm_booking_payment(uuid, text, text) to service_role;
grant execute on function public.award_loyalty_points() to service_role;
grant execute on function public.expire_loyalty_points() to service_role;
grant execute on function public.loyalty_balance(uuid) to service_role;
grant execute on function public.list_user_sessions(uuid) to service_role;
grant execute on function public.revoke_user_session(uuid, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Schedules (pg_cron enabled in 0002). Earning/expiry run in the database itself.
-- ─────────────────────────────────────────────────────────────
select cron.schedule('spacehub-award-points', '7 * * * *', $$ select public.award_loyalty_points(); $$);
select cron.schedule('spacehub-expire-points', '23 2 * * *', $$ select public.expire_loyalty_points(); $$);
select cron.schedule(
  'spacehub-prune-step-up',
  '41 3 * * *',
  $$ delete from public.step_up_grants where expires_at < now() - interval '1 day'; $$
);
