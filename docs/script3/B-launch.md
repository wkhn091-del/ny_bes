# סקריפט 3 · מודול B — השקה לציבור (Production, Launch & Scale)

תאריך: 04.10.2026 · כל מה שכתוב כאן "✅" נבנה ונבדק הלילה על build של production (פורט 3100).

## שלב 1 — תשובות הראיון (ההנחות שלי, לאישורך)

| קבוצה | שאלה | ההנחה שלי | למה |
|---|---|---|---|
| 1 | אחסון | Vercel (Pro מומלץ ל-Deployment Protection ו-Firewall) | Next 16 + ISR + Cron עובדים שם בלי תצורה |
| 1 | PWA? | **Manifest בלבד, בלי Service Worker** | התקנה למסך הבית ללא סיכון של שמירת דפים אישיים/צ׳קאאוט במטמון (חוק ברזל 9) |
| 2 | סליקה | Stripe Checkout (קיים) | 3DS + Radar מובנים, אין נתוני כרטיס אצלנו (PCI SAQ-A) |
| 2 | משלוחים | **לא רלוונטי** — שירות, לא מוצר פיזי | אין "משלוח חינם מעל X". המקבילה הקיימת: 10% הנחה אוטומטית מ-4 שעות |
| 3 | התראות | Resend (מייל ללקוח) + Telegram (לצוות הסניף) — קיים. WhatsApp: כפתור צ׳אט בלבד | WhatsApp Business API דורש אישור Meta ותבניות — **ממתין לך** |
| 3 | עגלה נטושה | **לא שומרים** | ריטארגטינג לפי עגלה = עיבוד מידע אישי לשיווק בלי הסכמה מפורשת (תיקון 13). חלופה: תזכורת רק למי שסימן הסכמה לדיוור — **ממתין לך** |
| 4 | GA4 | ✅ מוטמע, נטען **רק אחרי הסכמה** | אירועים: `page_view`, `view_item`, `begin_checkout`, `purchase` |
| 4 | Meta Pixel | **לא מוטמע** | עד שתחליט על קמפיין ממומן. אותו מנגנון הסכמה יתמוך בו |
| 5 | Sitemap | ✅ דינמי מהקטלוג: חללים, סניפים, 4 דפי `/book/*`, משפטי | |
| 5 | OG | ✅ תמונת חלל לכל עמוד חלל; כרטיס ממותג 1200×630 כברירת מחדל | |

### חוק ברזל 2 — OTP בטלפון: לא יושם, ובכוונה

הכניסה היום: קוד חד-פעמי למייל + Google (בלי סיסמאות בכלל — כבר עונה על "לא אימייל/סיסמה מיושנים").
SMS OTP דורש ספק (Twilio / Vonage / 019) דרך Supabase Phone Auth, **עולה כסף לכל הודעה** וחשוף להונאת SMS-pumping. לא חיברתי ספק ולא כתבתי קוד חצי-עובד (חוק "בלי placeholders").
**ממתין לך**: לבחור ספק. אז מוסיפים: Supabase → Auth → Phone, מגבלת קצב לפי מספר + IP (המגבילים `otpSendIp`/`otpVerify` כבר קיימים), Turnstile לפני שליחה, וחסימת קידומות בינלאומיות.

---

## שלב 2 — צ׳קליסט השקה

### 2.1 מפתחות וסודות שאני צריך ממך

| משתנה | מאיפה | הערה |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | הדומיין שלך | בלי `/` בסוף |
| `NEXT_PUBLIC_SANITY_PROJECT_ID`, `SANITY_API_READ_TOKEN`, `SANITY_API_WRITE_TOKEN`, `SANITY_WEBHOOK_SECRET` | sanity.io/manage | טוקן קריאה = Viewer, כתיבה = Editor, נפרדים |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | פרויקט **נפרד** ל-Staging ול-Production |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe → Developers | `sk_test_` ב-Preview, `sk_live_` רק ב-Production |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend | אחרי אימות דומיין (DKIM) |
| `TELEGRAM_BOT_TOKEN` | @BotFather | |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare | |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash | חובה ב-Vercel — בלעדיו ה-rate limit נועל (fail-closed) |
| `CRON_SECRET`, `AUTH_WEBHOOK_SECRET` | `openssl rand -base64 48` | אותו ערך גם ב-Supabase Vault |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | `openssl rand -base64 32` | **חדש הלילה** |
| `CSV_EXPORT_TOKEN` | `openssl rand -base64 48` | **חדש הלילה**, אופציונלי (ל-Google Sheets) |
| `NEXT_PUBLIC_GA4_ID` | GA4 → Admin → Data streams | **חדש הלילה**, אופציונלי |
| `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN` ל-source maps) | Sentry | |

### 2.2 תמונות ותוכן שאני צריך ממך

- צילומים אמיתיים לכל סניף וחלל (מינימום 1600px רוחב). היום יש תמונות Unsplash ותמונת דגל אחת.
- מחירים אמיתיים (היום — מחירי דמו).
- פרטי חברה אמיתיים (ח.פ, כתובת) — כרגע מסומן "דמו" באתר.
- כתובת מייל לאבטחה (`security@...`) ל-`security.txt`.
- תמונת שיתוף ב-Sanity → SEO (אחרת משמש הכרטיס הממותג `src/app/opengraph-image.png`).

