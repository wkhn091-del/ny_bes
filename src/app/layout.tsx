import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import { headers } from 'next/headers';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { getCatalog } from '@/lib/content/catalog';
import { publicEnv } from '@/lib/env.public';
import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const { seo, settings } = await getCatalog().catch(() => ({ seo: null, settings: null }));
  const title = seo?.metaTitle ?? 'SpaceHub — חללי עבודה גמישים';
  const description = seo?.metaDescription ?? 'הזמנת חדרי ישיבות, משרדים ועמדות עבודה לפי שעה.';
  return {
    metadataBase: new URL(publicEnv.siteUrl),
    title: { default: title, template: `%s | ${settings?.businessName ?? 'SpaceHub'}` },
    description,
    applicationName: 'SpaceHub',
    openGraph: {
      type: 'website',
      locale: 'he_IL',
      siteName: settings?.businessName ?? 'SpaceHub',
      title,
      description,
      images: seo?.shareImage ? [{ url: seo.shareImage.url, alt: seo.shareImage.alt }] : undefined,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-bg font-sans text-fg">
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
