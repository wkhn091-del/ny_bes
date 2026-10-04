# סקריפט 3 · מודול A — מבצר אבטחה (Defense in Depth)

תאריך: 04.10.2026 · Next.js 16.3.8 · נבדק מול הקוד בפועל, לא מול זיכרון.

מקרא: ✅ מיושם ונבדק · ⚠️ מיושם חלקית / תלוי בך · ❌ לא מיושם · 🔒 החלטה שלך (לא נגעתי לפי חוק האבטחה הגורף)

## הנחות שקיבלתי במקום שאלות הראיון (אתה ישן — סימנתי כדי שתאשר/תתקן)

| שאלה בסקריפט | ההנחה שלי |
|---|---|
| איפה מתארחים? | Vercel (Production + Preview), Supabase eu-central-1, Sanity, Upstash Redis |
| יש תשלום אורח (בלי חשבון)? | לא. התחברות לפני תשלום — החלטה מתועדת מסקריפט 2 C. לכן "guest token" לא רלוונטי כרגע |
| מי מנהל את ה-Studio? | עד 3 עורכים; חובה 2FA ב-Sanity (ראה סעיף 16) |
| העלאות קבצים? | רק תמונות ביקורות (עד 3 × 5MB), דרך `/api/reviews` בלבד |
| מייל איש קשר לאבטחה | משתמש ב-`legal@spacehub.co.il` מה-CMS — **ממתין לך**: כתובת אמיתית (מומלץ `security@`) |
| WAF | Vercel Firewall (מובנה). כללים מתקדמים — **ממתין לך** (דורש גישה לדשבורד) |

---

## שכבה אחר שכבה — מה מגן ומה לא

| שכבה | מגינה מפני | **לא** מגינה מפני |
|---|---|---|
| Proxy (`src/proxy.ts`) | גישה אנונימית לדפים פרטיים, קאשינג של דפים פרטיים, הזרקת סקריפט (CSP+nonce) | עקיפת הרשאה — לכן כל דף/Action בודק שוב בשרת |
| CSP nonce + strict-dynamic | XSS בהזרקת `<script>`, inline handlers, eval | XSS דרך `style` (נשאר `unsafe-inline` לסגנונות — מוצדק ב-B), באגים בלוגיקה |
| Server-Side Truth (מחיר מ-Sanity בשרת) | שינוי מחיר/הנחה בצד לקוח | טעות מחיר ב-CMS עצמו |
| RLS ב-Postgres (כל 15 הטבלאות) | IDOR גם אם קוד אפליקציה שוכח בדיקה | שימוש ב-service role (עוקף RLS — רק בקבצי `server-only`) |
| Rate limit (Upstash, fail-closed ב-Vercel) | brute force ל-OTP, ספאם, card-testing בסיסי | DDoS נפחי (זה תפקיד ה-WAF/CDN) |
| חתימות Webhook + timestamp + dedupe | זיוף אירועים, replay | דליפת הסוד עצמו — לכן רוטציה נתמכת |
| Zod על env + קלט | ערכים שבורים/ארוכים, הזרקה דרך פרמטרים | לוגיקה עסקית שגויה בערכים חוקיים |
| Turnstile + honeypot | בוטים זולים | חוות אנושיות (לזה — rate limit + Radar) |

---

## רמה A — חובה לפני השקה

