/**
 * Seeds Sanity with the demo catalog and mirrors it into Supabase.
 *
 *   npm run seed            → upload images + createOrReplace all demo documents, then sync mirrors
 *   npm run seed -- --mirror-only   → only sync Supabase mirrors from the seed data
 *
 * Reads .env.local. Must not import `server-only` modules (they throw outside Next.js).
 */
import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createSanityClient, type SanityClient } from 'next-sanity';
import { LEGAL_DRAFTS, draftToPortableText } from '../src/content/legal-drafts';
import {
  SEED_ADDONS,
  SEED_AMENITIES,
  SEED_BRANCHES,
  SEED_CITIES,
  SEED_SEO,
  SEED_SETTINGS,
  SEED_SPACES,
} from '../src/content/seed-data';
import type { ImageRef } from '../src/lib/domain/types';
import { syncMirrors } from '../src/lib/sync/mirror';

config({ path: '.env.local' });
config();

const mirrorOnly = process.argv.includes('--mirror-only');

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Missing ${name} in .env.local`);
    process.exit(1);
  }
  return value;
}

let keyCounter = 0;
const key = () => `k${(keyCounter++).toString(36)}`;
const ref = (id: string) => ({ _type: 'reference' as const, _ref: id });
const slug = (current: string) => ({ _type: 'slug' as const, current });

const assetCache = new Map<string, string>();

async function uploadImage(client: SanityClient, image: ImageRef): Promise<string> {
  const cached = assetCache.get(image.url);
  if (cached) return cached;
  let buffer: Buffer;
  let filename: string;
  if (image.url.startsWith('/')) {
    buffer = await readFile(path.join(process.cwd(), 'public', image.url));
    filename = path.basename(image.url);
  } else {
    const res = await fetch(image.url);
    if (!res.ok) throw new Error(`Image download failed (${res.status}): ${image.url}`);
    buffer = Buffer.from(await res.arrayBuffer());
    filename = `${new URL(image.url).pathname.split('/').pop() ?? 'image'}.jpg`;
  }
  const asset = await client.assets.upload('image', buffer, { filename });
  assetCache.set(image.url, asset._id);
  console.log(`  ↑ ${filename}`);
  return asset._id;
}

async function imageField(client: SanityClient, image: ImageRef, withKey = false) {
  const assetId = await uploadImage(client, image);
  return { ...(withKey ? { _key: key() } : {}), _type: 'image' as const, asset: ref(assetId), alt: image.alt };
}

async function seedSanity() {
  const client = createSanityClient({
    projectId: required('NEXT_PUBLIC_SANITY_PROJECT_ID'),
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
    apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2026-10-01',
    token: required('SANITY_API_WRITE_TOKEN'),
    useCdn: false,
  });

  console.log('• Uploading images…');
  const docs: Record<string, unknown>[] = [];

  SEED_CITIES.forEach((c, i) => docs.push({ _id: c.id, _type: 'city', name: c.name, slug: slug(c.slug), order: i }));
  SEED_AMENITIES.forEach((a) => docs.push({ _id: a.id, _type: 'amenity', name: a.name, slug: slug(a.slug) }));
  SEED_ADDONS.forEach((a) =>
    docs.push({
      _id: a.id,
      _type: 'addon',
      name: a.name,
      slug: slug(a.slug),
      description: a.description,
      price: a.price,
      pricingMode: a.pricingMode,
      spaceTypes: a.spaceTypes,
      active: true,
    }),
  );

  for (const b of SEED_BRANCHES) {
    docs.push({
      _id: b.id,
      _type: 'branch',
      name: b.name,
      slug: slug(b.slug),
      city: ref(b.city.id),
      address: b.address,
      wazeUrl: b.wazeUrl ?? undefined,
      phone: b.phone,
      description: b.description,
      isFlagship: b.isFlagship,
      active: true,
      hours: b.hours.map((h) => ({ _key: key(), _type: 'dayHours', ...h })),
      image: await imageField(client, b.image),
      gallery: await Promise.all(b.gallery.map((g) => imageField(client, g, true))),
    });
  }

  for (const s of SEED_SPACES) {
    docs.push({
      _id: s.id,
      _type: 'space',
      name: s.name,
      slug: slug(s.slug),
      type: s.type,
      branch: ref(s.branchId),
      description: s.description,
      capacity: s.capacity,
      sizeSqm: s.sizeSqm,
      amenities: s.amenityIds.map((id) => ({ _key: key(), ...ref(id) })),
      active: true,
      hourlyPrice: s.hourlyPrice,
      ...(s.dayPassPrice !== null ? { dayPassPrice: s.dayPassPrice } : {}),
      ...(s.poolSize !== null ? { poolSize: s.poolSize } : {}),
      images: await Promise.all(s.images.map((img) => imageField(client, img, true))),
    });
  }

  const st = SEED_SETTINGS;
  docs.push({
    _id: 'siteSettings',
    _type: 'siteSettings',
    businessName: st.businessName,
    tagline: st.tagline,
    whatsappNumber: st.whatsappNumber,
    whatsappMessage: st.whatsappMessage,
    vatRate: st.vatRate,
    autoDiscountMinHours: st.autoDiscountMinHours,
    autoDiscountPercent: st.autoDiscountPercent,
    legalCompanyName: st.legal.companyName,
    legalCompanyId: st.legal.companyId,
    legalAddress: st.legal.address,
    legalEmail: st.legal.email,
    accessibilityCoordinator: st.legal.accessibilityCoordinator,
    accessibilityPhone: st.legal.accessibilityPhone,
    legalIsDemo: st.legal.isDemo,
  });

  docs.push({
    _id: 'seo',
    _type: 'seo',
    metaTitle: SEED_SEO.metaTitle,
    metaDescription: SEED_SEO.metaDescription,
    ...(SEED_SEO.shareImage ? { shareImage: await imageField(client, SEED_SEO.shareImage) } : {}),
  });

  for (const draft of LEGAL_DRAFTS) {
    docs.push({
      _id: `legal-${draft.slug}`,
      _type: 'legal',
      title: draft.title,
      slug: slug(draft.slug),
      lawyerReviewed: false,
      content: draftToPortableText(draft),
    });
  }

  console.log(`• Writing ${docs.length} documents…`);
  const tx = client.transaction();
  for (const doc of docs) tx.createOrReplace(doc as { _id: string; _type: string });
  await tx.commit({ visibility: 'sync' });
  console.log('✓ Sanity seeded');
}

async function seedMirrors() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn('! Supabase not configured — skipping mirror sync');
    return;
  }
  const supabase = createSupabaseClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await syncMirrors(supabase, {
    branches: SEED_BRANCHES.map((b) => ({ id: b.id, slug: b.slug, name: b.name, active: true, hours: b.hours })),
    spaces: SEED_SPACES.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      type: s.type,
      branchId: s.branchId,
      poolSize: s.poolSize,
      active: true,
    })),
  });
  console.log(`✓ Supabase mirrors: ${result.branches} branches, ${result.spaces} spaces${result.skipped.length ? `, skipped ${result.skipped.join(', ')}` : ''}`);
}

async function main() {
  if (!mirrorOnly) await seedSanity();
  await seedMirrors();
}

main().catch((error) => {
  console.error('✗ Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
