-- pg_net delivers each auth webhook once and never retries.
-- Keep failed events as pending so /api/cron/maintenance can re-run them.
alter table public.auth_webhook_events
  add column processed_at timestamptz,
  add column attempts integer not null default 0 check (attempts >= 0),
  add column last_error text check (char_length(last_error) <= 200);

update public.auth_webhook_events set processed_at = received_at where processed_at is null;

create index auth_webhook_events_pending_idx
  on public.auth_webhook_events (received_at)
  where processed_at is null;
