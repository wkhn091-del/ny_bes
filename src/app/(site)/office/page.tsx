import type { Metadata } from 'next';
import { DeskShowcase } from '@/components/office/DeskShowcase';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'משרד פרטי בתלת־ממד',
  description: 'היכנסו להדמיה תלת־ממדית של משרד פרטי: הסתכלו מסביב, הסתובבו בחדר, ואז בדקו מה פנוי היום.',
  alternates: { canonical: '/office' },
};

export default function OfficePage() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:py-14" aria-labelledby="office-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
        <div>
          <h1 id="office-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
            היכנסו למשרד
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">
            הדמיה של משרד פרטי. נכנסים בדלת, מסתכלים מסביב ומסתובבים בחדר, ואז בודקים מה פנוי היום בסניף שנוח לכם.
          </p>
        </div>
        <ButtonLink href="/spaces?type=privateOffice">למשרדים הפנויים</ButtonLink>
      </div>
      <DeskShowcase className="h-[64svh] min-h-[360px] sm:h-[min(78vh,760px)] sm:min-h-[460px]" />
      <p className="mt-3 text-xs text-muted">
        ההדמיה ממחישה משרד פרטי. המידות, הריהוט והציוד בכל סניף מפורטים בעמוד החלל.
      </p>
    </section>
  );
}
