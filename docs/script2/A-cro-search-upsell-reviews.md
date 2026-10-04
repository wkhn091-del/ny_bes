# סקריפט 2 · מודול A — CRO: חיפוש חכם, Upsell/Cross-sell, ביקורות

תאריך: 4 באוקטובר 2026. כל המקורות נבדקו בתאריך זה.

## 1. מה נבנה

| רכיב | קבצים | מה הלקוח רואה |
|---|---|---|
| חיפוש חכם | `src/lib/search/*`, `src/app/api/search/route.ts`, `src/components/search/SmartSearch.tsx` | שורת חיפוש בניווט ובתפריט המובייל, הצעות עם תמונה, מחיר "החל מ-", סוג ומיקום. סובלני לשגיאות כתיב, ל"תא"/"tlv", לאותיות שימוש (ב/ה/ל/ו/מ/ש/כ) ולמילים נרדפות. יש "התכוונת ל…?" והצעות היקף (עיר+סוג) |
| המלצות משלימות | `src/lib/recommendations/rank.ts`, `src/lib/server/recommendations.ts`, `src/app/api/recommendations/route.ts` | בעמוד החלל: "משלים את ההזמנה שלכם", עם סיבה כנה לכל כרטיס |
| מגירת סיכום הזמנה | `src/components/booking/BookingSummaryDrawer.tsx`, `src/components/ui/SideDrawer.tsx` | לפני התשלום נפתחת מגירה מימין: סיכום, שורת תוספות בלחיצה אחת, ו"פנוי גם בשעות שבחרתם" |
| ביקורות | `src/lib/reviews/review.ts`, `src/lib/server/reviews.ts`, `src/lib/server/review-images.ts`, `src/app/api/reviews/route.ts`, `src/components/reviews/*`, `src/sanity/schemaTypes/review.ts`, `src/sanity/reviewActions.ts` | כוכבים, ממוצע, התפלגות, טקסט, תמונות לקוח ותג "הזמנה מאומתת". טופס כתיבה מוצג רק למי שהזמין |

## 2. החלטות וההיגיון הפסיכולוגי מאחוריהן (לפי הספר וממחקר)

