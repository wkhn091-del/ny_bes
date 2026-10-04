export function DemoBanner({ legalDemo, seedContent }: { legalDemo: boolean; seedContent: boolean }) {
  if (!legalDemo && !seedContent) return null;
  const parts: string[] = [];
  if (legalDemo) parts.push('פרטי החברה, הטלפונים והוואטסאפ הם נתוני דמו');
  if (seedContent) parts.push('התוכן מוצג מנתוני דמו מקומיים (Sanity לא מחובר)');
  return (
    <div role="note" className="border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-center text-[11px] font-medium text-warning sm:py-2 sm:text-xs">
      <span className="sm:hidden">⚠️ סביבת הדגמה · נתוני דמו</span>
      <span className="hidden sm:inline">
        ⚠️ סביבת הדגמה: {parts.join(' · ')} — יש להחליף לפני עלייה לאוויר.
      </span>
    </div>
  );
}
