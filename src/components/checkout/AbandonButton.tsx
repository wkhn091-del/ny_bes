'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { abandonCheckout } from '@/app/actions/bookings';
import { Button } from '@/components/ui/Button';

export function AbandonButton({ code, nextHref }: { code: string; nextHref: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col items-center">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await abandonCheckout(code);
            if (result.ok) router.push(nextHref);
            else setError(result.message);
          })
        }
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        שחרור השעות ובחירה מחדש
      </Button>
      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
