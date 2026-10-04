import { ArrowLeft, BadgeCheck, CalendarCheck, CreditCard, MousePointerClick, ShieldCheck, Timer } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { FloorMap } from '@/components/home/FloorMap';
import { StickyCta } from '@/components/home/StickyCta';
import { WhyUs } from '@/components/home/WhyUs';
import { SearchBar } from '@/components/search/SearchBar';
import { ButtonLink } from '@/components/ui/Button';
import { getCatalog } from '@/lib/content/catalog';
import { calculatePrice, formatIls } from '@/lib/domain/pricing';
import { BOOKING_WINDOW_DAYS, maxBookableDate, nextOpenDate, nowInIsrael } from '@/lib/domain/time';
import { SPACE_TYPES, SPACE_TYPE_LABELS, type SpaceType } from '@/lib/domain/types';
import { FREE_CANCELLATION_HOURS } from '@/lib/domain/booking-rules';

const TYPE_COPY: Record<SpaceType, { pitch: string; unit: string }> = {
  hotDesk: { pitch: 'מגיעים, מתיישבים, עובדים. בלי התחייבות חודשית.', unit: 'לשעה לעמדה' },
  privateOffice: { pitch: 'דלת סגורה לשקט ולשיחות רגישות — לשעה או ליום שלם.', unit: 'לשעה' },
  meetingRoom: { pitch: 'מסך, לוח וציוד וידאו. מושלם לפגישת לקוח או לסדנה.', unit: 'לשעה' },
};

