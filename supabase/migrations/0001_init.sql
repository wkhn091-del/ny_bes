-- SpaceHub — initial schema
-- Bookings, profiles, roles, coupons and the mirrors of Sanity data needed for DB-level integrity.
-- Run in the Supabase SQL editor (or `supabase db push`). Region: eu-central-1.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────
create type public.user_role as enum ('customer', 'branch_manager', 'super_admin');
create type public.booking_status as enum ('pending_payment', 'active', 'cancelled', 'released', 'expired');
create type public.space_type as enum ('hotDesk', 'privateOffice', 'meetingRoom');
create type public.refund_status as enum ('none', 'pending', 'succeeded', 'failed');

-- ─────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Profiles
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text check (phone is null or phone ~ '^\+?[0-9]{9,15}$'),
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Mirrors of Sanity content (written only by the signed Sanity webhook / seed script)
-- ─────────────────────────────────────────────────────────────
create table public.branches_mirror (
  id text primary key check (char_length(id) <= 128),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,96}$'),
  name text not null check (char_length(name) <= 120),
  -- [{ "day": 0-6, "closed": bool, "open": "HH:MM", "close": "HH:MM" }]
  hours jsonb not null check (jsonb_typeof(hours) = 'array'),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.spaces_mirror (
  id text primary key check (char_length(id) <= 128),
  branch_id text not null references public.branches_mirror (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,96}$'),
  name text not null check (char_length(name) <= 120),
  type public.space_type not null,
  pool_size integer check (pool_size is null or pool_size between 1 and 500),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint pool_only_for_hot_desk check ((type = 'hotDesk') = (pool_size is not null))
);

create index spaces_mirror_branch_idx on public.spaces_mirror (branch_id);

