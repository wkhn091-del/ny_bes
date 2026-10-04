import type {
  Addon,
  Amenity,
  Branch,
  City,
  DayHours,
  ImageRef,
  SeoSettings,
  SiteSettings,
  Space,
} from '@/lib/domain/types';
import { RENDER_ALT_MARKER, RENDER_PREFIX } from '@/lib/domain/images';

/**
 * Demo content. Used (a) by `npm run seed` to populate Sanity + the Supabase mirrors and
 * (b) as a read-only fallback when Sanity is not configured in local development.
 * Every business detail here is DEMO data and must be replaced before going live.
 */

const render = (slug: string, alt: string): ImageRef => ({ url: `${RENDER_PREFIX}${slug}.webp`, alt: `${alt} ${RENDER_ALT_MARKER}` });

/** One illustrative render per space, keyed by space slug. Never reuse an image for a different space. */
export const IMAGES = {
  'tlv-rothschild-hot-desk': render('tlv-rothschild-hot-desk', 'רוטשילד — קומת עבודה פתוחה עם תקרת עץ ומשרדי זכוכית'),
  'tlv-rothschild-office-a': render('tlv-rothschild-office-a', 'רוטשילד — משרד זכוכית ל-3 עם נוף לעצי השדרה'),
  'tlv-rothschild-office-b': render('tlv-rothschild-office-b', 'רוטשילד — משרד פינתי עם חלונות לשדרה'),
  'tlv-rothschild-meeting-small': render('tlv-rothschild-meeting-small', 'רוטשילד — חדר ישיבות זכוכית ל-4 עם מסך ומצלמת וידאו'),
  'tlv-rothschild-meeting-large': render('tlv-rothschild-meeting-large', 'רוטשילד — חדר ישיבות ל-10 עם מקרן, מסך ולוח'),
  'tlv-sarona-hot-desk': render('tlv-sarona-hot-desk', 'שרונה — אזור עבודה פתוח בקומה גבוהה עם נוף לקו הרקיע'),
  'tlv-sarona-office-a': render('tlv-sarona-office-a', 'שרונה — משרד פרטי ל-3 עם שולחן עמידה ונוף למגדלים'),
  'tlv-sarona-meeting-small': render('tlv-sarona-meeting-small', 'שרונה — חדר ישיבות זכוכית ל-4 עם קיר צמחייה'),
  'tlv-sarona-meeting-large': render('tlv-sarona-meeting-large', 'שרונה — חדר ישיבות ל-10 עם נוף לעיר'),
  'jerusalem-center-hot-desk': render('jerusalem-center-hot-desk', 'ירושלים — אזור עבודה פתוח בבניין אבן עם חלונות קשתיים'),
  'jerusalem-center-office-a': render('jerusalem-center-office-a', 'ירושלים — משרד פרטי ל-3 עם קיר אבן ירושלמית'),
  'jerusalem-center-meeting-small': render('jerusalem-center-meeting-small', 'ירושלים — חדר ישיבות ל-4 תחת תקרת אבן מקומרת'),
  'haifa-port-hot-desk': render('haifa-port-hot-desk', 'חיפה — אזור עבודה פתוח במבנה תעשייתי עם נוף לנמל'),
  'haifa-port-office-a': render('haifa-port-office-a', 'חיפה — משרד פרטי ל-3 עם חלון גדול לנמל ולים'),
  'haifa-port-meeting-large': render('haifa-port-meeting-large', 'חיפה — חדר ישיבות ל-10 עם נוף לנמל'),
  'beer-sheva-gav-yam-hot-desk': render('beer-sheva-gav-yam-hot-desk', 'באר שבע — אזור עבודה פתוח בפארק ההייטק'),
  'beer-sheva-gav-yam-office-a': render('beer-sheva-gav-yam-office-a', 'באר שבע — משרד פרטי ל-3 עם שולחן עמידה'),
  'beer-sheva-gav-yam-meeting-small': render('beer-sheva-gav-yam-meeting-small', 'באר שבע — חדר ישיבות ל-4 עם נוף למדבר'),
} satisfies Record<string, ImageRef>;

type SpaceImageKey = keyof typeof IMAGES;
const imageOf = (slug: string): ImageRef => {
  const image = IMAGES[slug as SpaceImageKey];
  if (!image) throw new Error(`seed: missing image for ${slug}`);
  return image;
};
const branchImages = (branchSlug: string): ImageRef[] =>
  (Object.keys(IMAGES) as SpaceImageKey[]).filter((k) => k.startsWith(`${branchSlug}-`)).map((k) => IMAGES[k]);

