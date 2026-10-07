import 'server-only';
import type { SalesInfo, SpaceOffer } from '@/components/building/offers';
import { getCatalog } from '@/lib/content/catalog';
import { FREE_CANCELLATION_HOURS } from '@/lib/domain/booking-rules';
import { formatIls } from '@/lib/domain/pricing';
import { SPACE_TYPE_LABELS } from '@/lib/domain/types';

const UNITS: Record<SpaceOffer['type'], string> = { hotDesk: 'לשעה לעמדה', privateOffice: 'לשעה', meetingRoom: 'לשעה' };
const TYPES = Object.keys(UNITS) as SpaceOffer['type'][];

/** "From" prices per space type and the WhatsApp link, for the sales points inside the 3D tour. */
export async function getSalesInfo(): Promise<SalesInfo> {
  const { spaces, settings } = await getCatalog();
  const offers = TYPES.flatMap((type): SpaceOffer[] => {
    const ofType = spaces.filter((s) => s.type === type);
    if (ofType.length === 0) return [];
    return [{ type, title: SPACE_TYPE_LABELS[type], from: formatIls(Math.min(...ofType.map((s) => s.hourlyPrice))), unit: UNITS[type], count: ofType.length, href: `/spaces?type=${type}` }];
  });
  const whatsapp = settings.whatsappNumber
    ? `https://wa.me/${encodeURIComponent(settings.whatsappNumber)}?text=${encodeURIComponent('היי, ראיתי את הסיור בבניין בתלת־ממד ואשמח לפרטים על חלל עבודה')}`
    : null;
  return { offers, whatsapp, cancelHours: FREE_CANCELLATION_HOURS };
}