-- ─────────────────────────────────────────────────────────────
-- Roles: branch managers
-- ─────────────────────────────────────────────────────────────
create table public.branch_managers (
  user_id uuid not null references public.profiles (id) on delete cascade,
  branch_id text not null references public.branches_mirror (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'
  );
$$;

create or replace function public.manages_branch(p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.branch_managers bm
    join public.profiles p on p.id = bm.user_id
    where bm.user_id = auth.uid() and bm.branch_id = p_branch_id and p.role = 'branch_manager'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Coupons (private — never in the public Sanity dataset)
-- ─────────────────────────────────────────────────────────────
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  value integer not null check (value > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  one_per_user boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint percent_max_100 check (discount_type <> 'percent' or value <= 100),
  constraint valid_window check (valid_from is null or valid_until is null or valid_from < valid_until)
);

-- ─────────────────────────────────────────────────────────────
-- Bookings
-- ─────────────────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique check (public_code ~ '^[A-Z0-9]{8}$'),
  user_id uuid not null references public.profiles (id) on delete restrict,
  space_id text not null references public.spaces_mirror (id) on delete restrict,
  branch_id text not null references public.branches_mirror (id) on delete restrict,
  space_type public.space_type not null,
  space_name text not null check (char_length(space_name) <= 120),
  branch_name text not null check (char_length(branch_name) <= 120),
  during tstzrange not null check (not isempty(during) and lower_inc(during) and not upper_inc(during)),
  starts_at timestamptz generated always as (lower(during)) stored,
  ends_at timestamptz generated always as (upper(during)) stored,
  seats integer not null default 1 check (seats between 1 and 500),
  is_day_pass boolean not null default false,
  status public.booking_status not null default 'pending_payment',
  hold_expires_at timestamptz,

  -- Frozen price snapshot, all amounts in agorot, VAT-inclusive.
  base_amount integer not null check (base_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  discount_source text check (discount_source in ('auto', 'coupon')),
  addons_amount integer not null default 0 check (addons_amount >= 0),
  total_amount integer not null check (total_amount >= 0),
  vat_amount integer not null check (vat_amount >= 0),
  vat_rate numeric(5, 4) not null check (vat_rate >= 0 and vat_rate < 1),
  currency text not null default 'ils' check (currency = 'ils'),
  coupon_id uuid references public.coupons (id) on delete set null,

  company_name text check (char_length(company_name) <= 120),
  company_tax_id text check (company_tax_id is null or company_tax_id ~ '^[0-9]{9}$'),
  customer_email text not null check (char_length(customer_email) <= 254),
  customer_name text check (char_length(customer_name) <= 120),

  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_session_closed_at timestamptz,
  refund_status public.refund_status not null default 'none',
  stripe_refund_id text,

  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text check (cancelled_by in ('customer', 'admin', 'system')),
  released_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id) on delete set null,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint discount_not_above_base check (discount_amount <= base_amount),
  constraint total_consistent check (total_amount = base_amount - discount_amount + addons_amount),
  constraint pending_has_expiry check (status <> 'pending_payment' or hold_expires_at is not null),

  -- The core guarantee: an exclusive space (office / meeting room) can never hold two live bookings that overlap.
  constraint exclusive_no_overlap exclude using gist (space_id with =, during with &&)
    where (space_type <> 'hotDesk' and status in ('pending_payment', 'active'))
);

create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

create index bookings_user_start_idx on public.bookings (user_id, starts_at desc);
create index bookings_branch_start_idx on public.bookings (branch_id, starts_at);
create index bookings_space_during_idx on public.bookings using gist (space_id, during)
  where status in ('pending_payment', 'active');
create index bookings_pending_expiry_idx on public.bookings (hold_expires_at) where status = 'pending_payment';
create index bookings_reminder_idx on public.bookings (starts_at) where status = 'active' and reminder_sent_at is null;
create index bookings_session_close_idx on public.bookings (updated_at)
  where status = 'expired' and stripe_checkout_session_id is not null and stripe_session_closed_at is null;

create table public.booking_addons (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  addon_id text not null check (char_length(addon_id) <= 128),
  name text not null check (char_length(name) <= 120),
  pricing_mode text not null check (pricing_mode in ('perBooking', 'perHour')),
  unit_price integer not null check (unit_price >= 0),
  quantity numeric(6, 2) not null check (quantity > 0),
  line_total integer not null check (line_total >= 0)
);

create index booking_addons_booking_idx on public.booking_addons (booking_id);

create table public.coupon_redemptions (
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (coupon_id, booking_id)
);

create index coupon_redemptions_user_idx on public.coupon_redemptions (coupon_id, user_id);

-- ─────────────────────────────────────────────────────────────
-- Integrations
-- ─────────────────────────────────────────────────────────────
create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table public.telegram_channels (
  branch_id text primary key references public.branches_mirror (id) on delete cascade,
  chat_id text not null check (chat_id ~ '^-?[0-9]{5,20}$'),
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- Customers read only their own rows. All writes go through server code using the
-- service role, which enforces business rules via the functions below.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.branches_mirror enable row level security;
alter table public.spaces_mirror enable row level security;
alter table public.branch_managers enable row level security;
alter table public.coupons enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_addons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.telegram_channels enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

create policy branch_managers_select_own on public.branch_managers
  for select to authenticated using (user_id = (select auth.uid()) or public.is_super_admin());

create policy bookings_select_owner on public.bookings
  for select to authenticated using (user_id = (select auth.uid()));

create policy bookings_select_staff on public.bookings
  for select to authenticated using (public.is_super_admin() or public.manages_branch(branch_id));

create policy booking_addons_select on public.booking_addons
  for select to authenticated using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (b.user_id = (select auth.uid()) or public.is_super_admin() or public.manages_branch(b.branch_id))
    )
  );

