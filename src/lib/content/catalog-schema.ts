import { z } from 'zod';
import { SPACE_TYPES } from '@/lib/domain/types';
import { isValidHHMM } from '@/lib/domain/time';

const image = z.object({ url: z.string().min(1), alt: z.string().default('') });

const dayHours = z.object({
  day: z.number().int().min(0).max(6),
  closed: z.boolean(),
  open: z.string().refine(isValidHHMM),
  close: z.string().refine(isValidHHMM),
});

const city = z.object({ id: z.string(), slug: z.string(), name: z.string() });

export const catalogSchema = z.object({
  cities: z.array(city),
  branches: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      city,
      address: z.string(),
      wazeUrl: z.string().nullable().default(null),
      phone: z.string(),
      description: z.string(),
      isFlagship: z.boolean(),
      hours: z.array(dayHours).length(7),
      image,
      gallery: z.array(image),
    }),
  ),
  spaces: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      type: z.enum(SPACE_TYPES),
      branchId: z.string(),
      description: z.string(),
      images: z.array(image).min(1),
      videoUrl: z.string().nullable(),
      capacity: z.number().int().positive(),
      sizeSqm: z.number().positive(),
      hourlyPrice: z.number().int().nonnegative(),
      dayPassPrice: z.number().int().nonnegative().nullable(),
      poolSize: z.number().int().positive().nullable(),
      amenityIds: z.array(z.string()),
    }),
  ),
  amenities: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
  addons: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      description: z.string(),
      price: z.number().int().nonnegative(),
      pricingMode: z.enum(['perBooking', 'perHour']),
      spaceTypes: z.array(z.enum(SPACE_TYPES)),
    }),
  ),
  settings: z.object({
    businessName: z.string(),
    tagline: z.string(),
    whatsappNumber: z.string(),
    whatsappMessage: z.string(),
    instagramUrl: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    vatRate: z.number().min(0).max(0.5),
    autoDiscountMinHours: z.number().min(1),
    autoDiscountPercent: z.number().min(0).max(50),
    legal: z.object({
      companyName: z.string(),
      companyId: z.string(),
      address: z.string(),
      email: z.string(),
      accessibilityCoordinator: z.string(),
      accessibilityPhone: z.string(),
      isDemo: z.boolean(),
    }),
  }),
  seo: z.object({
    metaTitle: z.string(),
    metaDescription: z.string(),
    shareImage: image.nullable(),
  }),
  legalPages: z.array(z.object({ slug: z.string(), title: z.string() })),
});
