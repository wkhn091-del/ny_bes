import type { Metadata } from 'next';
import { DeskShowcase } from '@/components/office/DeskShowcase';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'עמדת עבודה בתלת־ממד',
  description: 'הדמיה תלת־ממדית של עמדת עבודה. סובבו, התקרבו, ואז בדקו אילו עמדות פנויות היום.',
  alternates: { canonical: '/office' },
};

export default function OfficePage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14" aria-labelledby="office-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="office-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            עמדת עבודה, מכל זווית
          </h1>
          <p className="mt-2 max-w-xl text-muted">הדמיה של עמדה. סובבו והתקרבו, ואז בדקו מה פנוי היום בסניף שנוח לכם.</p>
        </div>
        <ButtonLink href="/spaces?type=hotDesk">לעמדות הפנויות</ButtonLink>
      </div>
      <DeskShowcase className="h-[min(72vh,680px)] min-h-[420px]" />
      <p className="mt-3 text-xs text-muted">
        ההדמיה ממחישה עמדת עבודה. הציוד בכל סניף מפורט בעמוד החלל.
      </p>
    </section>
  );
}
