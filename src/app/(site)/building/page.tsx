import type { Metadata } from 'next';
import { BuildingShowcase } from '@/components/building/BuildingShowcase';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'סיור בבניין בתלת־ממד',
  description: 'הדמיה תלת־ממדית של מגדל משרדים: בחרו קומה, היא נפתחת, ורואים עמדות עבודה, משרדים פרטיים וחדרי ישיבות.',
  alternates: { canonical: '/building' },
};

export default function BuildingPage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:py-14" aria-labelledby="building-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
        <div>
          <h1 id="building-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            סיור בבניין
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
            הדמיה של מגדל משרדים עם 23 קומות. בחרו קומה, החזית שלה נפתחת, ורואים מה יש בפנים: עמדות, משרדים פרטיים או חדרי
            ישיבות.
          </p>
        </div>
        <ButtonLink href="/spaces">מה פנוי עכשיו?</ButtonLink>
      </div>
      <BuildingShowcase className="h-[70svh] min-h-[420px] sm:h-[min(82vh,800px)] sm:min-h-[560px]" />
      <p className="mt-3 text-xs text-muted">
        ההדמיה ממחישה את סוגי החללים. הסניפים שלנו נמצאים בבניינים שונים, והפרטים של כל סניף מופיעים בעמוד שלו.
      </p>
    </section>
  );
}
