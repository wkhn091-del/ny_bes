import { Analytics } from '@vercel/analytics/next';
import { DemoBanner } from '@/components/layout/DemoBanner';
import { Footer } from '@/components/layout/Footer';
import { Navbar } from '@/components/layout/Navbar';
import { WhatsAppButton } from '@/components/layout/WhatsAppButton';
import { ConsentAnalytics } from '@/components/analytics/ConsentAnalytics';
import { getCatalog, isUsingSeedContent } from '@/lib/content/catalog';
import { publicEnv } from '@/lib/env.public';

export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const catalog = await getCatalog();
  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner legalDemo={catalog.settings.legal.isDemo} seedContent={isUsingSeedContent()} />
      <Navbar />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer catalog={catalog} />
      <WhatsAppButton number={catalog.settings.whatsappNumber} message={catalog.settings.whatsappMessage} />
      <Analytics />
      {publicEnv.ga4Id && <ConsentAnalytics measurementId={publicEnv.ga4Id} />}
    </div>
  );
}
