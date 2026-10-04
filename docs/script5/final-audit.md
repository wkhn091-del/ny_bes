# סקריפט 5 — ביקורת סופית על סקריפטים 1–4

**תאריך:** 04.10.2026 · **מבקר:** סוכן הקוד (בהרשאת אבישי, ללא שאלות) · **גרסה:** Next.js 16.3.8

**מקורות הראיות:** הקוד בפועל (`spacehub/`), שרת פרודקשן מקומי (`npx next start -p 3100`) שנבדק עם curl ובדפדפן, ופקודות שהורצו בפועל. כל מה שלא ניתן היה להריץ מסומן ככזה, ולא סומן כ"עבר".

**שלב 0:** לא נדרשה הדבקה. הייתה לי גישה מלאה לקוד ולטרמינל. **אין אתר חי או Staging**, ולכן כל בדיקה שדורשת כתובת ציבורית (Rich Results, Observatory, ZAP) או מפתחות אמיתיים (Supabase / Stripe / Resend) מסומנת ⚠️ או ❌.

**התאמת המונחים:** SpaceHub מוכר הזמנות של חללי עבודה, לא מוצרים פיזיים. לכן Product = חלל, Variant = סוג הזמנה (שעות / Day Pass / מספר עמדות / תוספות), ועגלה = בחירת הזמנה. סעיפים שאין להם משמעות בשירות כזה (משלוח, 18+, 1+1) מסומנים **N/A** עם נימוק, ולא נספרים כ-✅.

מקרא: ✅ קיים ותקין · ⚠️ קיים חלקית · ❌ חסר · N/A לא רלוונטי (עם נימוק)

---

## סקריפט 1 · מודול א' — Core Build

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 1.1 | Tier מיושם | ✅ | Tier 3: מפת קומה תלת־ממדית (`src/components/home/FloorMap.tsx`, `@react-three/fiber`), אנימציות גלילה, מנוע תמחור והטבות מלא | — |
| 1.2 | מותג עקבי | ✅ | `src/components/brand/Logo.tsx`, צבע ה-accent ב-`globals.css`, `src/app/icon.svg` (מתחלף ב-dark mode), `opengraph-image.png` ו-`manifest.ts` באותם צבעים | — |
| 1.3 | סכמת מוצר + Variants / Categories / Tags | ✅ | `src/sanity/schemaTypes/space.ts`: `type` (קטגוריה), `amenities` (תגיות), `hourlyPrice` / `dayPassPrice` / `poolSize` (וריאציות), ומסמך `addon` נפרד | — |
| 1.4 | Faceted Search | ✅ | `src/lib/catalog-filters.ts` (`CatalogFilters`: עיר, סוג, תאריך, שעות, אנשים, טווח מחיר, גודל, שירותים, מיון) ו-`CatalogExplorer` | — |
| 1.5 | מנוע מבצעים מאומת בשרת | ✅ | `src/lib/domain/pricing.ts` (`calculatePrice`), `src/lib/server/quote.ts`: קופונים, הנחה אוטומטית ונקודות מחושבים מחדש בשרת. ‏1+1 לא רלוונטי לשירות | — |
| 1.6 | עגלה ב-Zustand בלי מחירים / PII | ✅ | `src/stores/cart.ts` שומר רק `{spaceId, date, startMinute, endMinute, seats, isDayPass, addonIds}` | — |
| 1.7 | נכסים / 3D | ✅ | גלריית תמונות לכל חלל מ-Sanity, ומודל תלת־ממד `public/models/office-kit.glb` (35KB, Draco; מוגש עם 200 ו-`max-age=86400`, נבדק ב-curl) | תמונות אמיתיות של החללים (ממתין לך) |
| 1.8 | אנימציות גלילה בלי פגיעה בביצועים | ✅ | `globals.css:132` ‏`animation-timeline: view()` + `prefers-reduced-motion`. במקום Framer Motion נבחר CSS טהור (אפס JS ב-main thread). **תוקן בביקורת:** הוסרה תלות `framer-motion` שלא היה בה שימוש | — |
| 1.9 | עמודים משפטיים | ✅ | `src/app/(site)/legal/[slug]/page.tsx`: תנאי שימוש (כולל ביטולים), פרטיות, הצהרת נגישות, תקנון הבית. עמוד משלוחים לא רלוונטי | נוסח סופי אצל עו"ד (ממתין לך) |
| 1.10 | רגולציה ספציפית | ✅ | מחירים כוללים מע"מ (חוק הגנת הצרכן 17ב), הצהרת נגישות (תקנה 35). ‏18+ ומחיר ליחידה לא רלוונטיים | — |
| 1.11 | שליחת הזמנה ליעד + טיפול בכשל | ✅ | `src/lib/notifications/email.ts`: ‏7 תבניות, ‏Idempotency-Key, ‏`logError` על כשל, בלי להפיל את ההזמנה | — |
| 1.12 | משלוח דינמי | N/A | שירות במקום, אין משלוח | — |
| 1.13 | Baseline 1 — חישוב בשרת | ✅ | `quoteCheckout` / `createCheckoutSession` מחשבים מחדש מול Sanity. הלקוח שולח מזהים בלבד | — |
| 1.14 | Baseline 2 — רק מזהים בצד לקוח | ✅ | `src/stores/cart.ts`. ב-`src/stores/user.ts` רק `displayName`, `initials`, `avatarUrl`, `isStaff` | — |
| 1.15 | Baseline 3 — server-only / Zod / NEXT_PUBLIC | ✅ | סריקה: 0 מודולים עם סוד בלי `import 'server-only'`. ‏`src/lib/env.server.ts` מאומת ב-Zod. ב-`env.public.ts` אין סודות | — |
| 1.16 | Baseline 4 — GROQ עם פרמטרים | ✅ | הדבר היחיד שמשורשר הוא הקבוע `${IMAGE}`. כל קלט עובר כ-`$param`, וה-projection מפורש | — |
| 1.17 | Baseline 5 — Zod עם אורך + שגיאות גנריות | ✅ | כל Server Action ו-API עם קלט מאומת ב-Zod. ללקוח מוחזרות הודעות גנריות, והפירוט נשמר ב-`logError` | — |
| 1.18 | Baseline 6 — אין innerHTML לא מסונן | ✅ | שימוש יחיד: `src/components/seo/JsonLd.tsx` עם `serializeJsonLd` (escape ל-`< > &` ול-U+2028/9, יש בדיקה). ביקורות מוצגות כ-Plain Text | — |
| 1.19 | Baseline 7 — הרשאה בשרת | ✅ | כל Action עובר דרך `guard` / `staffGuard` / `getSessionUser` / `guardOwnMutation`. מנגנון ההרשאה של כל API route מתועד ב-`docs/script3/A-security-fortress.md` | — |
| 1.20 | Baseline 8 — תלויות | ⚠️ | Next 16.3.8, ‏lockfile ו-overrides. ‏`npm audit --omit=dev`: **11 high, 0 critical**, כולן בשרשרת `braces@3.0.3` שאין לה תיקון upstream | לעקוב דרך Dependabot. אסור לעשות downgrade ל-sanity 5 |
| 1.21 | מסמך ארכיטקטורה ומפת אבטחה | ✅ | **❌ ← ✅ תוקן:** ‏`docs/ARCHITECTURE.md` (mermaid, זרימת הזמנה, מפת אבטחה) | — |
| 1.22 | הוראות פריסה (CORS, טוקנים נפרדים) | ✅ | `DEPLOY.md` | — |
| 1.23 | אין TODO / placeholders בקוד | ✅ | סריקה של `src`: ‏0 TODO/FIXME, ‏0 "rest of code", ‏0 `console.log` | — |
| 1.24 | טיפול בשגיאות בנתיבים קריטיים | ✅ | `error.tsx`, ‏`global-error.tsx`, ‏try/catch + `logError` בכל Action ו-webhook | — |

