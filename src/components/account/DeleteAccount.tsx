'use client';

import { Loader2, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { deleteAccount } from '@/app/actions/account';
import { Button } from '@/components/ui/Button';

const CONFIRM_WORD = 'מחיקה';

export function DeleteAccount({ enabled }: { enabled: boolean }) {
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      // On success the action redirects away; a returned value is always an error.
      const res = await deleteAccount({ confirm });
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <div className="space-y-3">
      <label className="block max-w-sm text-sm">
        <span className="mb-1 block text-muted">כדי לאשר, הקלידו &quot;{CONFIRM_WORD}&quot;</span>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.slice(0, 20))}
          disabled={!enabled}
          className="h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-danger disabled:opacity-60"
        />
      </label>
      <Button variant="danger" onClick={submit} disabled={!enabled || pending || confirm.trim() !== CONFIRM_WORD}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
        מחיקת החשבון לצמיתות
      </Button>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
