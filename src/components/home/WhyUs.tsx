import { BadgeCheck, CalendarClock, Check, Minus, ReceiptText, Undo2 } from 'lucide-react';
import { FREE_CANCELLATION_HOURS } from '@/lib/domain/booking-rules';

const PILLARS = [
  {
    icon: ReceiptText,
    title: 'המספר שרואים — זה המספר שמשלמים',
    text: 'כל מחיר כולל מע״מ ותוספות שבחרתם. בלי "+ מע״מ", בלי "החל מ־" שמשתנה בטלפון.',
  },
  {
    icon: CalendarClock,
    title: 'זמינות אמת, הזמנה בדקה',
    text: 'לא "השאירו פרטים ונחזור אליכם". רואים מה פנוי עכשיו, בוחרים שעות ומקבלים אישור מיד.',
  },
  {
    icon: Undo2,
    title: `ביטול חינם עד ${FREE_CANCELLATION_HOURS} שעות לפני`,
    text: 'התוכניות השתנו? מבטלים מהחשבון בלחיצה ומקבלים החזר מלא. התנאים מוצגים לפני התשלום, לא אחריו.',
  },
  {
    icon: BadgeCheck,
    title: 'משלמים רק על הזמן שצריך',
    text: 'מינימום שעה, ביחידות של חצי שעה. בלי מנוי, בלי דמי הרשמה ובלי חוזה.',
  },
] as const;

const ROWS: { label: string; us: string; usual: string }[] = [
  { label: 'מחיר מוצג', us: 'סופי, כולל מע״מ', usual: 'לרוב "החל מ־" ולפני מע״מ' },
  { label: 'זמינות', us: 'בזמן אמת, לפי חצי שעה', usual: 'לרוב "שלחו הודעה" ומחכים לתשובה' },
  { label: 'אישור הזמנה', us: 'מיידי, במייל ובקובץ ליומן', usual: 'אחרי שיחה או מייל חוזר' },
  { label: 'תנאי ביטול', us: `מוצגים מראש · חינם עד ${FREE_CANCELLATION_HOURS} שעות`, usual: 'נקבעים מול בעל המקום' },
];

/** Market comparison stays brand-free on purpose: categories only, each claim backed by dated sources in docs/script2/D. */
export function WhyUs() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="why-title">
      <p className="text-sm font-semibold text-accent-text">למה SpaceHub</p>
      <h2 id="why-title" className="mt-2 max-w-2xl text-3xl font-bold tracking-tight">
        למה להזמין כאן, ולא להתקשר ולחכות שיחזרו אליכם?
      </h2>

      <ul className="reveal mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((p) => (
          <li key={p.title} className="rounded-2xl border border-border bg-card p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
              <p.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold leading-snug">{p.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{p.text}</p>
          </li>
        ))}
      </ul>

      <div className="reveal mt-12 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="px-5 pt-5 text-start text-base font-semibold">
            ההבדל במבט אחד
            <span className="mt-1 block text-xs font-normal text-muted">השוואה כללית לדרך המקובלת בשוק (מאגרי חללים וטפסי פנייה), נכון לאוקטובר 2026.</span>
          </caption>
          <thead>
            <tr className="border-b border-border text-start">
              <th scope="col" className="px-5 py-3 text-start font-medium text-muted">
                <span className="sr-only">נושא</span>
              </th>
              <th scope="col" className="px-5 py-3 text-start font-semibold text-accent-text">
                SpaceHub
              </th>
              <th scope="col" className="px-5 py-3 text-start font-medium text-muted">
                הדרך המקובלת
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-b border-border last:border-0">
                <th scope="row" className="px-5 py-3.5 text-start font-medium">
                  {r.label}
                </th>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    {r.us}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-muted">
                  <span className="inline-flex items-center gap-2">
                    <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {r.usual}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