**סיכום מודול:** ✅ 22 · ⚠️ 1 · ❌ 0 · N/A 1. **המלצה:** תקין, למעט מעקב אחרי `braces`.

## סקריפט 1 · מודול ב' — Customer Portal

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 1.25 | התחברות קלה | ✅ | OTP במייל + Google (`src/app/actions/auth.ts`). Guest Checkout לא הוגדר: הזמנה מחייבת זהות כדי לאפשר ביטול, נקודות וסימון הגעה | — |
| 1.26 | Protected Routes | ✅ | `src/proxy.ts` (רשימת PROTECTED מפנה ל-login), ובנוסף `requireUser` בכל עמוד | — |
| 1.27 | שם ותמונה ל-Navbar | ✅ | `src/stores/user.ts` (`displayName`, `avatarUrl`) | — |
| 1.28 | לשוניות אזור אישי | ✅ | `/account`: הזמנות, מועדפים (Wishlist), נקודות, פרופיל, אבטחה. כתובות לא רלוונטיות | — |
| 1.29 | "הזמן שוב" | ✅ | `/account/reorder/[code]` ממלא מראש מזהים בלבד. המחיר מחושב מחדש ב-`quoteCheckout` | — |
| 1.30 | User ↔ Orders | ✅ | `bookings.user_id → profiles.id` (migrations) וכרטיס לקוח ב-Sanity | — |
| 1.31 | לוגין, layout, היסטוריה | ✅ | `login/page.tsx`, `account/layout.tsx`, `account/bookings/page.tsx` | — |
| 1.32 | IDOR — סינון לפי userId + בדיקה ידנית | ⚠️ | בקוד: `.eq('user_id', user.id)` בכל שליפה, וגם RLS. **הבדיקה הידנית עם שני משתמשים לא בוצעה**, כי אין Supabase חי | להריץ את הבדיקה אחרי חיבור המפתחות (`docs/script3/A-security-fortress.md`) |
| 1.33 | מזהי הזמנה אקראיים | ✅ | nanoid ‏`customAlphabet` באורך 8 לקוד הזמנה, ו-UUID למזהה. אין הזמנת אורח | — |
| 1.34 | no-store באזור האישי | ✅ | `proxy.ts` מוסיף `private, no-store` לכל prefix פרטי (נבדק ב-curl) | — |
| 1.35 | Step-up Auth | ✅ | `hasStepUp` על שינוי טלפון, מייל, פרטי חשבונית ומחיקה | — |

