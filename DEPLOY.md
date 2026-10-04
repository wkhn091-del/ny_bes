# SpaceHub — deployment guide (Vercel + Supabase + Sanity)

Order matters: **Supabase → Sanity → Stripe → Vercel → webhooks → cron → seed → staff roles**.
Use separate projects/keys for Preview and Production wherever the provider allows it.

---

## 1. Supabase (Frankfurt, `eu-central-1`)

1. Create a project in **eu-central-1**. Keep the service-role key out of anything `NEXT_PUBLIC_*`.
2. SQL editor → run, in order:
   - `supabase/migrations/0001_init.sql` — tables, exclusion constraint, RLS, RPCs (all RPCs are `service_role` only).
   - `supabase/migrations/0002_cron.sql` — enables `pg_cron` + `pg_net` and schedules jobs.
   - `supabase/migrations/0003_customer_portal.sql` — favorites, loyalty points ledger (earn/expire jobs), step-up
     grants, billing defaults, session listing, account-deletion support. Withdraws the direct profile-update grant
     (all profile changes go through the server).
   - `supabase/migrations/0004_iam.sql` — known devices (new-device sign-in alerts) and the signed auth-user webhook:
     triggers on `auth.users` insert / email-or-metadata update / delete post `user.created|updated|deleted` to
     `/api/auth/webhook` (HMAC-SHA256, 5-minute timestamp window, event-id idempotency ledger).
   - `supabase/migrations/0005_cro.sql` — `space_co_bookings` (service_role only): "customers who booked this also
     booked" counts for recommendations, returned only when at least 3 distinct customers share the pair.
3. Vault secrets used by the cron job and the auth webhook (Project Settings → Vault, or SQL):
   ```sql
   select vault.create_secret('https://<your-production-domain>', 'spacehub_app_url');
   select vault.create_secret('<same value as CRON_SECRET>', 'spacehub_cron_secret');
   select vault.create_secret('<same value as AUTH_WEBHOOK_SECRET>', 'spacehub_auth_webhook_secret');
   ```
   Rotating `AUTH_WEBHOOK_SECRET`: update Vault and the Vercel variable together, then redeploy. Deliveries signed
   with the old value during the gap are rejected (401) and the card is re-synced on the next sign-in.
4. **Auth → Providers → Email**: enable Email, enable **Email OTP**, set **OTP expiry = 300 seconds** (5 minutes),
   OTP length 6. Entering the code verifies the address, so no separate confirmation link is needed.
5. **Auth → Email templates → Magic Link / OTP**: replace the link with `{{ .Token }}` so users receive a code.
   Do the same for **Change Email Address** (`{{ .Token }}`): the account page asks for the code sent to the new address.
6. **Auth → Providers → Email → Secure email change: OFF.** The app already requires a fresh code to the current
   address (step-up) before an email change, then a code to the new address.
7. **Auth → Providers → Google**: enable; paste the OAuth client id/secret from Google Cloud Console
   (OAuth consent screen: External, scopes `email`, `profile`, `openid`; Authorized redirect URI =
   `https://<project-ref>.supabase.co/auth/v1/callback`).
8. **Auth → URL configuration**: Site URL = production domain. Redirect allow-list:
   `https://<production-domain>/auth/callback**`, each Preview domain's `/auth/callback**`, `http://localhost:3000/auth/callback**`.
9. **Auth → Sessions**: JWT expiry 3600 s (default). The session cookie lasts 30 days and is renewed on every
   refresh, so an account signs out after 30 days without activity. On a paid plan also set *Inactivity timeout = 30 days*.
10. **Auth → Rate limits**: keep Supabase's own limits on (defense in depth with Upstash).
11. Optional: Auth → SMTP → route auth emails through Resend for branded sender.

## 2. Sanity

1. Create a project. Datasets:
   - `production` — **public** (catalog content).
   - `customers` — **private** (lean customer cards). `sanity dataset create customers --visibility private`.
2. **API → Tokens** — create two tokens, never reuse one for both:
   - `SANITY_API_READ_TOKEN` — **Viewer**.
   - `SANITY_API_WRITE_TOKEN` — **Editor** (seed script + customer-card sync only).
3. **API → CORS origins** (no wildcards):
   - `http://localhost:3000` — *allow credentials* (local Studio).
   - `https://<production-domain>` — *allow credentials* (Studio at `/studio`).
   - Each Preview domain you use for Studio — *allow credentials*.
