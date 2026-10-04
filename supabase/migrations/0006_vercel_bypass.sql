-- SpaceHub — outbound calls to a Vercel deployment behind Deployment Protection (Staging/Preview).
-- Optional Vault secret, set ONLY on the staging Supabase project:
--
--   select vault.create_secret('<Vercel → Settings → Deployment Protection → Protection Bypass for Automation>', 'spacehub_vercel_bypass');
--
-- Without it (production) the headers are exactly what 0002/0004 sent before.

create or replace function public.spacehub_outbound_headers(base jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when b.secret is null then base
    else base || jsonb_build_object('x-vercel-protection-bypass', b.secret)
  end
  from (select (select decrypted_secret from vault.decrypted_secrets where name = 'spacehub_vercel_bypass') as secret) b;
$$;

revoke all on function public.spacehub_outbound_headers(jsonb) from public, anon, authenticated;

-- Same job name as 0002 → pg_cron replaces the existing definition.
select cron.schedule(
  'spacehub-maintenance',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'spacehub_app_url') || '/api/cron/maintenance',
    headers := public.spacehub_outbound_headers(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'spacehub_cron_secret')
    )),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

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
    headers := public.spacehub_outbound_headers(jsonb_build_object(
      'Content-Type', 'application/json',
      'webhook-id', v_id::text,
      'webhook-timestamp', v_ts,
      'webhook-signature', 'v1,' || encode(hmac(v_id::text || '.' || v_ts || '.' || v_body, v_secret, 'sha256'), 'base64')
    )),
    body := v_body::jsonb,
    timeout_milliseconds := 5000
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.notify_auth_user_change() from public, anon, authenticated;
