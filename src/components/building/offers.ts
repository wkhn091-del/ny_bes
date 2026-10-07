import type { FloorProgram } from '@/components/three/building-model';

/** One kind of space, priced on the server from the live catalog; the tour only displays it. */
export type SpaceOffer = {
  type: 'hotDesk' | 'privateOffice' | 'meetingRoom';
  title: string;
  /** Lowest current price, already formatted (VAT included). */
  from: string;
  unit: string;
  count: number;
  href: string;
};

export type SalesInfo = { offers: SpaceOffer[]; whatsapp: string | null; cancelHours: number };

export const PROGRAM_TYPE: Record<FloorProgram, SpaceOffer['type']> = { open: 'hotDesk', offices: 'privateOffice', meeting: 'meetingRoom' };