const STANDARD_HOURS: DayHours[] = [
  { day: 0, closed: false, open: '08:00', close: '20:00' },
  { day: 1, closed: false, open: '08:00', close: '20:00' },
  { day: 2, closed: false, open: '08:00', close: '20:00' },
  { day: 3, closed: false, open: '08:00', close: '20:00' },
  { day: 4, closed: false, open: '08:00', close: '20:00' },
  { day: 5, closed: false, open: '08:00', close: '13:00' },
  { day: 6, closed: true, open: '08:00', close: '13:00' },
];

const EARLY_HOURS: DayHours[] = STANDARD_HOURS.map((h) =>
  h.day <= 4 ? { ...h, open: '07:30', close: '19:00' } : h,
);

export const SEED_CITIES: City[] = [
  { id: 'city-tel-aviv', slug: 'tel-aviv', name: 'תל אביב' },
  { id: 'city-jerusalem', slug: 'jerusalem', name: 'ירושלים' },
  { id: 'city-haifa', slug: 'haifa', name: 'חיפה' },
  { id: 'city-beer-sheva', slug: 'beer-sheva', name: 'באר שבע' },
];

const city = (slug: string) => SEED_CITIES.find((c) => c.slug === slug)!;

export const SEED_BRANCHES: Branch[] = [
  {
    id: 'branch-tlv-rothschild',
    slug: 'tlv-rothschild',
    name: 'רוטשילד',
    city: city('tel-aviv'),
    address: 'שדרות רוטשילד 22, תל אביב',
    wazeUrl: 'https://waze.com/ul?q=%D7%A9%D7%93%D7%A8%D7%95%D7%AA%20%D7%A8%D7%95%D7%98%D7%A9%D7%99%D7%9C%D7%93%2022%20%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91&navigate=yes',
    phone: '03-0000001',
    description:
      'סניף הדגל שלנו בלב השדרה: קומה פתוחה עם תקרת עץ, משרדי זכוכית שקטים וחדרי ישיבות לצוותים. חמש דקות הליכה מתחנת הרכבת הקלה.',
    image: imageOf('tlv-rothschild-hot-desk'),
    gallery: branchImages('tlv-rothschild'),
    hours: STANDARD_HOURS,
    isFlagship: true,
  },
  {
    id: 'branch-tlv-sarona',
    slug: 'tlv-sarona',
    name: 'שרונה',
    city: city('tel-aviv'),
    address: 'רחוב קפלן 20, תל אביב',
    wazeUrl: 'https://waze.com/ul?q=%D7%A7%D7%A4%D7%9C%D7%9F%2020%20%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91&navigate=yes',
    phone: '03-0000002',
    description: 'ליד מתחם שרונה ומגדלי ההייטק. אידיאלי לפגישות לקוח ולצוותים שצריכים חדר מאובזר לכמה שעות.',
    image: imageOf('tlv-sarona-hot-desk'),
    gallery: branchImages('tlv-sarona'),
    hours: STANDARD_HOURS,
    isFlagship: false,
  },
  {
    id: 'branch-jerusalem',
    slug: 'jerusalem-center',
    name: 'מרכז העיר',
    city: city('jerusalem'),
    address: 'רחוב יפו 97, ירושלים',
    wazeUrl: 'https://waze.com/ul?q=%D7%99%D7%A4%D7%95%2097%20%D7%99%D7%A8%D7%95%D7%A9%D7%9C%D7%99%D7%9D&navigate=yes',
    phone: '02-0000003',
    description: 'קרוב לתחנת הרכבת הקלה ולשוק. חלל שקט לעבודה מרוכזת עם חדרי ישיבות לצוותים קטנים.',
    image: imageOf('jerusalem-center-hot-desk'),
    gallery: branchImages('jerusalem-center'),
    hours: STANDARD_HOURS,
    isFlagship: false,
  },
  {
    id: 'branch-haifa',
    slug: 'haifa-port',
    name: 'נמל',
    city: city('haifa'),
    address: 'דרך העצמאות 40, חיפה',
    wazeUrl: 'https://waze.com/ul?q=%D7%93%D7%A8%D7%9A%20%D7%94%D7%A2%D7%A6%D7%9E%D7%90%D7%95%D7%AA%2040%20%D7%97%D7%99%D7%A4%D7%94&navigate=yes',
    phone: '04-0000004',
    description: 'ליד תחנת חיפה מרכז השמונה. חלל מואר עם נוף לנמל, נפתח מוקדם בבוקר.',
    image: imageOf('haifa-port-hot-desk'),
    gallery: branchImages('haifa-port'),
    hours: EARLY_HOURS,
    isFlagship: false,
  },
  {
    id: 'branch-beer-sheva',
    slug: 'beer-sheva-gav-yam',
    name: 'גב-ים',
    city: city('beer-sheva'),
    address: 'רחוב הנחושת 2, באר שבע',
    wazeUrl: 'https://waze.com/ul?q=%D7%94%D7%A0%D7%97%D7%95%D7%A9%D7%AA%202%20%D7%91%D7%90%D7%A8%20%D7%A9%D7%91%D7%A2&navigate=yes',
    phone: '08-0000005',
    description: 'ליד פארק ההייטק ותחנת באר שבע צפון. חניה נוחה ועמדות עבודה במחיר הוגן.',
    image: imageOf('beer-sheva-gav-yam-hot-desk'),
    gallery: branchImages('beer-sheva-gav-yam'),
    hours: EARLY_HOURS,
    isFlagship: false,
  },
];