- **החיפוש מסיר את חרדת "אין פה מה שאני צריך".** Baymard מצאו ש-69% מהאתרים לא מציעים השלמה אוטומטית לשגיאות כתיב קרובות. לכן מילת חיפוש עם טעות מקבלת תוצאות ו"התכוונת ל…?" ולא מסך ריק. ([Baymard](https://baymard.com/research-articles/offer-autocomplete-suggestions-for-misspellings))
- **ניווט מקלדת לפי ציפיות המשתמש.** חיצים מעתיקים את ההצעה לשדה והרשימה "מתגלגלת" חזרה לטקסט המקורי. Baymard: 58% מהאתרים לא מעתיקים את ההצעה הפעילה לשדה. ([Baymard](https://baymard.com/research-articles/copy-search-suggestion-to-search-field), [Baymard — 9 patterns](https://baymard.com/research-articles/autocomplete-design))
- **הצעות היקף מעוצבות אחרת מהצעות מוצר** (למשל "חדרי ישיבות בתל אביב · 4"), לפי אותו מקור.
- **המלצות עם סיבה ("למה זה מופיע") ולא "אולי תאהבו".** הסיבה היא נתון אמיתי, ושלושה סוגים בלבד:
  1. "N לקוחות שהזמינו את החלל הזה הזמינו גם אותו". מגיע מ-Supabase, ומוצג רק כש-N≥3 (k-anonymity), כך שאי אפשר לזהות לקוח בודד.
  2. השלמה באותו סניף, למשל "מגיעים מוקדם? עמדה לשעה לפני או אחרי הפגישה".
  3. חלופה מאותו סוג בסניף אחר באותה עיר.
- **במגירה מוצגים רק חללים שפנויים בפועל באותן שעות** (בדיקה מול ההזמנות ושעות הפתיחה). אין הצעה של משהו תפוס או מוסתר.
- **המגירה ממסגרת את ההחלטה כבר כ"שלי" (בעלות), והתוספות הן "להשלים את החוויה".** התוספות מסומנות במפורש "אופציונלי לגמרי", בלי checkbox מסומן מראש ובלי לחץ.
- **ביקורות מאומתות בלבד.** תג "קונה מאומת" מעלה את סיכויי הרכישה ב-15% לעומת ביקורת אנונימית (Medill Spiegel Research Center, נורת'ווסטרן, 2017). ההשפעה גדולה יותר במוצרים יקרים: +380% מול +190%. ([Spiegel](https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/), [Kim, Maslowska & Malthouse 2017 (PDF)](https://spiegel.medill.northwestern.edu/wp-content/uploads/sites/2/2021/07/Kim-Maslowska-Malthouse-2017-IJA.pdf))
- **תמונות לקוחות.** לפי PowerReviews (נתוני 2021), המרה של מבקרים שמתעניינים בתמונות משתמשים גבוהה ב-106.3%. ([PowerReviews 2022](https://www.powerreviews.com/conversion-impact-ugc-2022/))
- **מצב ריק כנה.** "עדיין אין ביקורות מאושרות… בלי ביקורות קנויות" ממיר חיסרון לאות אמינות במקום להמציא ביקורות.

## 3. איסור הטעיה

- לא הומצאה אף ביקורת, אף מספר "הוזמן X פעמים" ואף מחיר "לפני".
- כלל ה-FTC ‏16 CFR 465 (בתוקף מ-21.10.2024) אוסר ביקורות מזויפות, כולל ביקורות שנוצרו ב-AI, ודיכוי ביקורות. ([FTC](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials), [Federal Register](https://www.federalregister.gov/documents/2024/08/22/2024-18519/trade-regulation-rule-on-the-use-of-consumer-reviews-and-testimonials))
- בישראל חל איסור הטעיה לפי חוק הגנת הצרכן (סעיף 2). ⚠️ לבדיקת עו"ד לפני השקה.
- מודרציה לא מוחקת ביקורות שליליות לגיטימיות. "דחייה" מיועדת לתוכן פוגעני, ספאם או פרטים אישיים. **ממתין לך:** לנסח מדיניות מודרציה ולפרסם אותה בתקנון.

## 4. אבטחה (Security Baseline) — סטטוס לכל רכיב

| כלל | חיפוש | המלצות | ביקורות |
|---|---|---|---|
| 1 מחיר בשרת | מחיר מוצג מהקטלוג בשרת בלבד | "הוספה" מנווטת לעמוד החלל, והמחיר מחושב מחדש בצ'קאאוט | — |
| 2 לקוח נקי | ב-state רק טקסט החיפוש | ללא אחסון | ב-state רק טיוטת טקסט ותצוגות blob מקומיות |
| 4 GROQ | אינדקס בזיכרון, ללא GROQ דינמי | — | שאילתות עם `$spaceId`/`$userId` בלבד ו-projection מפורש (בלי מזהה משתמש או הזמנה) |
| 5 Zod + אורך | 1–60 תווים ו-regex של אותיות | `sanityIdSchema`, דקות מיושרות ל-30 | דירוג 1–5, טקסט 20–1000, honeypot, מזהה חלל ב-regex |
| 6 Plain text | — | — | הצגה כטקסט בלבד, הסרת תווי בקרה ו-bidi override (מניעת זיוף כיוון טקסט) |
| 7 הרשאה בשרת | ציבורי | ציבורי | `getClaims` בשרת, זכאות לפי הזמנה ששולמה והתחילה, ביקורת אחת למשתמש לחלל (מזהה דטרמיניסטי ו-`create`, כך שמרוץ מחזיר 409) |
| Rate limit | `search` ‏60/דקה ל-IP | `recommendations` ‏60/דקה | `reviewSubmit` ‏5/שעה למשתמש ו-`reviewDaily` ‏300/יום גלובלי |
| CAPTCHA | — | — | Turnstile עם action ‏`review` |
| CSRF | GET בלבד | GET בלבד | בדיקת `Origin` מול host (route handler לא מקבל את ההגנה המובנית של Server Actions) |

**העלאת תמונות:**
- הדפדפן מקטין לתמונה של עד 1600px ומקודד מחדש, מה שגם מסיר EXIF.
- השרת מגביל את גוף הבקשה בקריאה זורמת ל-~4.6MB, מתחת לתקרה של Vercel.
- כל קובץ עד 1.5MB, עד 3 קבצים.
- בדיקת magic bytes ל-JPEG/PNG/WebP בלבד, כך ש-SVG בשם `.jpg` נדחה.
- `sharp` עם `limitInputPixels` של ‏40MP (הגנה מפצצות דחיסה), סיבוב לפי EXIF וקידוד מחדש ל-WebP **בלי מטא-דאטה**.
- שם קובץ אקראי (UUID) והעלאה ל-assets של ה-dataset הפרטי `customers`.

**בדיקות:** ‏`src/lib/server/review-images.test.ts` מוכיח ש-EXIF שהוכנס לקובץ נעלם בפלט. `npm test` עבר: ‏40/40.

**מגבלה ידועה (⚠️):** תמונות ב-Sanity assets נגישות לכל מי שמחזיק את ה-URL, גם כשה-dataset פרטי. ה-URL לא ניתן לניחוש (hash), אבל תמונה של ביקורת ממתינה אינה "סודית" במובן הקריפטוגרפי. Private assets דורשים תוכנית Enterprise של Sanity. **ממתין לך:** להחליט אם זה מקובל.

## 5. מה צריך להגדיר בסביבה כדי שזה יעבוד בפועל (ממתין לך)

1. **Sanity:** webhook שני על ה-dataset ‏`customers`.
   - Filter: `_type == "review"`, Projection: `{_type,_id}`.
   - אותו endpoint ‏`/api/sanity/webhook` ואותו סוד.
   - בלעדיו ביקורת מאושרת תופיע תוך עד 10 דקות (revalidate 600).
2. **Supabase:** הרצת migration ‏`0005_cro.sql` (RPC ‏`space_co_bookings`).
3. **Turnstile:** מפתחות קיימים כבר עבור login ו-checkout, אותם מפתחות. צריך לוודא שה-widget מאשר את ה-action ‏`review`.
4. **Studio:** במרחב "לקוחות (פרטי)" נוספו שלוש רשימות (ממתינות, מאושרות, נדחו) עם כפתורי "אישור ופרסום" ו"דחייה". תוכן הביקורת נעול לעריכה.

## 6. A/B מוצע (לשלב 2D)

- **מגירת סיכום מול מעבר ישיר לצ'קאאוט.** מדד ראשי: השלמת תשלום. משני: AOV ושיעור הוספת תוספות.
- **ניסוח סיבת ההמלצה** ("מגיעים מוקדם?" מול "לקוחות מזמינים גם"). מדד: CTR על כרטיס.
