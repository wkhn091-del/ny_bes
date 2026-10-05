import type { Metadata } from 'next';
import { CREDITS } from '@/content/credits';
import { MUSIC_ARTIST, MUSIC_LICENSE, PLAYLISTS } from '@/content/music';

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

      <h2 className="mt-12 text-xl font-bold sm:text-2xl">מוזיקת רקע</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        המוזיקה בסיור היא של{' '}
        <a href={MUSIC_ARTIST.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="underline decoration-border underline-offset-4 hover:decoration-current">
          {MUSIC_ARTIST.name}
        </a>
        , שמשחרר אותה לנחלת הכלל ברישיון{' '}
        <a href={MUSIC_LICENSE.licenseUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="underline decoration-border underline-offset-4 hover:decoration-current">
          {MUSIC_LICENSE.license}
        </a>
        . הרישיון לא מחייב ייחוס, אבל מגיע לו. השירים דחוסים ועם עוצמה אחידה.
      </p>
      {(['day', 'night'] as const).map((mood) => (
        <div key={mood} className="mt-5">
          <h3 className="text-sm font-semibold">{mood === 'day' ? 'ביום' : 'בלילה'}</h3>
          <ul className="mt-2 flex flex-wrap gap-2" dir="ltr">
            {PLAYLISTS[mood].map((t) => (
              <li key={t.src}>
                <a href={t.source} target="_blank" rel="noopener noreferrer" className="inline-block rounded-full border border-border px-3 py-1 text-sm hover:bg-subtle">
                  {t.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
