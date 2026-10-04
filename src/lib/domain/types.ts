export const SPACE_TYPES = ['hotDesk', 'privateOffice', 'meetingRoom'] as const;
export type SpaceType = (typeof SPACE_TYPES)[number];

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  hotDesk: 'עמדה חמה',
  privateOffice: 'משרד פרטי',
  meetingRoom: 'חדר ישיבות',
};

export type AddonPricingMode = 'perBooking' | 'perHour';

export interface DayHours {
  /** 0 = Sunday … 6 = Saturday */
  day: number;
  closed: boolean;
  open: string;
  close: string;
}

export interface ImageRef {
  url: string;
  alt: string;
}

export interface City {
  id: string;
  slug: string;
  name: string;
}

export interface Branch {
  id: string;
  slug: string;
  name: string;
  city: City;
  address: string;
  wazeUrl: string | null;
  phone: string;
  description: string;
  image: ImageRef;
  gallery: ImageRef[];
  hours: DayHours[];
  isFlagship: boolean;
}

export interface Amenity {
  id: string;
  slug: string;
  name: string;
}

export interface Addon {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** agorot, VAT-inclusive */
  price: number;
  pricingMode: AddonPricingMode;
  spaceTypes: SpaceType[];
}

export interface Space {
  id: string;
  slug: string;
  name: string;
  type: SpaceType;
  branchId: string;
  description: string;
  images: ImageRef[];
  videoUrl: string | null;
  /** people the space fits (for hot desks: max seats per single booking) */
  capacity: number;
  sizeSqm: number;
  /** agorot per hour (per seat for hot desks), VAT-inclusive */
  hourlyPrice: number;
  /** agorot, private offices only */
  dayPassPrice: number | null;
  /** hot desks only: total desks in the shared pool */
  poolSize: number | null;
  amenityIds: string[];
}

export interface LegalEntity {
  companyName: string;
  companyId: string;
  address: string;
  email: string;
  accessibilityCoordinator: string;
  accessibilityPhone: string;
  isDemo: boolean;
}

export interface SiteSettings {
  businessName: string;
  tagline: string;
  whatsappNumber: string;
  whatsappMessage: string;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  vatRate: number;
  autoDiscountMinHours: number;
  autoDiscountPercent: number;
  legal: LegalEntity;
}

export interface SeoSettings {
  metaTitle: string;
  metaDescription: string;
  shareImage: ImageRef | null;
}

export interface LegalPageSummary {
  slug: string;
  title: string;
}

export interface Catalog {
  cities: City[];
  branches: Branch[];
  spaces: Space[];
  amenities: Amenity[];
  addons: Addon[];
  settings: SiteSettings;
  seo: SeoSettings;
  legalPages: LegalPageSummary[];
}

export type BookingStatus = 'pending_payment' | 'active' | 'cancelled' | 'released' | 'expired';

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: 'ממתינה לתשלום',
  active: 'פעילה',
  cancelled: 'בוטלה',
  released: 'שוחררה',
  expired: 'פג תוקף',
};
