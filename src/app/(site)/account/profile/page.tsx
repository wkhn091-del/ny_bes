import type { Metadata } from 'next';
import { ProfileForms } from '@/components/account/ProfileForms';
import { StepUpPanel } from '@/components/account/StepUpPanel';
import { formatMinutes, utcToIsrael } from '@/lib/domain/time';
import { getUserProfile, requireUser } from '@/lib/server/auth';
import { getStepUpExpiry } from '@/lib/server/step-up';

export const metadata: Metadata = { title: 'פרטים וחשבונית', robots: { index: false } };

function formatPhone(e164: string | null): string {
  if (!e164) return '';
  return e164.startsWith('+972') ? `0${e164.slice(4)}` : e164;
}

export default async function ProfilePage() {
  const user = await requireUser('/account/profile');
  const [profile, stepUpUntil] = await Promise.all([getUserProfile(user.id), getStepUpExpiry(user.id)]);

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">פרטים וחשבונית</h1>
      <div className="mt-6">
        <StepUpPanel active={stepUpUntil !== null} expiresLabel={stepUpUntil ? formatMinutes(utcToIsrael(stepUpUntil).minutes) : null} />
      </div>
      <div className="mt-6">
        <ProfileForms
          fullName={profile?.fullName ?? ''}
          email={user.email}
          phone={formatPhone(profile?.phone ?? null)}
          companyName={profile?.companyName ?? ''}
          companyTaxId={profile?.companyTaxId ?? ''}
          stepUpActive={stepUpUntil !== null}
        />
      </div>
    </div>
  );
}
