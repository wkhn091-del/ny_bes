import type { SpaceType } from '@/lib/domain/types';

export interface LiveSpace {
  id: string;
  slug: string;
  name: string;
  type: SpaceType;
  /** Bookable units: desks in the pool, or 1 for a room. */
  capacity: number;
  used: number;
  /** People the space fits; drives the furniture drawn in 3D. */
  seats: number;
  /** Display only (agorot, incl. VAT); checkout always re-prices on the server. */
  hourlyPrice: number;
}

export interface LiveFloor {
  branch: { slug: string; name: string; city: string };
  isOpen: boolean;
  /** The slot the occupancy describes: now while open, otherwise the next opening slot. */
  at: { date: string; minute: number } | null;
  spaces: LiveSpace[];
}
