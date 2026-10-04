-- SpaceHub — Module C (IAM): known devices + signed auth-user webhook.
-- Before running: enable "pgcrypto", "pg_net" (already used by 0002_cron) and store one more Vault secret:
--
--   select vault.create_secret('<same value as AUTH_WEBHOOK_SECRET env var>', 'spacehub_auth_webhook_secret');
--
-- `spacehub_app_url` from 0002_cron.sql is reused as the target origin.

create extension if not exists pgcrypto;
create extension if not exists pg_net;

-- ─── Known devices (new-device sign-in alerts) ─────────────────────────────
-- device_key is a SHA-256 of (user id + browser family + OS), computed in the app.
-- No raw user agent and no full IP are stored.
create table public.known_devices (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_key text not null check (char_length(device_key) = 64),
  label text not null check (char_length(label) <= 80),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_key)
);

alter table public.known_devices enable row level security;
-- No policies: only the service role (server) reads or writes this table.

-- Returns true when this device was not seen before AND the user already had at least one other device.
-- (The very first sign-in of a new account is not "a new device".)
create or replace function public.register_device(p_user_id uuid, p_device_key text, p_label text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted boolean;
  v_others integer;
begin
  insert into public.known_devices (user_id, device_key, label)
  values (p_user_id, p_device_key, left(p_label, 80))
  on conflict (user_id, device_key) do update set last_seen_at = now()
  returning (xmax = 0) into v_inserted;

  if not v_inserted then
    return false;
  end if;

  select count(*) into v_others
  from public.known_devices
  where user_id = p_user_id and device_key <> p_device_key;

  return v_others > 0;
end;
$$;

revoke all on function public.register_device(uuid, text, text) from public, anon, authenticated;

-- ─── Auth-user webhook (idempotency ledger) ────────────────────────────────
create table public.auth_webhook_events (
  event_id uuid primary key,
  event_type text not null check (event_type in ('user.created', 'user.updated', 'user.deleted')),
  user_id uuid not null,
  received_at timestamptz not null default now()
);

alter table public.auth_webhook_events enable row level security;

-- Sends user.created / user.updated / user.deleted to /api/auth/webhook.
-- Payload carries only ids (no email / name); the app re-reads the user server-side.
-- Signature: base64(HMAC-SHA256(secret, "<id>.<timestamp>.<body>")), header "v1,<sig>".
create or replace function public.notify_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_url text;
  v_id uuid := gen_random_uuid();
  v_ts text := extract(epoch from now())::bigint::text;
  v_type text;
  v_user uuid;
  v_body text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'spacehub_auth_webhook_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'spacehub_app_url';
  if v_secret is null or v_url is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_type := 'user.created';
    v_user := new.id;
  elsif tg_op = 'UPDATE' then
    v_type := 'user.updated';
    v_user := new.id;
  else
    v_type := 'user.deleted';
    v_user := old.id;
  end if;

  v_body := jsonb_build_object('id', v_id, 'type', v_type, 'userId', v_user, 'occurredAt', now())::text;

  perform net.http_post(
    url := v_url || '/api/auth/webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'webhook-id', v_id::text,
      'webhook-timestamp', v_ts,
      'webhook-signature', 'v1,' || encode(hmac(v_id::text || '.' || v_ts || '.' || v_body, v_secret, 'sha256'), 'base64')
    ),
    body := v_body::jsonb,
    timeout_milliseconds := 5000
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.notify_auth_user_change() from public, anon, authenticated;

create trigger on_auth_user_created_webhook
  after insert on auth.users
  for each row execute function public.notify_auth_user_change();

-- Only fields that change the Sanity customer card; token refreshes / last_sign_in do not fire.
create trigger on_auth_user_updated_webhook
  after update of email, raw_user_meta_data on auth.users
  for each row
  when (old.email is distinct from new.email or old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.notify_auth_user_change();

create trigger on_auth_user_deleted_webhook
  after delete on auth.users
  for each row execute function public.notify_auth_user_change();

-- Housekeeping: idempotency ids older than 30 days are no longer needed (timestamp window is 5 minutes).
select cron.schedule(
  'spacehub-prune-auth-webhook-events',
  '23 3 * * *',
  $$ delete from public.auth_webhook_events where received_at < now() - interval '30 days'; $$
);
