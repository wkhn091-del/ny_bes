'use client';

import { Loader2, LogOut, MonitorSmartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { revokeSession, signOutEverywhere } from '@/app/actions/account';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface SessionRow {
  id: string;
  device: string;
  ip: string | null;
  lastActive: string;
  created: string;
  current: boolean;
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function revoke(id: string) {
    setBusyId(id);
    setMessage(null);
    startTransition(async () => {
      const res = await revokeSession({ sessionId: id });
      setMessage({ ok: res.ok, text: res.message ?? '' });
      setBusyId(null);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4">
      {sessions.length === 0 ? (
        <p className="text-sm text-muted">אין חיבורים פעילים.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div className="flex min-w-0 items-start gap-3">
                <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {s.device} {s.current && <Badge tone="accent">המכשיר הזה</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    פעילות אחרונה: {s.lastActive} · התחברות: {s.created}
                    {s.ip && (
                      <>
                        {' · '}
                        <span dir="ltr">{s.ip}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              {!s.current && (
                <Button variant="ghost" size="sm" onClick={() => revoke(s.id)} disabled={pending}>
                  {busyId === s.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  ניתוק
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p className={`mt-2 text-sm ${message.ok ? 'text-success' : 'text-danger'}`} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
      <form action={signOutEverywhere} className="mt-4">
        <Button type="submit" variant="outline">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          התנתקות מכל המכשירים (כולל זה)
        </Button>
      </form>
    </div>
  );
}