export default async function HomePage() {
  const catalog = await getCatalog();
  const { cities, branches, spaces, settings } = catalog;
  const today = nowInIsrael().date;
  const flagship = branches.find((b) => b.isFlagship) ?? branches[0];

  const typeSummaries = SPACE_TYPES.map((type) => {
    const ofType = spaces.filter((s) => s.type === type);
    return {
      type,
      count: ofType.length,
      fromPrice: ofType.length ? Math.min(...ofType.map((s) => s.hourlyPrice)) : null,
      image: ofType[0]?.images[0] ?? null,
      dayPassFrom: type === 'privateOffice' ? Math.min(...ofType.map((s) => s.dayPassPrice ?? Infinity)) : null,
    };
  }).filter((t) => t.count > 0);

  const exampleSpace = spaces
    .filter((s) => s.type === 'meetingRoom')
    .sort((a, b) => a.hourlyPrice - b.hourlyPrice)[0];
  const quote = (hours: number) =>
    exampleSpace
      ? calculatePrice({ space: exampleSpace, durationMinutes: hours * 60, isDayPass: false, seats: 1, addons: [], coupon: null, settings })
      : null;
  const twoHours = quote(2);
  const longBooking = quote(settings.autoDiscountMinHours);
  const priceExample =
    exampleSpace && twoHours && longBooking && longBooking.autoDiscount > 0
      ? {
          name: exampleSpace.name,
          slug: exampleSpace.slug,
          branch: branches.find((b) => b.id === exampleSpace.branchId)?.name ?? '',
          hourly: exampleSpace.hourlyPrice,
          discounted: longBooking.total,
          fullLong: longBooking.base,
        }
      : null;

  const faqs = [
    {
      q: 'עד מתי אפשר לבטל?',
      a: `ביטול עד ${FREE_CANCELLATION_HOURS} שעות לפני תחילת ההזמנה מזכה בהחזר מלא. גם אם הזמנתם ברגע האחרון, יש לכם 5 דקות מרגע התשלום לבטל בהחזר מלא. פחות מ-${FREE_CANCELLATION_HOURS} שעות לפני — אפשר לשחרר את החדר לאחרים, ללא החזר.`,
    },
    {
      q: 'המחיר שאני רואה הוא המחיר הסופי?',
      a: `כן. כל המחירים באתר כוללים מע״מ (${Math.round(settings.vatRate * 100)}%), והסכום בסיכום ההזמנה הוא בדיוק הסכום שיחויב. אין עמלות נסתרות.`,
    },
    {
      q: 'יש הנחה להזמנות ארוכות?',
      a: `בחדרי ישיבות ובמשרדים פרטיים, הזמנה של ${settings.autoDiscountMinHours} שעות ומעלה מקבלת ${settings.autoDiscountPercent}% הנחה אוטומטית על מחיר החדר. במשרד פרטי אפשר גם לבחור "יום שלם" במחיר קבוע. אם יש לכם קופון — תקבלו את ההנחה הגבוהה מבין השתיים.`,
    },
    {
      q: 'מה שעות הפעילות?',
      a: 'בימים א׳–ה׳ לפי שעות הסניף (מופיעות בעמוד כל סניף), בימי שישי עד 13:00, ובשבת הסניפים סגורים.',
    },
    {
      q: 'איך אני מקבל אישור וחשבונית?',
      a: 'מיד לאחר התשלום נשלח אליכם אישור הזמנה במייל, כולל קובץ להוספה ליומן. אפשר להזין שם חברה וח.פ בעת ההזמנה.',
    },
    {
      q: `כמה זמן מראש אפשר להזמין?`,
      a: `עד ${BOOKING_WINDOW_DAYS} יום קדימה, ביחידות של חצי שעה ולמינימום של שעה.`,
    },
    {
      q: 'צריך מנוי או חברות כדי להזמין?',
      a: 'לא. אין מנוי, אין דמי הרשמה ואין חוזה. נכנסים עם קוד למייל (או Google), מזמינים ומשלמים רק על ההזמנה.',
    },
    {
      q: 'אפשר לבטל בעצמי?',
      a: `כן, מתוך "ההזמנות שלי" בחשבון. עד ${FREE_CANCELLATION_HOURS} שעות לפני — החזר מלא אוטומטי לאמצעי התשלום.`,
    },
  ];

  return (
    <>
      <section className="grid-backdrop hero-glow overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pb-24 lg:pt-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              {branches.length} סניפים ב-{cities.length} ערים · זמינות בזמן אמת
            </p>
            <h1 className="text-[2.5rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              חלל העבודה הבא שלך,
              <br />
              <span className="text-accent-text">מוזמן תוך דקה.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
              חדרי ישיבות, משרדים פרטיים ועמדות עבודה לפי שעה. רואים מה פנוי עכשיו, יודעים את המחיר הסופי מראש, ומשלמים
              רק על הזמן שצריך.
            </p>
            <div className="mt-8" id="hero-search">
              <SearchBar cities={cities} minDate={today} maxDate={maxBookableDate()} defaultDate={flagship ? nextOpenDate(flagship) : today} />
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-accent-text" aria-hidden="true" />
                ביטול חינם עד {FREE_CANCELLATION_HOURS} שעות לפני
              </li>
              <li className="flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-accent-text" aria-hidden="true" />
                מחיר סופי כולל מע״מ
              </li>
              <li className="flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-accent-text" aria-hidden="true" />
                תשלום מאובטח ב-Stripe
              </li>
            </ul>
          </div>
          <div className="h-[460px] sm:h-[500px] lg:h-[560px]">
            <FloorMap initial={null} />
          </div>
        </div>
      </section>

      {priceExample && (
        <section className="border-b border-border" aria-labelledby="price-title">
          <div className="reveal mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-accent-text">בלי הפתעות בקופה</p>
              <h2 id="price-title" className="mt-2 text-3xl font-bold tracking-tight">
                המחיר שרואים הוא המחיר שמשלמים
              </h2>
              <p className="mt-3 max-w-lg leading-7 text-muted">
                כל מחיר באתר כולל מע״מ. בוחרים שעות, והסכום מתעדכן מול העיניים — כולל תוספות והנחות — לפני שמגיעים לתשלום.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <p className="text-sm text-muted">
                דוגמה אמיתית מהמחירון: <span className="font-semibold text-fg">{priceExample.name}</span>, {priceExample.branch}
              </p>
              <dl className="mt-4 divide-y divide-border text-sm">
                <div className="flex items-center justify-between py-3">
                  <dt>2 שעות × {formatIls(priceExample.hourly)}</dt>
                  <dd className="font-semibold">{formatIls(priceExample.hourly * 2)}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt>
                    {settings.autoDiscountMinHours} שעות, עם {settings.autoDiscountPercent}% הנחה אוטומטית
                  </dt>
                  <dd className="text-left">
                    <span className="font-semibold text-accent-text">{formatIls(priceExample.discounted)}</span>
                    <span className="ms-2 text-xs text-muted">במקום {formatIls(priceExample.fullLong)}</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt>עמלות, דמי הזמנה או חיוב נוסף</dt>
                  <dd className="font-semibold">אין</dd>
                </div>
              </dl>
              <ButtonLink href={`/spaces/${priceExample.slug}`} className="mt-4 w-full">
                לבדוק זמינות בחדר הזה
              </ButtonLink>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="types-title">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <h2 id="types-title" className="text-3xl font-bold tracking-tight">
              מה צריך היום?
            </h2>
            <p className="mt-2 text-muted">שלושה סוגי חללים, מחיר שקוף לכל אחד.</p>
          </div>
          <Link href="/spaces" className="hidden items-center gap-1 text-sm font-semibold text-accent-text hover:underline sm:flex">
            לכל החללים <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="reveal grid gap-5 md:grid-cols-3">
          {typeSummaries.map((t) => (
            <Link
              key={t.type}
              href={`/spaces?type=${t.type}`}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-accent"
            >
              {t.image && (
                <div className="relative aspect-[16/10] overflow-hidden">
                  <Image src={t.image.url} alt={t.image.alt} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                </div>
              )}
              <div className="p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">{SPACE_TYPE_LABELS[t.type]}</h3>
                  {t.fromPrice !== null && (
                    <p className="text-sm">
                      <span className="text-muted">החל מ-</span>
                      <span className="font-bold">{formatIls(t.fromPrice)}</span>
                      <span className="text-muted"> {TYPE_COPY[t.type].unit}</span>
                    </p>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{TYPE_COPY[t.type].pitch}</p>
                {t.dayPassFrom !== null && Number.isFinite(t.dayPassFrom) && (
                  <p className="mt-2 text-xs font-medium text-accent-text">יום שלם במחיר קבוע: {formatIls(t.dayPassFrom)}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-subtle" aria-labelledby="how-title">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 id="how-title" className="text-3xl font-bold tracking-tight">
            שלושה צעדים, בלי טלפונים
          </h2>
          <ol className="reveal mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: MousePointerClick, title: 'בוחרים חלל', text: 'מסננים לפי עיר, מחיר, גודל וציוד — ורואים רק מה שבאמת פנוי.' },
              { icon: CalendarCheck, title: 'מסמנים שעות', text: 'שעות תפוסות חסומות בלוח. המחיר מתעדכן מול העיניים, כולל תוספות.' },
              { icon: Timer, title: 'משלמים ומגיעים', text: 'אישור במייל מיד, תזכורת שעתיים לפני, ואפשר להוסיף ליומן בלחיצה.' },
            ].map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-sm text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <WhyUs />

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="branches-title">
        <h2 id="branches-title" className="text-3xl font-bold tracking-tight">
          הסניפים שלנו
        </h2>
        <p className="mt-2 text-muted">כולם קרובים לתחבורה ציבורית.</p>
        <div className="reveal mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => {
            const count = spaces.filter((s) => s.branchId === branch.id).length;
            return (
              <Link
                key={branch.id}
                href={`/branches/${branch.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-border"
              >
                <div className="relative aspect-[16/10]">
                  <Image src={branch.image.url} alt={branch.image.alt} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-xs opacity-80">{branch.city.name}</p>
                  <h3 className="text-xl font-bold">
                    {branch.name}
                    {branch.isFlagship && <span className="mr-2 rounded-full bg-accent px-2 py-0.5 align-middle text-[11px] font-semibold">סניף הדגל</span>}
                  </h3>
                  <p className="mt-1 text-sm opacity-85">
                    {branch.address} · {count} חללים
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {flagship && (
        <section className="border-y border-border bg-subtle" aria-labelledby="about-title">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border">
              <Image src={flagship.image.url} alt={flagship.image.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            </div>
            <div>
              <p className="text-sm font-semibold text-accent-text">על SpaceHub</p>
              <h2 id="about-title" className="mt-2 text-3xl font-bold tracking-tight">
                נבנה בשביל מי שאין לו זמן לחכות
              </h2>
              <p className="mt-4 leading-8 text-muted">
                פרילנסרים, יזמים וצוותים קטנים לא צריכים חוזה לשנה — הם צריכים חדר טוב, עכשיו. לכן כל מה שמוצג באתר
                מגיע ישירות ממערכת ההזמנות: אם כתוב שחדר פנוי, הוא פנוי. אם כתוב מחיר, זה המחיר.
              </p>
              <p className="mt-3 leading-8 text-muted">{flagship.description}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={`/branches/${flagship.slug}`}>לסניף {flagship.name}</ButtonLink>
                <ButtonLink href="/spaces" variant="outline">
                  לכל החללים
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-center text-3xl font-bold tracking-tight">
          שאלות נפוצות
        </h2>
        <div className="mt-10 divide-y divide-border rounded-2xl border border-border bg-card">
          {faqs.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <span className="text-xl text-muted transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6" aria-labelledby="cta-title">
        <div className="reveal relative mx-auto max-w-7xl overflow-hidden rounded-3xl bg-zinc-950 px-6 py-14 text-center text-white sm:px-12 dark:border dark:border-border">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(124,58,237,0.55),transparent_60%)]"
            aria-hidden="true"
          />
          <div className="relative">
            <h2 id="cta-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
              החדר הבא שלך מחכה במפה
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-white/75">
              בוחרים סניף ושעות, רואים את הסכום הסופי, ומשלמים. ביטול חינם עד {FREE_CANCELLATION_HOURS} שעות לפני.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/spaces" size="lg">
                מה פנוי עכשיו?
              </ButtonLink>
              <ButtonLink href={flagship ? `/branches/${flagship.slug}` : '/spaces'} size="lg" variant="outline" className="border-white/25 bg-transparent text-white hover:border-white">
                {flagship ? `לסניף ${flagship.name}` : 'לכל הסניפים'}
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <StickyCta />
    </>
  );
}
