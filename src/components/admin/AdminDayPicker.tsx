'use client';

import { useRouter } from 'next/navigation';

export function AdminDayPicker({ branches, branch, date }: { branches: { slug: string; label: string }[]; branch: string; date: string }) {
  const router = useRouter();
  const go = (next: { branch?: string; date?: string }) => {
    const p = new URLSearchParams({ branch: next.branch ?? branch, date: next.date ?? date });
    router.push(`/admin?${p}`);
  };
  return (
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">סניף</span>
        <select value={branch} onChange={(e) => go({ branch: e.target.value })} className="h-10 rounded-lg border border-border bg-card px-3">
          {branches.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-muted">תאריך</span>
        <input type="date" value={date} onChange={(e) => e.target.value && go({ date: e.target.value })} className="h-10 rounded-lg border border-border bg-card px-3" />
      </label>
    </div>
  );
}