| # | סעיף | סטטוס | ראיה |
|---|---|---|---|
| 1 | שלמות סל | ✅ | הלקוח שולח `spaceId`, שעות, תוספות בלבד; המחיר מחושב ב-`actions/checkout.ts` מול Sanity |
| 2 | Webhooks: חתימה + timestamp + idempotency | ✅ | Stripe: `constructEvent` (סובלנות 300ש׳ ברירת מחדל) + טבלת `stripe_events`. Auth: HMAC + `WEBHOOK_TOLERANCE_SECONDS=300` + `timingSafeEqual` + רוטציה (כמה חתימות). Sanity: `isValidSignature` |
| 3 | CSP nonce + כותרות | ✅ **(הושלם הלילה)** | נוספו `Cross-Origin-Resource-Policy: same-origin`, `X-DNS-Prefetch-Control: off`, `productionBrowserSourceMaps: false` (נמדד: 0 קבצי `.map` ב-`.next/static`). כולל דיווח CSP (סעיף 31) |
| 4 | Rate limiting | ✅ | 17 מגבילים ב-`rate-limit.ts`; נוספו הלילה `cspReport` ו-`health` |
| 5 | סניטציה של קלט | ✅ | Zod עם `max()` בכל Action/Route; תוכן משתמש כ-Plain Text; אין `dangerouslySetInnerHTML` בכל `src/` (grep: 0) |
| 6 | Server Actions | ✅ **(הושלם הלילה)** | `experimental.serverActions.bodySizeLimit: '256kb'` (אין Action שמקבל קובץ — נבדק). `allowedOrigins` הושאר ריק בכוונה = רק same-origin (הכי מחמיר לפי התיעוד של Next 16). `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` נוסף ל-Zod (בסיס64 של 32 בתים) ול-`.env.example` — **ממתין לך** להגדיר ב-Vercel |
| 7 | הרשאות / IDOR | ✅ | קוד הזמנה אקראי 8 תווים (`customAlphabet`, 32^8≈1.1×10¹²) + בדיקת בעלות בשרת + RLS. אין תשלום אורח ⇒ אין guest token |
| 8 | Session + OTP | ✅ | בוצע בסקריפט 1 C: מגבלות לפי IP ולפי מייל, תקציב יומי, step-up, התנתקות מכל המכשירים, התראת מכשיר חדש |
| 9 | סודות | ✅ | `env.server.ts` מתחיל ב-`server-only`, Zod, חסר-בפרודקשן ⇒ הדיפלוי נכשל. סריקת סודות מקומית: 0 ממצאים (רק hash-ים של lockfile). gitleaks נוסף ל-CI |
| 10 | Sanity | ⚠️ | טוקן קריאה ≠ טוקן כתיבה, GROQ עם פרמטרים + projection. **ממתין לך**: CORS origins בפרויקט Sanity רק לדומיין שלך, 2FA לעורכים |
| 11 | תשלום ומלאי / ניצול לוגיקה | ✅ | מניעת חפיפה ב-Postgres (exclusion), סכום מחושב בשרת, קופון — ההנחה הגבוהה מבין השתיים בלבד, החזר אוטומטי רק לפי מדיניות |
| 12 | Cache safety | ✅ | `private, no-store` לדפים פרטיים (proxy) ול-`/api/*`; נכסי 3D ציבוריים בלבד `public` (נמדד ב-curl) |
| 13 | XSS sinks, JSON-LD, returnUrl | ✅ | `safeReturnUrl` עם allowlist. JSON-LD (מודול B) עם `serializeJsonLd` שמחליף `< > & U+2028 U+2029` — טסט מוכיח שאין יציאה מ-`</script>` |
| 14 | Turnstile + honeypot | ✅ | Turnstile בלוגין/צ׳קאאוט/ביקורות; honeypot בביקורות (עם טסט) |
| 15 | Revalidate / draft / health | ✅ **(health הלילה)** | Revalidate רק דרך webhook חתום; אין draft mode באתר (grep: 0); `/api/health` מחזיר `{"status":"ok"}` בלבד, `no-store`, מוגבל קצב |
| 16 | 2FA + שרשרת אספקה | ⚠️ | lockfile ✅, `overrides` הוסיפו תיקון לחבילות פגיעות (ראה למטה). **ממתין לך**: 2FA ב-GitHub/Vercel/Supabase/Sanity/Stripe/Resend/Cloudflare |

### npm audit — לפני ואחרי (נמדד הלילה)

- לפני: **21** פגיעויות ב-production (11 high, 10 moderate, 0 critical).
- כולן מגיעות דרך כלי ה-CLI/build של `sanity@6.17.0` (שכבר בגרסה העדכנית). "התיקון" ש-npm מציע הוא **שדרוג לאחור** ל-sanity 5 — דחיתי.
- הוספתי `overrides` בתוך אותה גרסה ראשית: `adm-zip ^0.6.1`, `js-yaml@3 → ^3.15.2`, `smol-toml ^1.9.0`, `undici@7 → ^7.30.0`, `uuid → ^11.1.1`.
- אחרי: **11 high, 0 moderate, 0 critical**. כל ה-11 הם שרשרת `braces@3.0.3` (DoS בתבנית glob מקוננת) — **אין גרסה מתוקנת בכלל**, והתבניות מגיעות מקונפיג build, לא מקלט משתמש ⇒ סיכון מקובל, מתועד. Dependabot יפתח PR כשיצא תיקון.
- נבדק אחרי השינוי: `sanity --version` עובד, `npm run build` הצליח (exit 0).

## רמה B — תוך 30 יום