4. **API → Webhooks** → new webhook:
   - URL: `https://<domain>/api/sanity/webhook`
   - Dataset: `production`; Trigger on: create, update, delete
   - Filter: `_type in ["siteSettings","seo","legal","city","branch","space","amenity","addon"]`
   - Projection: `{_type, _id}`
   - HTTP method POST, API version `v2025-02-19` or newer, **Secret = `SANITY_WEBHOOK_SECRET`**.
   - The route verifies the signature, revalidates the content cache and re-syncs `branch`/`space` into the Supabase mirrors.
   - **Second webhook** for reviews: same URL and secret, Dataset: `customers`, Filter: `_type == "review"`,
     Projection `{_type, _id}`. Approved reviews then appear immediately (otherwise within 10 minutes).
5. Studio is served by the app at `/studio/content` and `/studio/customers`. Add editors under Members.
   Review moderation lives in `/studio/customers` → "ביקורות ממתינות לאישור" (approve / reject actions; review text is read-only).

## 3. Stripe (test mode)

1. Developers → API keys → `STRIPE_SECRET_KEY` (`sk_test_…`). The publishable key is not needed (hosted Checkout).
2. Developers → Webhooks → add endpoint `https://<domain>/api/stripe/webhook`, events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET`. Use a **separate endpoint/secret per environment**.
3. Settings → Checkout: enable ILS. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## 4. Other services

| Service | What to create | Variables |
|---|---|---|
| Resend | API key; keep `onboarding@resend.dev` until a domain is verified | `RESEND_API_KEY`, `EMAIL_FROM` |
| Telegram | Bot via @BotFather; add it to one group per branch | `TELEGRAM_BOT_TOKEN` |
| Turnstile | Widget (Managed), hostnames = prod + preview domains + localhost | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |
| Upstash | Redis database, region **eu-central-1** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Sentry | Next.js project; DSN; optional auth token for source maps | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_*` |

Telegram group per branch (chat ids are negative numbers — get them from `getUpdates` after messaging the group):
```sql
insert into public.telegram_channels (branch_id, chat_id) values
  ('branch-tlv-rothschild', '-1001234567890')
on conflict (branch_id) do update set chat_id = excluded.chat_id, updated_at = now();
```

## 5. Vercel

1. Import the repo. Framework: Next.js. Node 20+.
2. **Environment variables** — set every variable from `.env.example` **per environment**:
   - *Production*: production Supabase/Sanity tokens, live-domain `NEXT_PUBLIC_SITE_URL`, Stripe test keys until launch.
   - *Preview*: separate Stripe webhook secret, Preview `NEXT_PUBLIC_SITE_URL`, ideally a separate Supabase project.
   - *Development*: pull with `vercel env pull .env.local`.
   On Preview/Production the server refuses to start if a required variable is missing (`src/lib/env.server.ts`).
3. Enable **Vercel Analytics** (cookieless — no consent banner required).
4. Deploy, then update Supabase Vault `spacehub_app_url` if the domain changed.

## 6. Seed demo content

```bash
cp .env.example .env.local   # fill Sanity write token + Supabase service key
npm run seed                 # uploads images, creates documents, syncs Supabase mirrors
npm run seed:mirror          # only re-sync Supabase mirrors
```

## 7. Staff roles (RBAC)

Staff never get Supabase dashboard access. After a staff member signs in once (creating their profile):
```sql
-- Super admin (all branches, coupons)
update public.profiles set role = 'super_admin'
where id = (select id from auth.users where email = 'owner@example.com');

-- Branch manager scoped to specific branches
update public.profiles set role = 'branch_manager'
where id = (select id from auth.users where email = 'manager@example.com');
insert into public.branch_managers (user_id, branch_id)
select id, 'branch-tlv-rothschild' from auth.users where email = 'manager@example.com';
```

## 8. Pre-launch checklist

- [ ] Replace demo legal entity details in Sanity → Site settings; set `legalIsDemo = false`.
- [ ] Lawyer reviews the four legal pages; tick `lawyerReviewed` on each.
- [ ] Replace demo phone numbers (branches + WhatsApp `972500000000`).
- [ ] Verify a Resend sending domain and update `EMAIL_FROM`.
- [ ] Switch Stripe to live keys + live webhook secret (Production only).
- [ ] `npm audit`: the reported advisories are in build-time tooling (Sanity CLI chain, ESLint plugins); the
      suggested fixes are downgrades. Re-check after each dependency update; none ship in the runtime bundle.
