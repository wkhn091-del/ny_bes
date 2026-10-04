-- SpaceHub — scheduled maintenance via pg_cron + pg_net (works on the Supabase free tier).
-- Before running: Dashboard → Database → Extensions → enable "pg_cron" and "pg_net",
-- then store the two secrets in Vault (Dashboard → Project Settings → Vault, or SQL below):
--
--   select vault.create_secret('https://your-domain.vercel.app', 'spacehub_app_url');
--   select vault.create_secret('<same value as CRON_SECRET env var>', 'spacehub_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 5 minutes: expire stale holds, close their Stripe sessions, send 2-hour reminders.
select cron.schedule(
  'spacehub-maintenance',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'spacehub_app_url') || '/api/cron/maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'spacehub_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Safety net that does not depend on the app being reachable: expire holds directly every minute.
select cron.schedule('spacehub-expire-holds', '* * * * *', $$ select public.expire_stale_holds(); $$);

-- Housekeeping: drop processed Stripe event ids after 30 days.
select cron.schedule(
  'spacehub-prune-stripe-events',
  '17 3 * * *',
  $$ delete from public.stripe_events where received_at < now() - interval '30 days'; $$
);
