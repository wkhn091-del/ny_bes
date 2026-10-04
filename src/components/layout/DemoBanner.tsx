export function DemoBanner({ legalDemo, seedContent }: { legalDemo: boolean; seedContent: boolean }) {
  if (!legalDemo && !seedContent) return null;
  const parts: string[] = [];
  if (legalDemo) parts.push('פרטי החברה, הטלפונים והוואטסאפ הם נתוני דמו');
  if (seedContent) parts.push('התוכן מוצג מנתוני דמו מקומיים (Sanity לא מחובר)');
  return (
    <div role="note" className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs font-medium text-warning">
      ⚠️ סביבת הדגמה: {parts.join(' · ')} — יש להחליף לפני עלייה לאוויר.
    </div>
  );
}