export const SEED_AMENITIES: Amenity[] = [
  { id: 'amenity-projector', slug: 'projector', name: 'מקרן' },
  { id: 'amenity-whiteboard', slug: 'whiteboard', name: 'לוח מחיק' },
  { id: 'amenity-screen', slug: 'screen', name: 'מסך 65 אינץ׳' },
  { id: 'amenity-video', slug: 'video-conference', name: 'ציוד ועידת וידאו' },
  { id: 'amenity-light', slug: 'natural-light', name: 'אור טבעי' },
  { id: 'amenity-standing', slug: 'standing-desk', name: 'שולחן עמידה' },
  { id: 'amenity-locker', slug: 'locker', name: 'לוקר אישי' },
  { id: 'amenity-phone-booth', slug: 'phone-booth', name: 'גישה לתא שיחות' },
];

export const SEED_ADDONS: Addon[] = [
  {
    id: 'addon-catering',
    slug: 'catering',
    name: 'מגש כיבוד',
    description: 'מגש פירות, מאפים ושתייה קרה — מוכן בחדר בתחילת ההזמנה.',
    price: 5000,
    pricingMode: 'perBooking',
    spaceTypes: ['meetingRoom', 'privateOffice', 'hotDesk'],
  },
  {
    id: 'addon-parking',
    slug: 'parking',
    name: 'חניה שמורה',
    description: 'מקום חניה שמור בחניון הסניף לכל משך ההזמנה.',
    price: 4000,
    pricingMode: 'perBooking',
    spaceTypes: ['meetingRoom', 'privateOffice', 'hotDesk'],
  },
  {
    id: 'addon-zoom',
    slug: 'zoom-kit',
    name: 'עמדת ZOOM פרימיום ניידת',
    description: 'מצלמה 4K, מיקרופון מערך ורמקול — מחויב לפי שעה.',
    price: 2000,
    pricingMode: 'perHour',
    spaceTypes: ['meetingRoom', 'privateOffice'],
  },
];

const A = (...slugs: string[]) => slugs.map((s) => SEED_AMENITIES.find((a) => a.slug === s)!.id);

interface SpaceTemplate {
  key: string;
  name: string;
  type: Space['type'];
  description: string;
  capacity: number;
  sizeSqm: number;
  hourlyPrice: number;
  dayPassPrice: number | null;
  poolSize: number | null;
  amenityIds: string[];
}

const HOT_DESK = (pool: number): SpaceTemplate => ({
  key: 'hot-desk',
  name: 'עמדה חמה באזור הפתוח',
  type: 'hotDesk',
  description:
    'עמדה גמישה באזור העבודה הפתוח. מגיעים, בוחרים שולחן פנוי ומתחילים לעבוד. כולל Wi-Fi מהיר, קפה ותה ללא הגבלה וגישה ללאונג׳.',
  capacity: 6,
  sizeSqm: 4,
  hourlyPrice: 2500,
  dayPassPrice: null,
  poolSize: pool,
  amenityIds: A('natural-light', 'locker', 'phone-booth'),
});

const OFFICE = (suffix: string, name: string, size: number): SpaceTemplate => ({
  key: `office-${suffix}`,
  name,
  type: 'privateOffice',
  description:
    'משרד סגור ושקט עם דלת נעולה — לעבודה מרוכזת, שיחות רגישות או צוות קטן. אפשר להזמין לפי שעה או ליום שלם במחיר קבוע.',
  capacity: 3,
  sizeSqm: size,
  hourlyPrice: 9000,
  dayPassPrice: 52000,
  poolSize: null,
  amenityIds: A('natural-light', 'standing-desk', 'whiteboard', 'screen'),
});

