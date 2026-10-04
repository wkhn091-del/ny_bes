# מטריצת לוגיקה עסקית

כל כלל עסקי, איפה הוא ממומש ואיזה טסט מכסה אותו.
הקוד בדפדפן משמש לתצוגה בלבד. הסכום שנשלח ל-Stripe מחושב מחדש בשרת (`createCheckout`), והמסד (`create_booking_hold`, `validate_booking_window`) הוא הסמכות האחרונה.

| # | כלל | מימוש | טסט יחידה | E2E |
|---|-----|-------|-----------|-----|
| P1 | מחיר בסיס = שעות × מחיר לשעה | `calculatePrice` ב-`src/lib/domain/pricing.ts` | `pricing.test.ts` P1 | חסר |
| P2 | עמדה חמה: × מספר מקומות. חדר ומשרד: מקום אחד | `calculatePrice` | P2 | חסר |
| P3 | "יום שלם" במחיר קבוע, רק במשרד פרטי | `calculatePrice`, `validateSlotRequest` | P3, B5 | חסר |
| P4 | הנחה אוטומטית מ-X שעות, רק בחדרי ישיבות ומשרדים | `calculatePrice` + `settings` מ-Sanity | P4 | חסר |
| P5 | הנחות לא מצטברות: הגבוהה מנצחת, בתיקו נשאר הקופון | `calculatePrice` | P5 | חסר |
| P6 | קופון לא עובר את מחיר הבסיס ולא שלילי | `calculatePrice` + `couponCodeSchema` | P6 | חסר |
| P7 | תוספות במחיר מלא (לשעה × שעות או פעם אחת), ההנחה רק על הבסיס | `calculatePrice` | P7 | חסר |
| P8 | נקודות: בלוקים של 100 = ₪5, עד 50% מהבסיס | `maxPointsRedemption`, ‏`0003_customer_portal.sql` | P8 | חסר |
| P9 | נקודות נפדות רק כשהן עדיפות על ההנחה האחרת | `calculatePrice` | P9 | חסר |
| P10 | מע״מ כלול במחיר המוצג, לא מתווסף | `calculatePrice` | P10 | חסר |
| P11 | כל הסכומים באגורות שלמות | `calculatePrice` | P11 | חסר |
| B1 | הזמנה בתוך שעות הפעילות | `validateSlotRequest` + `validate_booking_window` | `booking-rules.test.ts` B1 | חסר |
| B2 | יום סגור או מחוץ לשעות נדחה | `validateSlotRequest` | B2 | חסר |
| B3 | מינימום שעה, קפיצות של חצי שעה | `validateSlotRequest` | B3 | חסר |
| B4 | לא בעבר, עד 60 יום קדימה | `validateSlotRequest` | B4 | חסר |
| B6 | מספר מקומות בעמדה חמה: שלם ובתוך המאגר | `validateSlotRequest` | B6 | חסר |
| B7 | שתי הזמנות לא תופסות אותו חלל באותו זמן | אילוץ exclusion ב-`0001_init.sql` | אין (נבדק במסד) | חסר |
| B8 | החזקת תשלום ל-15 דקות, ואז שחרור | `HOLD_MINUTES`, `expire_stale_holds` | אין (נבדק במסד) | חסר |
| C1 | ביטול חינם 24 שעות או יותר לפני | `canCancelWithRefund` + `cancel_booking_by_customer` | C1 | חסר |
| C2 | 5 דקות חסד אחרי האישור | `canCancelWithRefund` | C2 | חסר |
| C3 | אין החזר אחרי ההתחלה או בהזמנה לא פעילה | `canCancelWithRefund` | C3 | חסר |
| C4 | "שחרור" ללא החזר כשאין זכאות להחזר | `canRelease` | C4 | חסר |

## פתוח

- **E2E (Playwright):** עדיין אין בדיקות דפדפן ב-CI. יש סקריפטים ידניים מחוץ לריפו. צריך להוסיף `playwright.config.ts`, תרחישים ל-P1/P4/C1, ו-job ב-`.github/workflows/ci.yml`.
- **B7, B8:** נאכפים במסד. לבדוק אותם דורש מסד בדיקות (Supabase מקומי).