revoke insert, update, delete on public.bookings from anon, authenticated;
revoke insert, update, delete on public.booking_addons from anon, authenticated;
revoke all on public.coupons, public.coupon_redemptions, public.stripe_events, public.telegram_channels from anon, authenticated;
revoke insert, update, delete on public.branches_mirror, public.spaces_mirror, public.branch_managers from anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Booking window validation (mirrors src/lib/domain/booking-rules.ts)
-- ─────────────────────────────────────────────────────────────
create or replace function public.validate_booking_window(p_branch_id text, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hours jsonb;
  v_day jsonb;
  v_local_start timestamp;
  v_local_end timestamp;
  v_today date;
begin
  select b.hours into v_hours from public.branches_mirror b where b.id = p_branch_id and b.active;
  if v_hours is null then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_local_start := p_start at time zone 'Asia/Jerusalem';
  v_local_end := p_end at time zone 'Asia/Jerusalem';
  v_today := (now() at time zone 'Asia/Jerusalem')::date;

  if v_local_end::date <> v_local_start::date then
    raise exception 'MULTI_DAY' using errcode = 'P0001';
  end if;
  if extract(second from v_local_start) <> 0 or extract(second from v_local_end) <> 0
     or (extract(minute from v_local_start)::int % 30) <> 0
     or (extract(minute from v_local_end)::int % 30) <> 0 then
    raise exception 'MISALIGNED' using errcode = 'P0001';
  end if;
  if p_end - p_start < interval '60 minutes' then
    raise exception 'TOO_SHORT' using errcode = 'P0001';
  end if;
  if p_start <= now() then
    raise exception 'IN_PAST' using errcode = 'P0001';
  end if;
  if v_local_start::date > v_today + 60 then
    raise exception 'TOO_FAR' using errcode = 'P0001';
  end if;

  select d into v_day
  from jsonb_array_elements(v_hours) d
  where (d ->> 'day')::int = extract(dow from v_local_start)::int
  limit 1;

  if v_day is null or coalesce((v_day ->> 'closed')::boolean, true) then
    raise exception 'BRANCH_CLOSED' using errcode = 'P0001';
  end if;
  if v_local_start::time < (v_day ->> 'open')::time or v_local_end::time > (v_day ->> 'close')::time then
    raise exception 'OUTSIDE_HOURS' using errcode = 'P0001';
  end if;
end;
$$;

-- Peak concurrent seats used in a pool space across 30-minute slots of a range.
create or replace function public.peak_pool_usage(p_space_id text, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(max(used), 0)::int
  from (
    select s, sum(b.seats) as used
    from generate_series(p_start, p_end - interval '30 minutes', interval '30 minutes') as s
    join public.bookings b
      on b.space_id = p_space_id
     and b.during && tstzrange(s, s + interval '30 minutes', '[)')
     and (b.status = 'active' or (b.status = 'pending_payment' and b.hold_expires_at > now()))
     and (p_exclude is null or b.id <> p_exclude)
    group by s
  ) usage;
$$;

-- ─────────────────────────────────────────────────────────────
-- create_booking_hold: the only way a booking row is created.
-- Prices are computed by the server (src/lib/domain/pricing.ts) and passed in; this
-- function is executable by the service role only.
-- ─────────────────────────────────────────────────────────────
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
  p_hold_minutes integer default 15
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
begin
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
      total_amount, vat_amount, vat_rate, coupon_id, company_name, company_tax_id, customer_email, customer_name
    ) values (
      p_public_code, p_user_id, v_space.id, v_space.branch_id, v_space.type, v_space.name, v_branch_name, v_range,
      p_seats, p_is_day_pass, 'pending_payment', v_expires, p_base_amount, p_discount_amount, p_discount_source,
      p_addons_amount, p_total_amount, p_vat_amount, p_vat_rate, p_coupon_id, p_company_name, p_company_tax_id,
      p_customer_email, p_customer_name
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

  return query select v_booking_id, p_public_code, v_expires;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- confirm_booking_payment: called by the verified Stripe webhook.
-- Returns 'confirmed' | 'already' | 'conflict' | 'not_found'.
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

  -- Same lock order as create_booking_hold (space, then booking) to avoid deadlocks.
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
-- Customer cancellation / release (rules mirror src/lib/domain/booking-rules.ts)
-- Full refund: ≥24h before start, or within 5 minutes of payment confirmation.
-- ─────────────────────────────────────────────────────────────
create or replace function public.cancel_booking_by_customer(p_booking_id uuid, p_user_id uuid)
returns setof public.bookings
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.bookings b
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'customer',
         refund_status = case when b.total_amount > 0 then 'pending'::public.refund_status else 'none'::public.refund_status end
   where b.id = p_booking_id
     and b.user_id = p_user_id
     and b.status = 'active'
     and lower(b.during) > now()
     and (lower(b.during) - now() >= interval '24 hours' or b.confirmed_at >= now() - interval '5 minutes')
  returning b.*;
end;
$$;

create or replace function public.release_booking_by_customer(p_booking_id uuid, p_user_id uuid)
returns setof public.bookings
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.bookings b
     set status = 'released',
         released_at = now()
   where b.id = p_booking_id
     and b.user_id = p_user_id
     and b.status = 'active'
     and upper(b.during) > now()
  returning b.*;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Maintenance: expire stale holds (cron route then closes the Stripe sessions)
-- ─────────────────────────────────────────────────────────────
create or replace function public.expire_stale_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.bookings
     set status = 'expired'
   where status = 'pending_payment' and hold_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Public-safe aggregates (no PII): occupancy per 30-minute slot and weekly booking counts
-- ─────────────────────────────────────────────────────────────
create or replace function public.space_occupancy(p_space_ids text[], p_from timestamptz, p_to timestamptz)
returns table (space_id text, slot_start timestamptz, used integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_to <= p_from or p_to - p_from > interval '26 hours' or coalesce(array_length(p_space_ids, 1), 0) > 500 then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;

  return query
  select b.space_id, s, sum(b.seats)::int
  from generate_series(p_from, p_to - interval '30 minutes', interval '30 minutes') as s
  join public.bookings b
    on b.space_id = any (p_space_ids)
   and b.during && tstzrange(s, s + interval '30 minutes', '[)')
   and (b.status = 'active' or (b.status = 'pending_payment' and b.hold_expires_at > now()))
  group by b.space_id, s;
end;
$$;

create or replace function public.recent_booking_counts(p_days integer default 7)
returns table (space_id text, bookings integer)
language sql
stable
security definer
set search_path = ''
as $$
  select b.space_id, count(*)::int
  from public.bookings b
  where b.status in ('active', 'released')
    and b.confirmed_at >= now() - make_interval(days => greatest(1, least(p_days, 30)))
  group by b.space_id;
$$;

-- Only the server (service role) may execute business functions.
revoke execute on function public.validate_booking_window(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.peak_pool_usage(text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.create_booking_hold(uuid, text, timestamptz, timestamptz, integer, boolean, integer, integer, text, integer, integer, integer, numeric, uuid, text, text, text, text, jsonb, text, integer) from public, anon, authenticated;
revoke execute on function public.confirm_booking_payment(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cancel_booking_by_customer(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.release_booking_by_customer(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.expire_stale_holds() from public, anon, authenticated;
revoke execute on function public.space_occupancy(text[], timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.recent_booking_counts(integer) from public, anon, authenticated;

grant execute on function public.validate_booking_window(text, timestamptz, timestamptz) to service_role;
grant execute on function public.peak_pool_usage(text, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.create_booking_hold(uuid, text, timestamptz, timestamptz, integer, boolean, integer, integer, text, integer, integer, integer, numeric, uuid, text, text, text, text, jsonb, text, integer) to service_role;
grant execute on function public.confirm_booking_payment(uuid, text, text) to service_role;
grant execute on function public.cancel_booking_by_customer(uuid, uuid) to service_role;
grant execute on function public.release_booking_by_customer(uuid, uuid) to service_role;
grant execute on function public.expire_stale_holds() to service_role;
grant execute on function public.space_occupancy(text[], timestamptz, timestamptz) to service_role;
grant execute on function public.recent_booking_counts(integer) to service_role;