### 2.3 רשומות DNS (להחליף `example.co.il` בדומיין שלך)

| סוג | שם | ערך | למה |
|---|---|---|---|
| A / CNAME | `@` / `www` | לפי Vercel (`cname.vercel-dns.com`) | |
| TXT | `@` | `v=spf1 include:amazonses.com ~all` | SPF — Resend שולח דרך SES. אם יש Google Workspace: להוסיף `include:_spf.google.com` |
| TXT / CNAME | `resend._domainkey` | הערך שמוצג ב-Resend → Domains | DKIM |
| MX | `send` | `feedback-smtp.<region>.amazonses.com` (מ-Resend) | bounce handling |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@example.co.il; adkim=s; aspf=s` | להתחיל ב-`none`, אחרי שבועיים נקיים → `quarantine`, ואז `reject` |
| CAA | `@` | `0 issue "letsencrypt.org"` ו-`0 issue "pki.goog"` | רק רשויות ש-Vercel משתמשת בהן יכולות להנפיק תעודה |
| CAA | `@` | `0 iodef "mailto:security@example.co.il"` | דיווח על ניסיון הנפקה |
| — | DNSSEC | להפעיל אצל רשם הדומיין | מונע הרעלת DNS |

### 2.4 חשבונות שחייבים 2FA (מפתח חומרה / אפליקציה, לא SMS)

GitHub · Vercel · Supabase · Sanity (כל עורך) · Stripe · Resend · Cloudflare · Upstash · Sentry · Google (GA4 + Workspace) · רשם הדומיין · Telegram (סיסמת דו-שלבי לבוט).

### 2.5 Launch Security Gate (חוק ברזל 7 + 8)

- [ ] כל סעיפי רמה A ב-`A-security-fortress.md` ✅ (נותרו 10 ו-16 — שניהם הגדרות חשבון שתלויות בך)
- [ ] מפתחות Staging ≠ Production (Supabase, Stripe test/live, Sanity dataset)
- [ ] Vercel → Deployment Protection על Preview (Vercel Authentication)
- [ ] Draft Mode — אין באתר (נבדק: 0 שימושים)
- [ ] SPF + DKIM + DMARC עוברים (`dig TXT _dmarc.example.co.il`, mail-tester.com ≥ 9/10) **לפני** המייל הראשון
- [ ] Sentry alerts על שגיאות 5xx + Uptime ping ל-`/api/health` (Better Stack / UptimeRobot כל 5 דק׳)
- [ ] Stripe webhook מוגדר ל-`/api/stripe/webhook` עם האירועים `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `charge.refunded`
- [ ] Sanity webhooks (ראה 3.4)
- [ ] מיגרציות 0001–0005 הורצו ב-Production
- [ ] `npm audit --omit=dev --audit-level=critical` נקי (נכון להלילה: 0 critical)
- [ ] בדיקת קנייה אמיתית בסכום קטן + החזר

---

## שלב 3 — הקוד (נבנה הלילה, לא קטעים להעתקה — כבר בתוך הפרויקט)

### 3.1 JSON-LD (חוק ברזל 1) ✅

- `src/lib/seo/structured-data.ts` — `serializeJsonLd` מחליף `<` `>` `&` U+2028 U+2029 ב-`\uXXXX` (יותר מהדרישה של `<` בלבד). טסט מוכיח ש-`</script><script>alert(1)` לא יכול לצאת מהבלוק.
- עמוד חלל: `Product` + `Offer` (מחיר אמיתי לשעה, `ILS`, `valueAddedTaxIncluded: true`, `unitCode: HUR`) + `BreadcrumbList`. `aggregateRating`/`review` נכתבים **רק** כשיש ביקורות מאושרות ומאומתות — אף פעם לא ממציאים.
- עמוד סניף: `LocalBusiness` עם כתובת, טלפון ושעות פתיחה + `BreadcrumbList`.
- הערה על Baseline סעיף 6: `dangerouslySetInnerHTML` כאן הוא בלוק נתונים (לא HTML), והסניטציה המתאימה היא escaping של JSON — DOMPurify מיועד ל-HTML ולא היה מגן כאן. זו גם ההמלצה הרשמית בתיעוד של Next 16 (`02-guides/json-ld.md`).
- נמדד: `curl /spaces/tlv-rothschild-hot-desk` מחזיר את שני הבלוקים; `&` מופיע כ-`\u0026`.

### 3.2 `/api/health` (חוק ברזל 3) ✅

מחזיר `{"status":"ok"}` בלבד, `Cache-Control: no-store`, מוגבל ל-60 בקשות לדקה ל-IP.

### 3.3 ייצוא CSV + Google Sheets (חוק ברזל 4) ✅

