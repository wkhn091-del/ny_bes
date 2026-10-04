# סקריפט 2 · מודול ב — תלת־ממד ריאליסטי, ביצועים, נגישות ו-CSP

תאריך: 04.10.2026 · כל המספרים כאן נמדדו בפועל על המחשב המקומי (build פרודקשן, `next start -p 3100`).

## 1. מה נבנה

| רכיב | קובץ | מה הוא עושה |
| --- | --- | --- |
| ערכת ריהוט GLB דחוסה ב-Draco | `scripts/build-office-kit.mts` → `public/models/office-kit.glb` (~35KB) | כיסא משרדי מרופד, עציץ, מסך, מנורה תלויה, דמות יושבת. נבנה מקוד (בלי מודלים בתשלום / רישיון לא ברור). `npm run build:3d` |
| מפענח Draco מקומי | `public/draco/*` | מועתק מ-three (אותה גרסה), לא נטען מ-CDN חיצוני → אין צורך לפתוח `connect-src`/`script-src` לדומיין זר |
| סצנת R3F | `src/components/home/FloorMap3D.tsx` | `useGLTF(url, '/draco/')` + `Merged` (GPU instancing), זכוכית פיזיקלית, פסי LED פועמים לפי זמינות אמת, אנשים יושבים רק בעמדות/חדרים תפוסים באמת, תאורת סטודיו בלי רשת (`Lightformer`), צללים רכים, `PerformanceMonitor` שמוריד איכות במכשיר חלש |
| Suspense בלי מסך לבן | אותו קובץ | ה-fallback הוא הקומה עצמה (קירות, שולחנות, סטטוס) — הריהוט "נוחת" כשהוא מוכן; שעון אינטרו משותף כדי שהאנימציה לא תתחיל מחדש |
| מצב טעינה מעוצב | `src/components/home/FloorMap.tsx` (`MapLoading`) | קווי מתאר איזומטריים של הקומה + ספינר, `role="status"`, מכבד `prefers-reduced-motion` |
| טעינה דחויה | `useDeferredMount` | התלת־ממד נטען רק כשהמפה קרובה למסך **וגם** הדפדפן פנוי (`requestIdleCallback`) |
| זיהוי GPU תוכנתי | `hasHardwareWebGL` | SwiftShader/llvmpipe/"Basic Render" → מפה דו־ממדית (אחרת הדף קופא) |
| רינדור לפי דרישה | `frameloop` | רינדור רציף רק באינטרו (3.5 שנ׳) ובזמן ריחוף; אחרת `demand`; מחוץ למסך `never` |
| Optimistic UI עם Rollback | `src/components/spaces/FavoriteButton.tsx` | הלב מתעדכן מיד; לחיצות מהירות מתקבצות לבקשה אחת (debounce 350ms, "הכוונה האחרונה מנצחת"); בקשות סדרתיות; כשל → חזרה למצב האחרון שאושר בשרת + הודעה ב-`aria-live`. בשרת: Zod + `rateLimit('accountMutation')` + בדיקת session |

**למה לא "עגלה" אופטימית:** באתר הזמנות אין עגלה מרובת פריטים — הבחירה נשמרת מקומית (מזהים בלבד, `stores/cart.ts`) והמחיר מחושב בשרת בתשלום. הפעולה הקרובה ל"הוספה לעגלה" שנוגעת בשרת היא שמירה למועדפים, ושם יושם הדפוס.

## 2. ביצועים — לפני/אחרי (Lighthouse 12, Edge headless)

| מדידה | לפני התיקון | אחרי |
| --- | --- | --- |
| Mobile Performance | 53 | **65** |
| Mobile TBT | 23,420ms | **1,013ms** |
| Mobile LCP | 3.6s | 4.0s (הכותרת H1; עיכוב רינדור מסימולציית CPU פי 4 — לא תמונה) |
| Mobile CLS | 0 | 0 |
| Mobile A11y / BP / SEO | 100 / 96 / 92 | **100 / 96 / 100** |
| Desktop Performance | נכשל (NO_NAVSTART — ה-main thread היה חסום) | **99** (LCP 0.86s, TBT 74ms) |
| Desktop A11y / BP / SEO | — | 96 / 96 / 100 |

הסבר הנקודות שנותרו:
- **BP 96**: `/_vercel/insights/script.js` מחזיר 404 מקומית — קיים רק בפריסה ב-Vercel. לא באג.
- **Desktop A11y 96**: ניגודיות על אלמנטים עם `.reveal` (אנימציית גלילה CSS) שעדיין מחוץ למסך ונמצאים באמצע fade. כשמנטרלים את האנימציה — axe מחזיר **0 הפרות** (ראו סעיף 3). המשתמש תמיד רואה אותם באטימות מלאה.
- **Mobile LCP 4.0s**: עיכוב רינדור בסימולציה בגלל JS של hydration (React/Next). מנוף המשך: לצמצם JS בדף הבית — נבדק בסקריפט 5.

## 3. נגישות (WCAG 2.1 AA) — axe-core 4.13 בדפדפן

