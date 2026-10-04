# SpaceHub

הזמנת חללי עבודה, חדרי ישיבות ומשרדים פרטיים לפי שעה — עברית, RTL, זמינות בזמן אמת ומחיר סופי כולל מע״מ.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Sanity (קטלוג ותוכן) · Supabase (Auth + Postgres + RLS) · Stripe Checkout · Resend · Upstash Redis · Cloudflare Turnstile · Sentry · React Three Fiber (מפה תלת־ממדית).

## הרצה מקומית

```bash
npm ci
cp .env.example .env.local   # כל שירות אופציונלי מקומית — בלי Sanity האתר משתמש בתוכן דמו
npm run dev                  # http://localhost:3000
```

| פקודה | מה עושה |
|---|---|
| `npm run dev` | שרת פיתוח |
| `npm run build` / `npm start` | build ו-production מקומי |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| `npm run lint` | ESLint (כולל כללי React Compiler) |
| `npm test` | בדיקות יחידה (`node:test`) |
| `npm run build:3d` | בונה מחדש את ערכת המודלים התלת־ממדיים (Draco) |
| `npm run seed` | זורע תוכן דמו ל-Sanity ומראה ל-Supabase |

## מסמכים

| נושא | קובץ |
|---|---|
| פריסה (Vercel, Supabase, Sanity, Stripe) | [`DEPLOY.md`](DEPLOY.md) |
| ארכיטקטורה ומפת אבטחה | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| משתני סביבה (בלי ערכים) | [`.env.example`](.env.example) |
| מבצר אבטחה — רמות A/B/C | [`docs/script3/A-security-fortress.md`](docs/script3/A-security-fortress.md) |
| צ׳קליסט השקה, DNS, 2FA | [`docs/script3/B-launch.md`](docs/script3/B-launch.md) |
| מה עושים באירוע אבטחה | [`docs/script4/05-security-incident-sheet.md`](docs/script4/05-security-incident-sheet.md) |
| חבילת מסירה ללקוח | [`docs/script4/`](docs/script4) |
| ביקורת סופית | [`docs/script5/final-audit.md`](docs/script5/final-audit.md) |
| דוח בוקר (סיכום + ממתין לך) | [`docs/report/MORNING-REPORT.md`](docs/report/MORNING-REPORT.md) |

## דיווח על חולשה

`/.well-known/security.txt`
