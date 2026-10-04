import type { Metadata } from 'next';
import { DeleteAccount } from '@/components/account/DeleteAccount';
import { SessionList } from '@/components/account/SessionList';
import { StepUpPanel } from '@/components/account/StepUpPanel';
import { formatDateHebrew, formatMinutes, utcToIsrael } from '@/lib/domain/time';
import { listOwnBookings } from '@/lib/server/account-bookings';
import { requireUser } from '@/lib/server/auth';
import { listUserSessions } from '@/lib/server/sessions';
import { getStepUpExpiry } from '@/lib/server/step-up';

export const metadata: Metadata = { title: 'אבטחה', robots: { index: false } };

function stamp(iso: string): string {
  const local = utcToIsrael(iso);
  return `${formatDateHebrew(local.date, true)}, ${formatMinutes(local.minutes)}`;
}

export default async function SecurityPage() {
  const user = await requireUser('/account/security');
  const [sessions, stepUpUntil, bookings] = await Promise.all([
    listUserSessions(user.id),
    getStepUpExpiry(user.id),
    listOwnBookings(user.id, 50),
  ]);
  const upcomingCount = bookings?.upcoming.length ?? 0;

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">אבטחה</h1>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">מכשירים מחוברים</h2>
        <p className="mt-0.5 text-sm text-muted">
          חיבור שלא היה פעיל 30 יום מתנתק אוטומטית. ניתוק מכשיר נכנס לתוקף תוך שעה לכל היותר.
        </p>
        {sessions === null ? (
          <p className="mt-4 text-sm text-danger">לא הצלחנו לטעון את רשימת המכשירים.</p>
        ) : (
          <SessionList
            sessions={sessions.map((s) => ({
              id: s.id,
              device: s.device,
              ip: s.ip,
              lastActive: stamp(s.lastActiveAt),
              created: stamp(s.createdAt),
              current: s.id === user.sessionId,
            }))}
          />
        )}
      </section>

      <section className="rounded-2xl border border-danger/30 bg-card p-5">
        <h2 className="font-semibold text-danger">מחיקת החשבון</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          המחיקה סופית: הפרופיל, המועדפים והנקודות יימחקו. רשומות תשלום של הזמנות שהתקיימו נשמרות ללא פרטים מזהים, כנדרש לפי דיני מס
          (7 שנים).
        </p>
        {upcomingCount > 0 ? (
          <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">
            יש לך {upcomingCount} הזמנות עתידיות. כדי למחוק את החשבון, בטלו או שחררו אותן קודם (או המתינו שיסתיימו).
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <StepUpPanel active={stepUpUntil !== null} expiresLabel={stepUpUntil ? formatMinutes(utcToIsrael(stepUpUntil).minutes) : null} />
            <DeleteAccount enabled={stepUpUntil !== null} />
          </div>
        )}
      </section>
    </div>
  );
}
