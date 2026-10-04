import 'server-only';
import { createClient, type SanityClient } from 'next-sanity';
import { env, requireEnv } from '@/lib/env.server';

let publicClient: SanityClient | null = null;
let freshClient: SanityClient | null = null;
let customersWriteClient: SanityClient | null = null;
let contentWriteClient: SanityClient | null = null;

/** Published content via the CDN — for cached catalog reads. */
export function getSanityPublicClient(): SanityClient {
  if (publicClient) return publicClient;
  const { NEXT_PUBLIC_SANITY_PROJECT_ID } = requireEnv('sanity', 'NEXT_PUBLIC_SANITY_PROJECT_ID');
  publicClient = createClient({
    projectId: NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION,
    useCdn: true,
    perspective: 'published',
  });
  return publicClient;
}

/** Uncached, token-authenticated reads — the price source of truth at checkout. */
export function getSanityFreshClient(): SanityClient {
  if (freshClient) return freshClient;
  const { NEXT_PUBLIC_SANITY_PROJECT_ID, SANITY_API_READ_TOKEN } = requireEnv(
    'sanity',
    'NEXT_PUBLIC_SANITY_PROJECT_ID',
    'SANITY_API_READ_TOKEN',
  );
  freshClient = createClient({
    projectId: NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION,
    token: SANITY_API_READ_TOKEN,
    useCdn: false,
    perspective: 'published',
  });
  return freshClient;
}

/** Writes lean customer cards to the private `customers` dataset. */
export function getSanityCustomersWriteClient(): SanityClient {
  if (customersWriteClient) return customersWriteClient;
  const { NEXT_PUBLIC_SANITY_PROJECT_ID, SANITY_API_WRITE_TOKEN } = requireEnv(
    'sanity',
    'NEXT_PUBLIC_SANITY_PROJECT_ID',
    'SANITY_API_WRITE_TOKEN',
  );
  customersWriteClient = createClient({
    projectId: NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.SANITY_CUSTOMERS_DATASET,
    apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION,
    token: SANITY_API_WRITE_TOKEN,
    useCdn: false,
  });
  return customersWriteClient;
}

/** Content dataset writes (seed script only). */
export function getSanityContentWriteClient(): SanityClient {
  if (contentWriteClient) return contentWriteClient;
  const { NEXT_PUBLIC_SANITY_PROJECT_ID, SANITY_API_WRITE_TOKEN } = requireEnv(
    'sanity',
    'NEXT_PUBLIC_SANITY_PROJECT_ID',
    'SANITY_API_WRITE_TOKEN',
  );
  contentWriteClient = createClient({
    projectId: NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: env.NEXT_PUBLIC_SANITY_API_VERSION,
    token: SANITY_API_WRITE_TOKEN,
    useCdn: false,
  });
  return contentWriteClient;
}
