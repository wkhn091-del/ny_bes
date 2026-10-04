import type { Space, SpaceType } from '@/lib/domain/types';

export interface LandingPage {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  lead: string;
  type: SpaceType;
  citySlug?: string;
  maxCapacity?: number;
  faqs: { q: string; a: string }[];
}

/** Search-intent pages: copy only. Spaces, prices and availability always come from the live catalog. */
export const LANDING_PAGES: LandingPage[] = [
  {
    slug: 'meeting-room-tel-aviv',
    title: 'חדר ישיבות לפי שעה בתל אביב — מחיר סופי, הזמנה מיידית',
    description: 'חדרי ישיבות לפי שעה בתל אביב עם מסך וציוד וידאו. רואים זמינות אמת, מחיר סופי כולל מע״מ, וביטול חינם עד 24 שעות לפני.',
    eyebrow: 'חדרי ישיבות · תל אביב',
    h1: 'חדר ישיבות בתל אביב, לשעה או לשתיים',
    lead: 'פגישת לקוח, ראיון או סדנה — בוחרים חדר, רואים מה פנוי ומקבלים אישור מיד. בלי טלפונים ובלי "נחזור אליך".',
    type: 'meetingRoom',
    citySlug: 'tel-aviv',
    faqs: [
      { q: 'יש מסך וציוד לשיחות וידאו?', a: 'הציוד של כל חדר מופיע בעמוד החדר תחת "מה יש בחלל". בחלק מהחדרים אפשר להוסיף עמדת וידאו ניידת בהזמנה.' },
      { q: 'אפשר להזמין לאותו יום?', a: 'כן, כל עוד יש שעות פנויות בלוח. ההזמנה מינימום שעה, ביחידות של חצי שעה.' },
    ],
  },
  {
    slug: 'private-office-day',
    title: 'משרד פרטי ליום או לשעה — דלת סגורה, מחיר קבוע',
    description: 'משרד פרטי שקט לשיחות רגישות ולעבודה מרוכזת, לשעה או ליום שלם במחיר קבוע. מחיר סופי כולל מע״מ.',
    eyebrow: 'משרדים פרטיים',
    h1: 'משרד פרטי, רק לימים שבאמת צריך',
    lead: 'שקט מלא לשיחות, למסמכים או לעבודה עמוקה — לשעה או ליום שלם במחיר קבוע, בלי חוזה שנתי.',
    type: 'privateOffice',
    faqs: [
      { q: 'מה ההבדל בין שעתי ליום שלם?', a: 'ביום שלם המחיר קבוע לכל שעות הסניף באותו יום — משתלם כשצריכים יותר מכמה שעות.' },
      { q: 'אפשר להזמין כמה ימים ברצף?', a: 'כל יום מוזמן בנפרד, עד 60 יום קדימה.' },
    ],
  },
  {
    slug: 'hot-desk',
    title: 'עמדת עבודה לפי שעה — בלי מנוי ובלי התחייבות',
    description: 'עמדה חמה באזור עבודה משותף, לפי שעה. רואים כמה עמדות פנויות עכשיו ומזמינים בדקה. מחיר סופי כולל מע״מ.',
    eyebrow: 'עמדות עבודה',
    h1: 'עמדת עבודה לשעה, בלי מנוי',
    lead: 'מגיעים, מתיישבים, עובדים. רואים כמה עמדות פנויות באמת ומשלמים רק על השעות שבחרתם.',
    type: 'hotDesk',
    faqs: [
      { q: 'אפשר להזמין לכמה אנשים יחד?', a: 'כן, אפשר לבחור כמה עמדות באותה הזמנה — עד המספר שמוצג בעמוד העמדה.' },
      { q: 'העמדה שמורה לי?', a: 'ההזמנה שומרת לכם מקום באזור העבודה המשותף לשעות שבחרתם.' },
    ],
  },
  {
    slug: 'interview-room',
    title: 'חדר לראיון עבודה או לפגישה קטנה — לפי שעה',
    description: 'חדר קטן ושקט לראיונות ולפגישות של עד 4 אנשים, לפי שעה. מחיר סופי כולל מע״מ וביטול חינם עד 24 שעות לפני.',
    eyebrow: 'ראיונות ופגישות קטנות',
    h1: 'חדר שקט לראיון או לפגישה של עד 4',
    lead: 'רושם מקצועי על המועמד או הלקוח — בלי לשכור משרד. בוחרים שעה, מגיעים, ומשלמים רק עליה.',
    type: 'meetingRoom',
    maxCapacity: 4,
    faqs: [
      { q: 'אפשר להזמין כמה ראיונות ברצף?', a: 'כן — פשוט בוחרים טווח שעות ארוך יותר. מ-4 שעות ומעלה יש הנחה אוטומטית על החדר.' },
      { q: 'המועמדים צריכים להירשם?', a: 'לא. רק מי שמזמין צריך חשבון.' },
    ],
  },
];

export function getLandingPage(slug: string): LandingPage | null {
  return LANDING_PAGES.find((p) => p.slug === slug) ?? null;
}

export function landingSpaces(page: LandingPage, spaces: Space[], branchCity: (branchId: string) => string | undefined): Space[] {
  return spaces
    .filter((s) => s.type === page.type)
    .filter((s) => !page.citySlug || branchCity(s.branchId) === page.citySlug)
    .filter((s) => !page.maxCapacity || s.capacity <= page.maxCapacity)
    .sort((a, b) => a.hourlyPrice - b.hourlyPrice);
}