| # | סעיף | סטטוס | ראיה / מה חסר |
|---|---|---|---|
| 17 | העלאות | ✅ | `image-guard`: בדיקת magic bytes, גודל, re-encode ב-sharp (מסיר EXIF/GPS) |
| 18 | CORS ו-API | ✅ | אין `Access-Control-Allow-Origin` באף route ⇒ same-origin בלבד; כל ה-API `no-store` |
| 19 | Dependabot + audit ב-CI | ✅ **(הלילה)** | `.github/dependabot.yml` (שבועי, מקובץ לפי משפחות) + `.github/workflows/ci.yml`: typecheck, lint, test, audit (critical), build, gitleaks. **ממתין לך**: לדחוף ל-GitHub כדי שירוץ |
| 20 | ניטור, audit log, WAF | ⚠️ | Sentry + `logError`; טבלאות `auth_webhook_events`, `known_devices`. **ממתין לך**: Vercel Firewall rules, התראות Sentry |
| 21 | CSV injection | ✅ | `src/lib/export/csv.ts` (מודול B): `'` לפני `= + - @ Tab CR`, LRM, BOM — 5 טסטים |
| 22 | SSRF + allowlist תמונות | ✅ | `images.remotePatterns` מוגבל ל-3 דומיינים; השרת לא מושך URL שהמשתמש סיפק |
| 23 | סקריפטים צד-שלישי | ✅ | רק Turnstile ו-Vercel Analytics, נטענים תחת nonce/strict-dynamic |
| 24 | SPF/DKIM/DMARC, CAA, DNSSEC, CRLF | ❌ **ממתין לך** | דורש דומיין אמיתי + Resend. רשימת רשומות DNS מוכנה תצא במודול B |
| 25 | Auth webhook | ✅ | ראה סעיף 2 |
| 26 | מודרציית ביקורות | ✅ | ביקורת נכנסת `pending`, מוצגת רק אחרי אישור ב-Studio. מדיניות כתובה — **ממתין לך** |
| 27 | היגיינת שגיאות ולוגים | ✅ | שגיאה גנרית ללקוח, פירוט ב-`logError`; דיווחי CSP נשמרים בלי query string (טסט) |
| 28 | גיבוי ושחזור | ⚠️ **ממתין לך** | Supabase PITR דורש תוכנית Pro; Sanity — `sanity dataset export` חודשי |

## רמה C — מתקדם

| # | סעיף | סטטוס | ראיה / מה חסר |
|---|---|---|---|
| 29 | הגנה מהשתלטות חשבון | ✅ | OTP + Google בלבד (אין סיסמאות ⇒ אין credential stuffing), התראת מכשיר חדש, step-up לפעולות רגישות |
| 30 | Card testing | ⚠️ | rate limit לצ׳קאאוט (10/10 דק׳) + Turnstile + התחברות חובה. Stripe Radar ו-3DS פעילים כברירת מחדל ב-Checkout. **ממתין לך**: כללי Radar |
| 31 | CSP reporting, Trusted Types | ✅ / ⚠️ | **הלילה**: `/api/csp-report` (תקרת 16KB, Zod, rate limit, הסרת query string), `report-uri` + `report-to` + `Reporting-Endpoints`. נבדק: דיווח סינתטי נרשם כ-`script-src-elem blocked https://evil.example {page:'/'}`; ביקור אמיתי בדף הבית — 0 הפרות. Trusted Types לא הופעל: React/Framer/three עדיין לא תומכים בלי policy מותאם — סיכון שבירה |
| 32 | עוגיות `__Host-` | ⚠️ | שמות עוגיות Supabase נקבעים ע״י `@supabase/ssr` (`sb-…`); הן כבר `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`. שינוי לשם `__Host-` ישבור את ה-SDK |
| 33 | הגנת מידע ושמירה | ✅ | מחיקת חשבון (סקריפט 1 C), cron תחזוקה מנקה רשומות ישנות |
| 34 | פרטיות (תיקון 13) והסכמה | ⚠️ | מדיניות פרטיות קיימת. באנר הסכמה ל-GA4/Pixel ייבנה במודול B (נטען רק אחרי הסכמה) |
| 35 | ReDoS ו-timeouts | ✅ | כל הביטויים הרגולריים בקוד ליניאריים וקלט מוגבל אורך לפני regex |
| 36 | WAF וחוקי גאו | ❌ **ממתין לך** | דורש דשבורד Vercel/Cloudflare |
| 37 | ZAP pentest | ❌ | לא הורץ — ZAP לא מותקן במכונה, ולא אריץ סריקה אקטיבית בלי אישור שלך. פקודה מוכנה: `docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://<domain>` |
| 38 | Go-Live + security.txt | ✅ **(הלילה)** | `/.well-known/security.txt` לפי RFC 9116 (Contact מה-CMS, Expires מתחדש יומית לחצי שנה קדימה). צ׳קליסט Go-Live — במודול B |

---

## מה שונה הלילה (קבצים)

- `next.config.ts` — CORP, X-DNS-Prefetch-Control, Reporting-Endpoints, `productionBrowserSourceMaps:false`, `serverActions.bodySizeLimit`.
- `src/lib/security/csp.ts` — `report-uri` + `report-to`.
- `src/lib/security/csp-report.ts` + טסט — פרסור שני הפורמטים, הסרת מידע רגיש.
- `src/app/api/csp-report/route.ts`, `src/app/api/health/route.ts`, `src/app/.well-known/security.txt/route.ts`.
- `src/lib/env.server.ts`, `.env.example` — `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- `src/app/sitemap.ts` — דפי `/book/*`.
- `package.json` — `overrides`.
- `.github/dependabot.yml`, `.github/workflows/ci.yml`.

## אימות (הורץ בפועל)

- `tsc --noEmit` → 0 · `eslint` → 0 · `npm test` → 44/44 · `npm run build` → exit 0.
- curl לשרת production (פורט 3100): כל הכותרות קיימות; `/api/health` 200 + `no-store`; `/book/nope` 404; sitemap כולל 4 דפי `/book`.
