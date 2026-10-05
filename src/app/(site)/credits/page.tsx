import type { Metadata } from 'next';
import { CREDITS } from '@/content/credits';

export const metadata: Metadata = {
  title: 'קרדיטים',
  description: 'מודלים תלת־ממדיים של יוצרים אחרים שמופיעים באתר, ברישיון שמחייב ייחוס.',
  alternates: { canonical: '/credits' },
};

export default function CreditsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14" aria-labelledby="credits-title">
      <h1 id="credits-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
        קרדיטים
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
        חלק מהמודלים בסיור התלת־ממדי נוצרו על ידי יוצרים אחרים ומופיעים כאן ברישיון Creative Commons שמחייב ייחוס. שינינו אותם
        כדי שיתאימו לאתר (הקטנה, דחיסה ותאורה), והם לא מייצגים סניף אמיתי.
      </p>
      <ul className="mt-8 space-y-4">
        {CREDITS.map((c) => (
          <li key={c.source} className="rounded-2xl border border-border p-4 sm:p-5">
            <p className="font-semibold" dir="ltr">
              <a href={c.source} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-4 hover:decoration-current">
                “{c.title}”
              </a>{' '}
              by{' '}
              <a href={c.authorUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-4 hover:decoration-current">
                {c.author}
              </a>
              , licensed under{' '}
              <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-border underline-offset-4 hover:decoration-current">
                {c.license}
              </a>
            </p>
            <p className="mt-1.5 text-sm text-muted">{c.use}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