| עמוד | הפרות |
| --- | --- |
| `/` | 0 (51 בדיקות ניגודיות "incomplete" = טקסט מעל תמונה/גרדיאנט — דורש בדיקה ידנית) |
| `/spaces` | 0 |
| `/spaces/tlv-rothschild-meeting-small` | 1 → **0** (תוקן: `<p>` בתוך `<dl>` בסיכום המחיר) |
| `/login` | 0 |
| `/branches/tlv-rothschild` | 0 |

קיים: skip link "דילוג לתוכן הראשי", `lang="he" dir="rtl"`, פוקוס־טראפ במגירות, `aria-pressed`, `aria-live` למחיר ולשגיאות, רשימת חללים `sr-only` כחלופה למפת התלת־ממד, ומפה דו־ממדית למי שמבקש `prefers-reduced-motion`.

## 4. CSP — רשימת ה-Directives הנדרשים (פרודקשן, נמדד מה-header בפועל)

```
default-src 'self'
script-src 'self' 'nonce-{per-request}' 'strict-dynamic' 'wasm-unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob: https://images.unsplash.com https://cdn.sanity.io
font-src 'self'
connect-src 'self' {SUPABASE_URL} {SENTRY_INGEST} https://challenges.cloudflare.com https://vitals.vercel-insights.com
frame-src https://challenges.cloudflare.com
worker-src 'self' blob:
object-src 'none'
base-uri 'self'
form-action 'self' https://checkout.stripe.com {SUPABASE_URL} https://accounts.google.com
frame-ancestors 'none'
upgrade-insecure-requests
```

- **אין `unsafe-eval` ואין `unsafe-inline` בסקריפטים.** `'unsafe-eval'` מתווסף רק ב-`next dev`. מאומת בבדיקה אוטומטית `src/lib/security/csp.test.ts`.
- **`'wasm-unsafe-eval'`** — מאפשר רק קומפילציה של WebAssembly (מפענח Draco), לא `eval` של JS. אומת בפרודקשן: Worker מ-`blob:` קימפל את ה-wasm (`wasm-ok`), ובאותו דף `new Function()` נחסם, ו-0 אירועי `securitypolicyviolation`.
- **`worker-src blob:`** — DRACOLoader מריץ את הפענוח ב-Web Worker (מחוץ ל-main thread).
- **`style-src 'unsafe-inline'`** — נשאר מודע: React `style={}` ו-drei `<Html>` כותבים style attributes. אי אפשר לשים nonce על attribute. סיכון נמוך (אין הרצת קוד מ-CSS); חלופה עתידית `style-src-attr 'unsafe-inline'` + `style-src-elem 'self' 'nonce-…'` דורשת בדיקה מול כל הספריות.
- ה-nonce נוצר ב-`src/proxy.ts` לכל בקשה, מועבר ב-`x-nonce`, ו-`layout.tsx` מעביר אותו ל-`ThemeProvider` (הסקריפט היחיד inline).
- iframe מאותו origin נחסם (`frame-ancestors 'none'` + `X-Frame-Options: DENY`) — נצפה בפועל בזמן הבדיקות.

## 5. Caching בטוח

- `/api/*` → `Cache-Control: no-store` (next.config).
- `/checkout`, `/account`, `/admin`, `/login`, `/auth` → `private, no-store, max-age=0` (proxy).
- `/models/*`, `/draco/*` → `public, max-age=86400, stale-while-revalidate=604800` (קבצים ציבוריים, לא אישיים, לא hashed → לא `immutable`).
- **PWA / Service Worker: לא הותקן בכוונה.** אין SW = אין סיכון שדף פרטי (הזמנות, פרטי לקוח) יישמר במטמון של המכשיר. אם יוסף בעתיד — כללים מחייבים: precache רק ל-`/_next/static/*`, `/models/*`, `/draco/*`; `NetworkOnly` ל-`/api/*`, `/account*`, `/checkout*`, `/admin*`, `/login`, `/auth*`; לא לשמור תגובות עם `Set-Cookie` או `Cache-Control: private/no-store`; ניקוי מטמון ב-logout.

## 6. הנחות שהנחתי (בלי לשאול, לפי ההוראה)

1. מודלים נבנו מקוד במקום מודלים מוכנים מ-Sketchfab וכו' — בלי סיכון רישוי, 35KB בלבד.
2. מכשירים בלי GPU אמיתי מקבלים מפה דו־ממדית — עדיף מדף קפוא.
3. אחרי האינטרו התלת־ממד "נח" (רינדור לפי דרישה) וחוזר לחיים בריחוף — חוסך סוללה ו-CPU.

## 7. ראיות

- `npx tsc --noEmit` → 0 שגיאות · `npx eslint` → 0 · `npm test` → 41/41 · `npm run build` → exit 0.
- צילומים: `s2b-3d-crop-light.png`, `s2b-3d-crop-dark.png`, `s2b-3d-prod-crop.png` (תיקיית screenshots).
- דוחות Lighthouse JSON: `%TEMP%\lh\home-mobile3.json`, `home-desktop3.json`.