- `src/lib/export/csv.ts` (+5 טסטים): BOM ל-Excel, CRLF, כל תא במירכאות, `'` לפני `= + - @ Tab CR`, **LRM (U+200E)** לפני קוד הזמנה / תאריך / שעות / ח.פ. סכומים נשארים מספרים (בלי LRM) כדי ש-SUM יעבוד.
- `GET /api/admin/bookings-export?from=YYYY-MM-DD&to=YYYY-MM-DD[&branch=slug]`:
  - כניסה עם session של צוות (מוגבל לסניפים שלו) **או** `Authorization: Bearer CSV_EXPORT_TOKEN` (`timingSafeEqual`).
  - טווח מקסימלי 92 יום, עד 5,000 שורות, `private, no-store`, rate limit 30/שעה.
  - **לא** מייצא מייל או טלפון של לקוח (צמצום מידע).
- כפתור "ייצוא החודש ל-CSV" בדף הניהול.
- Apps Script עם מנפץ קאש (`_=${Date.now()}`), להדביק ב-Extensions → Apps Script ולשמור את הטוקן ב-Script Properties:

```js
function importSpaceHubBookings() {
  const token = PropertiesService.getScriptProperties().getProperty('SPACEHUB_EXPORT_TOKEN');
  const tz = 'Asia/Jerusalem';
  const now = new Date();
  const from = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), tz, 'yyyy-MM-dd');
  const to = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0), tz, 'yyyy-MM-dd');
  const url = 'https://example.co.il/api/admin/bookings-export?from=' + from + '&to=' + to + '&_=' + Date.now();
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('SpaceHub export failed: HTTP ' + res.getResponseCode());
  const rows = Utilities.parseCsv(res.getContentText('UTF-8').replace(/^\uFEFF/, ''));
  const book = SpreadsheetApp.getActive();
  const sheet = book.getSheetByName('הזמנות') || book.insertSheet('הזמנות');
  sheet.setRightToLeft(true);
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}
```

Trigger: Triggers → Time-driven → כל שעה.

### 3.4 ISR ממוקד (חוק ברזל 5 + 6) ✅

- החלטה: לא פתחתי נתיב `/api/revalidate` נוסף — `/api/sanity/webhook` הקיים כבר מאמת חתימת Sanity (`parseBody` + `isValidSignature`) ומבצע `revalidateTag`. נתיב שני = עוד משטח תקיפה.
- ביקורות: תג לכל חלל (`sanity:reviews:<spaceId>`) — אישור ביקורת מרענן רק את החלל שלה.
- קטלוג: שאילתת GROQ אחת; רענון התג = קריאה אחת, בלי build מחדש. הגדרת webhook שיורה על חללים **רק כשמחיר/זמינות משתנים**:
  `_type != "space" || delta::changedAny((hourlyPrice, dayPassPrice, capacity, poolSize, active, slug))`
- Webhook שני (dataset `customers`): `_type == "review"`, projection `{_type, _id, spaceId}`.
- נתונים אישיים, הזמנות וצ׳קאאוט: `private, no-store` ב-proxy ו-`no-store` על כל `/api/*` (נמדד ב-curl). אין `revalidate` על שום דף פרטי.

### 3.5 GA4 עם הסכמה ✅

- `ConsentAnalytics`: באנר עם שני כפתורים **שווי משקל** ("מאשר/ת" / "רק הכרחיות"), בלי תיבה מסומנת מראש — שום בקשה ל-Google לפני לחיצה. `allow_google_signals: false`, בלי התאמה אישית של פרסום.
- CSP מתרחב לדומייני GA **רק** אם `NEXT_PUBLIC_GA4_ID` מוגדר ותקין; אחרת המדיניות נשארת זהה.
- `purchase` נשלח פעם אחת לכל הזמנה (`sessionStorage` + `transaction_id`), עם ערך מהשרת — לא מה-URL.
- לא נבדק מול GA4 אמיתי (אין מזהה) — **ממתין לך**.

### 3.6 מיילים RTL ✅ (קיים)

7 תבניות ב-`src/lib/notifications/email-templates.tsx` עם `<Html lang="he" dir="rtl">`: אישור, ביטול, תזכורת, שחרור, החזר בהתנגשות, נקודות פגות, התראת אבטחה.

### 3.7 Sitemap, OG, אייקונים, Manifest ✅

- `sitemap.xml`: נוספו 4 דפי `/book/*` (נמדד).
- `src/app/opengraph-image.png` 1200×630 — רונדר ב-Edge headless מ-`scripts/brand/og.html` (עברית RTL תקינה; `next/og` לא תומך RTL ואין בו גופן עברי).
- `icon.svg` (מתחלף בין מצב בהיר/כהה), `apple-icon.png` 180, `icon-192/512.png`, `manifest.webmanifest` (`lang: he`, `dir: rtl`).
- `robots.txt`: חוסם הכול מחוץ ל-Production, וב-Production חוסם `/account /checkout /admin /login /studio /api/`.

![כרטיס שיתוף](../report/screenshots/s3b-og-card.png)

## אימות שהורץ

`tsc` 0 · `eslint` 0 · `npm test` 51/51 · `npm run build` exit 0 · curl ל-production: JSON-LD בשני סוגי העמודים, manifest, אייקונים, `og:image` לכל עמוד, ייצוא CSV מחזיר 503 בלי Supabase (נכשל סגור).
