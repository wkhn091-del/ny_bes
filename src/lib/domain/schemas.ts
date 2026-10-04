import { z } from 'zod';
import { isValidIsraeliId } from './israeli-id';
import { isValidDateString } from './time';

export const sanityIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

export const slugSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9-]+$/);

export const dateSchema = z.string().refine(isValidDateString, 'Invalid date');

export const minuteSchema = z
  .number()
  .int()
  .min(0)
  .max(24 * 60)
  .refine((m) => m % 30 === 0, 'Must align to 30 minutes');

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{3,32}$/);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();

export const checkoutRequestSchema = z
  .object({
    spaceId: sanityIdSchema,
    date: dateSchema,
    startMinute: minuteSchema,
    endMinute: minuteSchema,
    seats: z.number().int().min(1).max(50),
    isDayPass: z.boolean(),
    addonIds: z.array(sanityIdSchema).max(10),
    couponCode: z.union([couponCodeSchema, z.literal('')]).optional(),
    companyName: optionalText(120),
    companyTaxId: z
      .string()
      .trim()
      .max(9)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => v === undefined || (/^\d{9}$/.test(v) && isValidIsraeliId(v)), 'Invalid tax id'),
    usePoints: z.boolean().optional(),
    turnstileToken: z.string().max(2048).optional(),
  })
  .refine((v) => v.isDayPass || v.endMinute > v.startMinute, 'End must be after start')
  .refine((v) => new Set(v.addonIds).size === v.addonIds.length, 'Duplicate add-ons');

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const quoteRequestSchema = z
  .object({
    spaceId: sanityIdSchema,
    date: dateSchema,
    startMinute: minuteSchema,
    endMinute: minuteSchema,
    seats: z.number().int().min(1).max(50),
    isDayPass: z.boolean(),
    addonIds: z.array(sanityIdSchema).max(10),
    couponCode: z.union([couponCodeSchema, z.literal('')]).optional(),
    usePoints: z.boolean().optional(),
  })
  .refine((v) => v.isDayPass || v.endMinute > v.startMinute, 'End must be after start')
  .refine((v) => new Set(v.addonIds).size === v.addonIds.length, 'Duplicate add-ons');

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

/** Parses the checkout URL (ids and quantities only) into a quote request. */
export function quoteRequestFromSearchParams(sp: Record<string, string | string[] | undefined>): QuoteRequest | null {
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === 'string' ? v : undefined;
  };
  const num = (k: string) => {
    const v = one(k);
    return v !== undefined && /^\d{1,4}$/.test(v) ? Number(v) : Number.NaN;
  };
  const parsed = quoteRequestSchema.safeParse({
    spaceId: one('space'),
    date: one('date'),
    startMinute: num('start'),
    endMinute: num('end'),
    seats: Number.isNaN(num('seats')) ? 1 : num('seats'),
    isDayPass: one('dayPass') === '1',
    addonIds: (one('addons') ?? '').split(',').filter(Boolean).slice(0, 11),
  });
  return parsed.success ? parsed.data : null;
}

export const couponPreviewSchema = z.object({
  code: couponCodeSchema,
});

export const availabilityQuerySchema = z.object({
  spaceId: sanityIdSchema,
  date: dateSchema,
});

export const availabilitySearchSchema = z.object({
  date: dateSchema,
  startMinute: z.coerce.number().pipe(minuteSchema).optional(),
  endMinute: z.coerce.number().pipe(minuteSchema).optional(),
  seats: z.coerce.number().int().min(1).max(50).default(1),
  city: slugSchema.optional(),
});

export const bookingIdSchema = z.uuid();

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const otpCodeSchema = z.string().trim().regex(/^\d{6,8}$/);

export const fullNameSchema = z.string().trim().min(2).max(120);

export const publicCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/);

/** Israeli mobile / landline, stored as E.164 (+972…). Empty string clears the field. */
export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .transform((v) => v.replace(/[\s()-]/g, ''))
  .refine((v) => v === '' || /^(\+972|0)([23489]|5\d|7\d)\d{7}$/.test(v), 'Invalid phone')
  .transform((v) => (v === '' ? null : v.startsWith('0') ? `+972${v.slice(1)}` : v));

export const billingDefaultsSchema = z.object({
  companyName: optionalText(120),
  companyTaxId: z
    .string()
    .trim()
    .max(9)
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || (/^\d{9}$/.test(v) && isValidIsraeliId(v)), 'Invalid tax id'),
});