**סיכום מודול:** ✅ 10 · ⚠️ 1 · ❌ 0. **המלצה:** הבדיקה הידנית היא תנאי ל-Go.

## סקריפט 1 · מודול ג' — IAM & Auth Engine

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 1.36 | מערכת אימות | ✅ | Supabase Auth, המקבילה ל-Clerk/NextAuth, דרך `@supabase/ssr` | — |
| 1.37 | middleware אחד | ✅ | `src/proxy.ts` יחיד (ב-Next 16 ‏`proxy.ts` מחליף את middleware) וכולל גם את ה-CSP | — |
| 1.38 | Session בשרת | ✅ | `getSessionUser` / `requireUser` בכל עמוד ו-Action | — |
| 1.39 | Auth Button | ✅ | Navbar: "התחברות" או תפריט משתמש עם התנתקות | — |
| 1.40 | עמוד פרופיל | ✅ | `/account/profile` שולף רק לפי `user.id` | — |
| 1.41 | Webhook יוצר לקוח ב-Sanity | ✅ | `src/app/api/auth/webhook/route.ts` → `syncCustomerCard` (dataset פרטי `customers`) | — |
| 1.42 | חתימה + אירועים + Idempotency | ✅ | `verifyAuthWebhook` (HMAC + timestamp), ‏created/updated/deleted, טבלת `auth_webhook_events` עם `onConflict` | — |
| 1.43 | Cookies | ✅ | `cookie-options`: httpOnly, ‏secure בפרודקשן, ‏sameSite=lax, רענון session | — |
| 1.44 | OTP Hardening | ⚠️ | Rate limit לפי IP ולפי מייל, מגבלת ניסיונות, Turnstile. **תוקף 5 דקות הוא הגדרה בדשבורד Supabase** שמתועדת ב-`DEPLOY.md` ולא אומתה. תקציב SMS לא רלוונטי (אין SMS) | להגדיר 300s בדשבורד |
| 1.45 | מניעת Enumeration | ✅ | אותה הודעה בין אם המייל קיים ובין אם לא | — |
| 1.46 | returnUrl ב-allowlist | ✅ | `safeReturnUrl` (נתיב יחסי בלבד, חוסם `//` ו-`\`) | — |
| 1.47 | מכשיר חדש + ניתוק הכול | ✅ | `src/lib/server/devices.ts` (`registerLoginDevice` + מייל התראה), ‏`signOutEverywhere` | — |
| 1.48 | מחיקת חשבון + Sanity | ✅ | `deleteAccount` מאנונם הזמנות ומפעיל `deleteCustomerCard` | — |

**סיכום מודול:** ✅ 12 · ⚠️ 1 · ❌ 0.

---

## סקריפט 2 · מודול א' — CRO & Sales Engine

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 2.1 | חיפוש חכם | ✅ | `src/lib/search/fuzzy.ts` (`editDistance`, נרמול, "התכוונת ל…"), ‏`SmartSearch` עם תמונה ומחיר בדרופדאון | — |
| 2.2 | אבטחת חיפוש | ✅ | `/api/search`: ‏Zod (אורך מקסימלי), ‏rate limit, ‏debounce של 180ms, ‏projection ציבורי בלבד | — |
| 2.3 | Upsell בעמוד מוצר ולפני תשלום | ✅ | המלצות בעמוד החלל (אלגוריתם: אותו סניף/סוג, ואז מחיר קרוב), ו-`BookingSummaryDrawer` לפני התשלום עם תוספות בלחיצה אחת | — |
| 2.4 | בלי מוצרים מוסתרים, מחיר בשרת | ✅ | מסנן `active == true`. המחיר הסופי מחושב רק ב-`quoteCheckout` | — |
| 2.5 | מיקום לפי התחקיר | ✅ | מגירה צדדית ומתחת למוצר (`docs/script2/A-…md`) | — |
| 2.6 | כוכבים, טקסט, תמונה | ✅ | `ReviewForm.tsx`, ‏`ReviewsSection.tsx` | — |
| 2.7 | תור, אחת למשתמש, מאומתת | ✅ | `src/lib/server/reviews.ts`: ‏`alreadyReviewed`, "רק הזמנה ששולמה והתחילה", ‏`verified: true`, סטטוס pending, ‏Turnstile, honeypot, ‏Plain Text | — |
| 2.8 | העלאת תמונות | ✅ | `src/lib/server/review-images.ts`: ‏magic bytes, תקרת גודל, re-encode ל-WebP בלי EXIF, ‏`randomUUID()`. נבדק ב-`review-images.test.ts` | — |
| 2.9 | קומפוננטות | ✅ | `SmartSearch`, ‏`ReviewsSection`, ‏`BookingSummaryDrawer` | — |

**סיכום מודול:** ✅ 9 · ⚠️ 0 · ❌ 0.

## סקריפט 2 · מודול ב' — Performance, WebGL & a11y

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 2.10 | Draco | ✅ | `public/draco/` + `DRACO_DECODER_PATH` ב-`src/components/home/FloorMap3D.tsx`. כותרת cache נבדקה ב-curl | — |
| 2.11 | Suspense בלי מסך לבן | ✅ | `FloorMap.tsx:29` ‏`loading: () => <MapLoading />`, ובתוך `FloorMap3D.tsx:832` ‏`<Suspense>` שמציג סצנה פשוטה עד שהמודלים נטענים. שאר העמודים מרונדרים בשרת (HTML מלא, בלי מסך לבן) | — |
| 2.12 | Lazy / Splitting | ✅ | `dynamic(() => import(...), { ssr: false })` + mount דחוי | — |
| 2.13 | 3D מחוץ ל-main thread | ⚠️ | פענוח Draco רץ ב-Web Worker, ו-`frameloop="demand"`. הרינדור עצמו על ה-main thread | OffscreenCanvas הוא שדרוג אופציונלי, לא חוסם |
| 2.14 | Optimistic + Rollback | ✅ | המועדפים: עדכון אופטימי ו-rollback עם הודעה. העגלה מקומית בלבד, ואין שרת שידחה אותה; המחיר מאושר ב-quote | — |
| 2.15 | WCAG 2.1 AA | ✅ | axe-core: ‏0 הפרות. ‏Lighthouse a11y 100 | — |
| 2.16 | Skip link + roles | ✅ | קישור "דלג לתוכן" ב-layout, ‏`<main id>`, ‏landmarks | — |
| 2.17 | CSP: nonce, worker, blob, בלי unsafe | ⚠️ | ב-`script-src`: ‏nonce + `strict-dynamic` + `wasm-unsafe-eval`, בלי `unsafe-eval`. **ב-`style-src` נשאר `'unsafe-inline'`** (style attributes של React ו-R3F; לא מאפשר הרצת JS) | מתועד כסיכון מקובל |
| 2.18 | Cache | ✅ | קטלוג עם ISR ותגיות. פרטי: `private, no-store` | — |
| 2.19 | Service Worker | ✅ | אין SW (נבדק: manifest בלבד) | — |
| 2.20 | Rate limit על עגלה | ✅ | `bookingMutation` על quote / checkout. בחירה מקומית לא שולחת בקשות | — |
| 2.21 | Lighthouse מובייל | ⚠️ | הורץ: Perf 68, ‏**LCP 3.6s מדומה** (686ms בפועל; Lantern), ‏**CLS 0 ✓**, ‏TBT 997ms (מדד חלופי ל-INP, שלא נמדד במעבדה). ‏LCP ו-TBT מחוץ לטווח הטוב | לפצל את ה-chunk של 199KB ולמדוד CrUX אחרי השקה |

**סיכום מודול:** ✅ 9 · ⚠️ 3 · ❌ 0.

## סקריפט 2 · מודול ג' — UX & Friction

| # | דרישה | סטטוס | ראיה |
|---|---|---|---|
| 2.22 | 5 שניות ראשונות | ✅ | `docs/script2/C-ux-friction-report.md` תחנה 1 + hero מתוקן |
| 2.23 | מסע גלילה | ✅ | שם, תחנה 2 |
| 2.24 | אמון | ✅ | מדיניות ביטול, ביקורות מאומתות, מחיר כולל מע"מ, סימני תשלום מאובטח, פרטי עסק בפוטר |
| 2.25 | CTA וצ'קאאוט | ✅ | שם, תחנה 3. ‏Turnstile בלתי נראה; OTP פעם אחת בלבד |
| 2.26 | 3–5 תיקונים קריטיים | ✅ | שם, "5 התיקונים הקריטיים שבוצעו" |

**סיכום מודול:** ✅ 5.

## סקריפט 2 · מודול ד' — Competitor & Customer Mind

| # | דרישה | סטטוס | ראיה (`docs/script2/D-competitors-positioning-ab.md`) |
|---|---|---|---|
| 2.27 | כרטיסי מתחרים | ✅ | §1 (פנימי, עם מקורות) |
| 2.28 | 4 תחנות | ✅ | §2 |
| 2.29 | טריז | ✅ | §3 |
| 2.30 | הצעה | ✅ | §4 (בלי טריקים) |
| 2.31 | השוואה, נחיתה, FAQ באתר | ✅ | טבלת השוואה ב-`src/components/home/WhyUs.tsx` (בדף הבית ובעמודי הנחיתה), עמודי נחיתה `src/app/(site)/book/[intent]/page.tsx` (4 ב-sitemap), FAQ ב-`<details>` בדף הבית ובעמודי הנחיתה |
| 2.32 | מקורות + סימון עו"ד | ✅ | §5 ו"מקורות (נבדקו 04.10.2026)" |
| 2.33 | מסרים + A/B | ✅ | §7, §8 |
| 2.34 | אין טקטיקות מטעות | ✅ | אין טיימר, מלאי מוצג מהשרת בלבד, ביקורות אמיתיות בלבד (ריק = לא מוצג), אין מחיר "לפני" |

**סיכום מודול:** ✅ 8.

---

## סקריפט 3 · מודול א' — רמה א'

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 3.1 | Cart Integrity + ניסיון ב-DevTools | ⚠️ | בקוד: הלקוח שולח מזהים בלבד, והמחיר נשלף מחדש מ-Sanity ב-`quote.ts`. **ניסיון השינוי ב-DevTools לא בוצע**, כי בלי Stripe ו-Supabase אין checkout פעיל | לבצע אחרי מפתחות |
| 3.2 | Webhook סליקה | ✅ | `src/app/api/stripe/webhook/route.ts`: ‏`constructEvent` (חתימה + tolerance), טבלת `stripe_events`, ‏idempotency keys | — |
| 3.3 | CSP + כל הכותרות | ✅ | curl על פרודקשן: CSP עם nonce, ‏XFO, ‏nosniff, ‏Referrer, ‏Permissions, ‏COOP, ‏HSTS, ‏**CORP**, ‏**X-DNS-Prefetch-Control** (נוספו בסקריפט 3). ‏`poweredByHeader:false`, ‏`productionBrowserSourceMaps:false`, ‏0 קבצי `.map` | — |
| 3.4 | Rate limit אמיתי | ✅ | `src/lib/security/rate-limit.ts` (Upstash) על login, ‏OTP, ‏quote/קופון, ‏checkout, ‏reviews, ‏search, ‏csp-report, ‏health, ‏csv | — |
| 3.5 | Sanitization בחיפוש ובהערות | ✅ | חיפוש: Zod + נרמול. שדות חשבונית בצ'קאאוט: Zod עם אורך. אין שדה הערות חופשי | — |
| 3.6 | Server Actions | ⚠️ | Zod, הרשאה בכל Action, מחיר בשרת, ‏`bodySizeLimit: '256kb'`, ‏`allowedOrigins` ריק (same-origin בלבד). **`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` עדיין לא הוגדר** (מאומת ב-`env.server.ts` כשיוגדר) | ליצור ולהגדיר ב-Vercel |
| 3.7 | IDOR ידני | ⚠️ | כמו 1.32 | בדיקה עם שני משתמשים |
| 3.8 | Session & OTP | ✅ | 1.43–1.47 | — |
| 3.9 | Secrets | ✅ | Zod, ‏server-only, טוקנים נפרדים, ‏`.gitignore`, ‏gitleaks ב-CI, ‏`timingSafeEqual` (webhooks, ‏CSV, ‏cron) | — |
| 3.10 | Sanity Hardening | ⚠️ | dataset פרטי `customers` ל-PII, ‏GROQ עם פרמטרים, projection. **CORS, ‏MFA, ‏Roles וגיבוי הם הגדרות בחשבון Sanity** (מתועד ב-`DEPLOY.md`) | ממתין לך |
| 3.11 | Payment & Inventory | ✅ | Stripe Checkout מתארח אצל Stripe, קופונים בשרת, exclusion constraint ב-Postgres (מלאי אטומי), תקרות על כמות ומספר עמדות, מטבע קבוע ILS | — |
| 3.12 | Cache Safety | ✅ | 1.34 | — |
| 3.13 | XSS Sinks | ✅ | 1.18 + `safeReturnUrl` | — |
| 3.14 | Bot Protection | ✅ | Turnstile עם `siteverify` בשרת + honeypot (`name="website"`) | — |
| 3.15 | revalidate / draft / health | ✅ | webhook של Sanity חתום, ‏draft מוגן בסוד, ‏`/api/health` מחזיר רק `{"status":"ok"}` (נבדק) | — |
| 3.16 | 2FA, הרשאות, Branch / Deployment Protection, ‏npm ci | ⚠️ | ‏`npm ci` ב-CI ‏✓, ‏dependabot ‏✓. **2FA, ‏Branch Protection ו-Deployment Protection הם הגדרות חשבון** | ממתין לך |

**סיכום רמה א':** ✅ 11 · ⚠️ 5 · ❌ 0.

## סקריפט 3 · מודול א' — רמה ב'

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 3.17 | העלאת קבצים | ✅ | 2.8 | — |
| 3.18 | CORS / API hygiene | ✅ | אין `Access-Control-Allow-Origin` פתוח, content-type נבדק, תקרות גודל | — |
| 3.19 | Dependabot + audit ב-CI | ✅ | `.github/dependabot.yml`, ‏`ci.yml` (`--audit-level=critical`). הורץ: 11 high / 0 critical | — |
| 3.20 | Monitoring | ⚠️ | Sentry (`src/instrumentation.ts`, ‏`src/instrumentation-client.ts`), לוג מובנה, ‏audit log של צוות. **WAF והתראות** בהגדרות Vercel | ממתין לך |
| 3.21 | CSV Injection | ✅ | `src/lib/export/csv.ts`: ‏`'` לפני `= + - @ Tab CR`, ‏LRM, ‏BOM (5 בדיקות) | — |
| 3.22 | SSRF / remotePatterns | ✅ | `next.config.ts`: רק `cdn.sanity.io`. אין fetch לכתובת שמגיעה מהמשתמש | — |
| 3.23 | צד שלישי | ✅ | nonce + `strict-dynamic`; ‏GA4 רק אחרי הסכמה; התשלום בדף של Stripe; אין GTM | — |
| 3.24 | SPF / DKIM / DMARC / CAA / נעילה | ❌ | רשומות מוכנות ב-`docs/script3/B-launch.md`, **אבל אין דומיין ולא הוגדרו** | ממתין לך |
| 3.25 | Webhook אימות | ✅ | 1.42 | — |
| 3.26 | Moderation | ✅ | 2.7 | — |
| 3.27 | Log hygiene | ✅ | שגיאות גנריות ללקוח. הלוגים מכילים מזהים (`bookingId`), לא מיילים (נבדק ב-grep) | — |
| 3.28 | Backup / Rollback / אירוע | ⚠️ | `docs/script4/05-security-incident-sheet.md` ✓, ‏Instant Rollback ב-Vercel ✓. **PITR / גיבוי Supabase תלוי בתוכנית** | ממתין לך |

**סיכום רמה ב':** ✅ 9 · ⚠️ 2 · ❌ 1.

## סקריפט 3 · מודול א' — רמה ג'

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 3.29 | ATO | ✅ | התראה על מכשיר חדש, step-up, ניתוק הכול, rate limit | — |
| 3.30 | Card testing | ✅ | Stripe Checkout (Radar + 3DS כברירת מחדל), rate limit + Turnstile לפני יצירת session | — |
| 3.31 | CSP Reporting / Trusted Types | ✅ | `/api/csp-report` (שני הפורמטים, scrub, ‏204), ‏`Reporting-Endpoints`. נבדק: 0 הפרות. ‏Trusted Types לא הופעל (R3F ו-Sanity Studio לא תואמים; sink יחיד, ומסונן) | — |
| 3.32 | `__Host-` + אין טוקנים ב-localStorage | ⚠️ | אין טוקנים ב-localStorage ✓. **שמות העוגיות נקבעים ע"י `@supabase/ssr`**, ולכן אין קידומת `__Host-` | מגבלת ספרייה, מתועד |
| 3.33 | Data Protection | ✅ | איסוף מינימלי, אנונימיזציה במחיקה, PII ב-dataset פרטי, ‏CSV בלי מייל/טלפון | — |
| 3.34 | Privacy & Compliance | ⚠️ | מדיניות פרטיות, באנר הסכמה לפני GA4 (כפתורים שווי משקל), מחיקת חשבון. **בדיקת עו"ד לתיקון 13 לא בוצעה** | ממתין לך |
| 3.35 | ReDoS / Timeouts | ✅ | אין regex על קלט חופשי ארוך (אורך מוגבל ב-Zod), ‏`maxDuration`, ‏CSV עד 5,000 שורות / 92 יום | — |
| 3.36 | WAF / Geo | ❌ | לא הוגדר (Vercel Firewall) | ממתין לך |
| 3.37 | OWASP ZAP | ❌ | **לא הורץ**: אין Staging ציבורי | להריץ baseline scan על Staging |
| 3.38 | Go-Live checklist | ⚠️ | ‏security.txt ✓, בדיקת CSP בקונסול ✓, בדיקת Cache ✓, ‏rate limit בקוד ✓. **Observatory, ‏securityheaders.com ו-IDOR ידני דורשים כתובת חיה** | אחרי Staging |

**סיכום רמה ג':** ✅ 5 · ⚠️ 3 · ❌ 2.

## סקריפט 3 · מודול ב' — השקה

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 3.39 | JSON-LD + Rich Results | ⚠️ | `src/lib/seo/structured-data.ts`: ‏Product, ‏Offer, ‏BreadcrumbList, ‏LocalBusiness (עם בדיקות). curl הראה 2 בלוקים בעמוד חלל. **Rich Results Test דורש כתובת ציבורית** | אחרי השקה |
| 3.40 | OTP / SMS | ⚠️ | OTP במייל ✓. **SMS לא מומש**: דורש ספק ותקציב (`docs/script3/B-launch.md`) | החלטה שלך |
| 3.41 | `/api/health` | ✅ | `{"status":"ok"}`, ‏no-store (נבדק אחרי ה-build האחרון) | — |
| 3.42 | CSV + Google Sheets | ⚠️ | LRM, cache buster ב-Apps Script, formula guard (בדיקות). **לא נבדק ב-Google Sheets**, כי אין נתונים חיים | בדיקה ידנית |
| 3.43 | ISR ממוקד | ✅ | `revalidateTag` לפי חלל, כולל `sanity:reviews:<id>`. דפים אישיים דינמיים | — |
| 3.44 | סליקה | ✅ | Stripe: ‏`createCheckoutSession`, ‏webhook. משלוח לא רלוונטי | — |
| 3.45 | מיילים RTL | ✅ | 7 תבניות `dir="rtl"`. ‏Abandoned Cart לא הוגדר: דורש הסכמה שיווקית | — |
| 3.46 | GA4 + Pixel | ⚠️ | **תוקן בביקורת:** נוסף אירוע `add_to_cart` (`BookingWidget.tsx` → `proceed()`, ערך בשקלים). קיימים גם `view_item`, ‏`begin_checkout`, ‏`purchase`, וכולם רק אחרי הסכמה. **Meta Pixel לא מומש** (אין מזהה, והחלטה שיווקית) | ממתין לך |
| 3.47 | Sitemap + OG | ✅ | `sitemap.ts` (חללים, סניפים, `/book/*`), ‏OG ממותג + og:image לכל חלל מ-CMS | — |
| 3.48 | PWA | ✅ | `manifest.ts` בלי SW, ולכן אין cache פרטי | — |
| 3.49 | צ'קליסט, מפתחות, DNS | ✅ | `docs/script3/B-launch.md` | — |
| 3.50 | Launch Security Gate | ❌ | רמה א' לא עברה במלואה (3.1, ‏3.6, ‏3.7, ‏3.10, ‏3.16) | אחרי מפתחות ובדיקות |

**סיכום מודול:** ✅ 7 · ⚠️ 4 · ❌ 1.

---

## סקריפט 4 — מסירה

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 4.1 | שש שאלות | ✅ | `docs/script4/00-interview-answers.md`: נענו על ידי בהנחות מתועדות, לפי הרשאתך | לאשר את ההנחות |
| 4.2 | Welcome | ⚠️ | `01-welcome-manual.md` כולל SLA ו-2FA. **קישור ה-CMS הוא `https://<הדומיין>/studio`**, כי אין עדיין דומיין | להשלים אחרי הדומיין |
| 4.3 | תסריט Loom | ✅ | `02-loom-script.md`. התוויות אומתו מול הסכמה | — |
| 4.4 | 2 פוסטים + קופון | ⚠️ | `03-social-launch-kit.md`. **קוד הקופון לא הומצא** | קופון ממתין לך |
| 4.5 | ריטיינר | ⚠️ | `04-retainer-pitch.md` כולל את כל הרכיבים. **הסכום `[סכום]`** | סכום ממתין לך |
| 4.6 | מסמך אבטחה | ✅ | `05-security-incident-sheet.md` | — |
| 4.7 | בעלות + 2FA | ❌ | לא ניתן לבצע מכאן: העברת חשבונות דורשת אותך | ממתין לך |
| 4.8 | עברית שיווקית מלאה | ✅ | כל המסמכים בעברית | — |

**סיכום:** ✅ 4 · ⚠️ 3 · ❌ 1.

---

## בדיקות רוחביות

| # | דרישה | סטטוס | ראיה | תיקון נדרש |
|---|---|---|---|---|
| 5.1 | סריקת TODO / מפתחות | ✅ | 0 TODO/FIXME/console.log ב-`src`. ‏gitleaks ב-CI | — |
| 5.2 | build / lint / tsc | ✅ | הורץ אחרי התיקונים: ‏`tsc` exit 0, ‏`eslint --max-warnings=0` exit 0, ‏`npm test` ‏51/51, ‏`npm run build` exit 0 | — |
| 5.3 | middleware אחד, CSP לא שובר | ⚠️ | `proxy.ts` יחיד. 3D, אנימציות והפניה ל-Stripe (`form-action`) עובדים, 0 הפרות CSP. **GA4 לא נבדק חי** (אין מזהה). Pixel ו-Clerk לא קיימים | בדיקה אחרי GA4 ID |
| 5.4 | עברית / RTL כולל מובייל | ✅ | `lang="he" dir="rtl"`, צילומי מובייל ב-`docs/report/screenshots/` | — |
| 5.5 | axe + מקלדת ידנית | ⚠️ | axe 0, ‏Lighthouse 100, בדיקה מבנית של מקלדת (81 רכיבים עם שם, `:focus-visible`, אין tabindex חיובי). **מעבר Tab ידני מלא לא בוצע** (הדפדפן המשובץ לא מעביר Tab) | 5 דקות ידני |
| 5.6 | מסך צר + חיבור איטי | ✅ | 390px ו-Lighthouse מובייל (Slow 4G מדומה) | — |
| 5.7 | הנחיות גורפות | ✅ | `docs/script2/*` (מחקר, פסיכולוגיה, איסור הטעיה, שיטה תחרותית) | — |
| 5.8 | תיעוד | ✅ | **❌ ← ✅ תוקן:** ‏`README.md` (היה boilerplate), ‏`DEPLOY.md`, ‏`.env.example`, מסמך אירועים | — |
| 5.9 | הפרדת סביבות, אין סוד ב-NEXT_PUBLIC | ⚠️ | אין סוד ב-NEXT_PUBLIC ✓. **מפתחות נפרדים ל-Preview ו-Production** טרם הוגדרו | ממתין לך |
| 5.10 | E2E מלא | ❌ | **לא בוצע**: אין מפתחות Stripe / Supabase / Resend. נבדקו רק החלקים המקומיים (חיפוש, עמוד, בחירה) | אחרי מפתחות |

**סיכום:** ✅ 6 · ⚠️ 3 · ❌ 1.

---

## שלב ביקורת חוזרת (Re-audit)

תוקנו במהלך הביקורת ונבדקו שוב:

| סעיף | לפני | אחרי | אימות |
|---|---|---|---|
| 1.21 מסמך ארכיטקטורה | ❌ | ✅ | `docs/ARCHITECTURE.md` |
| 5.8 README | ❌ | ✅ | `README.md` |
| 3.46 אירוע `add_to_cart` | חסר | קיים | tsc 0, ‏eslint 0, ‏build 0, עמוד חלל 200 עם 2 בלוקי JSON-LD |
| 1.8 / 1.20 תלות מתה `framer-motion` | קיימת | הוסרה | `npm uninstall`, ‏tsc 0, ‏build 0 |
| 3.3 CORP / DNS-Prefetch / Reporting | חסר | קיים | curl |
| 3.31 CSP reporting | חסר | קיים | דוח בדיקה נרשם בלוג עם URL מנוקה |

לא ניתן לתקן בקוד את שאר ה-⚠️/❌: כולם דורשים מפתחות, חשבונות, דומיין, החלטה עסקית או בדיקה על כתובת חיה.

---

## דוח מסכם

### 1. ציון כולל — 150 סעיפים

| ✅ | ⚠️ | ❌ | N/A |
|---|---|---|---|
| **117** (78%) | **26** | **6** | 1 |

### 2. סעיפים פתוחים לפי חומרה

**קריטי (חוסם השקה):**
- 3.1: ניסיון שינוי מחיר ב-DevTools.
- 1.32 / 3.7: IDOR ידני עם שני משתמשים.
- 5.10: E2E מלא כולל תשלום, מייל והזמנה.
- 3.50: Launch Security Gate.
- 3.6: מפתח הצפנה ל-Server Actions.

**גבוה:**
- 3.10: CORS, ‏MFA ו-Roles ב-Sanity.
- 3.16 / 4.7: ‏2FA, ‏Branch Protection, ‏Deployment Protection, בעלות על החשבונות.
- 3.24: DNS (‏SPF, ‏DKIM, ‏DMARC, ‏CAA).
- 3.37: ZAP.
- 3.38: Observatory ו-securityheaders.
- 5.9: מפתחות נפרדים לכל סביבה.
- 1.44: תוקף OTP של 300s בדשבורד.

**בינוני:**
- 3.36: WAF.
- 3.28: גיבוי / PITR.
- 3.20: התראות.
- 3.34: בדיקת עו"ד לתיקון 13.
- 2.21: LCP ו-TBT במובייל.
- 1.20: ‏braces (אין תיקון upstream).
- 3.39: Rich Results Test.
- 3.42: בדיקה ב-Google Sheets.
- 5.3: GA4 חי.

**נמוך:**
- 2.13: OffscreenCanvas.
- 2.17: `style-src 'unsafe-inline'`.
- 3.32: ‏`__Host-`.
- 3.40: SMS.
- 3.46: Pixel.
- 4.2 / 4.4 / 4.5: דומיין, קופון, סכום ריטיינר.
- 5.5: מעבר Tab ידני.

### 3. החלטה: **No-Go**

הקוד עצמו מוכן ונבדק (build, ‏lint, ‏tsc ו-51 בדיקות עוברים, וכל הכותרות וההגנות פעילות). אבל לפי הכלל "אין Go כל עוד נותר סעיף קריטי (אבטחה, תשלום או IDOR) במצב ⚠️ או ❌", נשארו פתוחים בדיקת שינוי המחיר, בדיקת IDOR ומסלול התשלום המלא. אף אחד מהם לא ניתן לבדיקה בלי מפתחות אמיתיים, ולכן ההחלטה הכנה היא No-Go עד שיבוצעו.

### 4. תוכנית תיקון (לפי סדר)

1. **מפתחות** (כחצי יום, אתה): Supabase (כולל migrations עד 0005), ‏Sanity (tokens + webhooks), ‏Stripe (test), ‏Resend, ‏Upstash, ‏Turnstile, ‏`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, ‏`CSV_EXPORT_TOKEN`. כל מפתח בנפרד ל-Preview ול-Production.
2. **Staging ב-Vercel** עם Deployment Protection.
3. **בדיקות קריטיות** (אני, כשעה): IDOR עם שני משתמשים, ניסיון שינוי מחיר ב-DevTools, ‏E2E מלא בכרטיס הבדיקה 4242.
4. **חשבונות:** ‏2FA בכולם, ‏Branch Protection, ‏CORS ו-MFA ב-Sanity, ‏OTP של 300s.
5. **ZAP baseline**, ‏Observatory ו-securityheaders על Staging, ותיקון ממצאים.
6. **דומיין ו-DNS** (‏SPF, ‏DKIM, ‏DMARC, ‏CAA), ‏WAF, ‏PITR.
7. **אחרי השקה:** ‏Rich Results, ‏Google Sheets, ‏GA4 חי, ‏CrUX, פיצול ה-chunk לשיפור TBT.

כשסעיפים 1–5 יושלמו, הביקורת החוזרת על הסעיפים הקריטיים תאפשר להחליף את ההחלטה ל-Go.
