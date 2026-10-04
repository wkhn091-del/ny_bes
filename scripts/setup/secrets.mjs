#!/usr/bin/env node
// Generates the secrets SpaceHub creates itself — a distinct set per environment — and optionally
// pushes them to Vercel. Idempotent: existing values are kept, only missing ones are generated.
//
//   node scripts/setup/secrets.mjs           → writes .env.local + .secrets/{preview,production}.env + vault SQL
//   node scripts/setup/secrets.mjs --push    → also `vercel env add` for Preview and Production
//
// .secrets/ is git-ignored. Sensitive Vercel variables cannot be read back, so this is the only copy
// of the values that Supabase Vault and the Sanity webhook must match.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const secretsDir = join(root, '.secrets');

const GENERATORS = {
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: () => randomBytes(32).toString('base64'),
  CSV_EXPORT_TOKEN: () => randomBytes(32).toString('base64url'),
  CRON_SECRET: () => randomBytes(32).toString('base64url'),
  AUTH_WEBHOOK_SECRET: () => randomBytes(32).toString('base64url'),
  SANITY_WEBHOOK_SECRET: () => randomBytes(32).toString('base64url'),
};

function parseEnv(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

// Filled in by hand from each service's dashboard (test-mode keys for preview).
const SERVICE_KEYS = [
  'NEXT_PUBLIC_SANITY_PROJECT_ID',
  'SANITY_API_READ_TOKEN',
  'SANITY_API_WRITE_TOKEN',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'TELEGRAM_BOT_TOKEN',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];
// Provided by Vercel itself at runtime; kept locally only for Vault / webhook URLs.
const LOCAL_ONLY = new Set(['VERCEL_AUTOMATION_BYPASS_SECRET']);

function fill(values) {
  for (const [key, gen] of Object.entries(GENERATORS)) {
    if (!values.get(key)) values.set(key, gen());
  }
  return values;
}

function withServiceSlots(values) {
  for (const key of SERVICE_KEYS) if (!values.has(key)) values.set(key, '');
  return values;
}

function writeEnvFile(path, values) {
  writeFileSync(path, [...values].map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function vaultSql(values, appUrl) {
  return [
    '-- Run in the matching Supabase project → SQL editor (once). Never commit this file.',
    `select vault.create_secret(${sqlString(appUrl)}, 'spacehub_app_url');`,
    `select vault.create_secret(${sqlString(values.get('CRON_SECRET'))}, 'spacehub_cron_secret');`,
    `select vault.create_secret(${sqlString(values.get('AUTH_WEBHOOK_SECRET'))}, 'spacehub_auth_webhook_secret');`,
    ...(values.get('VERCEL_AUTOMATION_BYPASS_SECRET')
      ? [`select vault.create_secret(${sqlString(values.get('VERCEL_AUTOMATION_BYPASS_SECRET'))}, 'spacehub_vercel_bypass');`]
      : []),
    '',
  ].join('\n');
}

mkdirSync(secretsDir, { recursive: true });

const sets = {};
for (const env of ['preview', 'production']) {
  const path = join(secretsDir, `${env}.env`);
  sets[env] = withServiceSlots(fill(existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : new Map()));
  writeEnvFile(path, sets[env]);
}

const localPath = join(root, '.env.local');
const localText = existsSync(localPath) ? readFileSync(localPath, 'utf8') : readFileSync(join(root, '.env.example'), 'utf8');
const local = fill(parseEnv(localText));
const merged = localText
  .split(/\r?\n/)
  .map((line) => {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    return m && m[1] in GENERATORS && !m[2] ? `${m[1]}=${local.get(m[1])}` : line;
  })
  .join('\n');
writeFileSync(localPath, merged, { mode: 0o600 });

for (const key of Object.keys(GENERATORS)) {
  const values = [local.get(key), sets.preview.get(key), sets.production.get(key)];
  if (new Set(values).size !== values.length) throw new Error(`${key} is shared between environments`);
}

const appUrls = {
  preview: process.env.SPACEHUB_PREVIEW_URL ?? 'https://ny-bes-git-staging-wkhn091-8071s-projects.vercel.app',
  production: process.env.SPACEHUB_PRODUCTION_URL ?? 'https://<production-url>',
};
for (const env of ['preview', 'production']) {
  writeFileSync(join(secretsDir, `vault-${env}.sql`), vaultSql(sets[env], appUrls[env]), { mode: 0o600 });
}

console.log(`Secrets ready: .env.local, .secrets/preview.env, .secrets/production.env (${Object.keys(GENERATORS).length} keys each, all distinct).`);

function vercelToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const home = homedir();
  const candidates = [
    join(process.env.APPDATA ?? '', 'xdg.data', 'com.vercel.cli', 'auth.json'),
    join(process.env.APPDATA ?? '', 'com.vercel.cli', 'Data', 'auth.json'),
    join(home, 'Library', 'Application Support', 'com.vercel.cli', 'auth.json'),
    join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'com.vercel.cli', 'auth.json'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')).token;
  }
  throw new Error('No Vercel token: run `vercel login` or set VERCEL_TOKEN');
}

// The CLI cannot add a Preview variable for all branches non-interactively, so this uses the REST API.
if (process.argv.includes('--push')) {
  const link = JSON.parse(readFileSync(join(root, '.vercel', 'repo.json'), 'utf8')).projects[0];
  const token = vercelToken();
  for (const env of ['preview', 'production']) {
    const keys = [...sets[env]].filter(([key, value]) => value && !LOCAL_ONLY.has(key)).map(([key]) => key);
    for (const key of keys) {
      const type = key.startsWith('NEXT_PUBLIC_') ? 'plain' : 'sensitive';
      const res = await fetch(
        `https://api.vercel.com/v10/projects/${link.id}/env?upsert=true&teamId=${encodeURIComponent(link.orgId)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: sets[env].get(key), type, target: [env] }),
        },
      );
      console.log(`${res.ok ? '✓' : '✗'} ${env.padEnd(10)} ${key}${res.ok ? '' : ` → HTTP ${res.status} ${(await res.text()).slice(0, 300)}`}`);
      if (!res.ok) process.exitCode = 1;
    }
  }
}
