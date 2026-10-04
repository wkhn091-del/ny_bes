import { useState } from 'react';
import { useClient, type DocumentActionComponent } from 'sanity';

function moderationAction(status: 'approved' | 'rejected', label: string, tone: 'positive' | 'critical'): DocumentActionComponent {
  const Action: DocumentActionComponent = ({ id, published, onComplete }) => {
    const client = useClient({ apiVersion: '2025-02-19' });
    const [busy, setBusy] = useState(false);
    const current = (published as { status?: string } | null)?.status;
    return {
      label: busy ? 'מעדכן…' : label,
      tone,
      disabled: busy || !published || current === status,
      onHandle: async () => {
        setBusy(true);
        try {
          await client.patch(id).set({ status, moderatedAt: new Date().toISOString() }).commit();
        } finally {
          setBusy(false);
          onComplete();
        }
      },
    };
  };
  Action.displayName = `Review_${status}`;
  return Action;
}

export const approveReview = moderationAction('approved', 'אישור ופרסום', 'positive');
export const rejectReview = moderationAction('rejected', 'דחייה', 'critical');