const MEETING_SMALL: SpaceTemplate = {
  key: 'meeting-small',
  name: 'חדר ישיבות קטן',
  type: 'meetingRoom',
  description: 'חדר זכוכית אינטימי לפגישות של עד 4 משתתפים — ראיונות, פגישות לקוח ושיחות וידאו.',
  capacity: 4,
  sizeSqm: 12,
  hourlyPrice: 12000,
  dayPassPrice: null,
  poolSize: null,
  amenityIds: A('screen', 'whiteboard', 'video-conference'),
};

const MEETING_LARGE: SpaceTemplate = {
  key: 'meeting-large',
  name: 'חדר ישיבות גדול',
  type: 'meetingRoom',
  description: 'חדר ישיבות מאובזר לעד 10 משתתפים — מצגות למשקיעים, סדנאות וישיבות הנהלה.',
  capacity: 10,
  sizeSqm: 28,
  hourlyPrice: 24000,
  dayPassPrice: null,
  poolSize: null,
  amenityIds: A('projector', 'screen', 'whiteboard', 'video-conference', 'natural-light'),
};

const BRANCH_LAYOUT: Record<string, SpaceTemplate[]> = {
  'tlv-rothschild': [
    HOT_DESK(20),
    OFFICE('a', 'משרד פרטי — זכוכית', 14),
    OFFICE('b', 'משרד פרטי — פינתי', 18),
    MEETING_SMALL,
    MEETING_LARGE,
  ],
  'tlv-sarona': [HOT_DESK(16), OFFICE('a', 'משרד פרטי', 12), MEETING_SMALL, MEETING_LARGE],
  'jerusalem-center': [HOT_DESK(14), OFFICE('a', 'משרד פרטי', 12), MEETING_SMALL],
  'haifa-port': [HOT_DESK(12), OFFICE('a', 'משרד פרטי עם נוף לנמל', 15), MEETING_LARGE],
  'beer-sheva-gav-yam': [HOT_DESK(12), OFFICE('a', 'משרד פרטי', 12), MEETING_SMALL],
};

export const SEED_SPACES: Space[] = SEED_BRANCHES.flatMap((branch) =>
  (BRANCH_LAYOUT[branch.slug] ?? []).map((t) => ({
    id: `space-${branch.slug}-${t.key}`,
    slug: `${branch.slug}-${t.key}`,
    name: t.name,
    type: t.type,
    branchId: branch.id,
    description: t.description,
    images: [imageOf(`${branch.slug}-${t.key}`)],
    videoUrl: null,
    capacity: t.capacity,
    sizeSqm: t.sizeSqm,
    hourlyPrice: t.hourlyPrice,
    dayPassPrice: t.dayPassPrice,
    poolSize: t.poolSize,
    amenityIds: t.amenityIds,
  })),
);

export const SEED_SETTINGS: SiteSettings = {
  businessName: 'SpaceHub',
  tagline: 'חללי עבודה וחדרי ישיבות לפי שעה — זמינות אמת, מחיר סופי.',
  whatsappNumber: '972500000000',
  whatsappMessage: 'היי SpaceHub, אשמח לעזרה לגבי הזמנת חלל עבודה',
  instagramUrl: null,
  linkedinUrl: null,
  vatRate: 0.18,
  autoDiscountMinHours: 4,
  autoDiscountPercent: 10,
  legal: {
    companyName: 'ספייס-האב ישראל בע"מ (בהקמה)',
    companyId: '510000000',
    address: 'שדרות רוטשילד 22, תל אביב',
    email: 'legal@spacehub.co.il',
    accessibilityCoordinator: 'ישראל ישראלי',
    accessibilityPhone: '03-0000001',
    isDemo: true,
  },
};

export const SEED_SEO: SeoSettings = {
  metaTitle: 'SpaceHub | חללי עבודה וחדרי ישיבות לפי שעה',
  metaDescription:
    'הזמינו עמדה חמה, משרד פרטי או חדר ישיבות בתל אביב, ירושלים, חיפה ובאר שבע. זמינות בזמן אמת, מחיר סופי כולל מע"מ וביטול חינם עד 24 שעות לפני.',
  shareImage: IMAGES['tlv-rothschild-hot-desk'],
};
