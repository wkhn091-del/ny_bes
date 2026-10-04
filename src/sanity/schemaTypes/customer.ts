import { defineField, defineType } from 'sanity';

/**
 * Lean customer card in the PRIVATE `customers` dataset. Written by the server only.
 * Deliberately no phone, tax id or payment data — those stay in Supabase.
 */
export const customer = defineType({
  name: 'customer',
  title: 'לקוחות',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'supabaseUserId', title: 'מזהה משתמש', type: 'string' }),
    defineField({ name: 'name', title: 'שם', type: 'string' }),
    defineField({ name: 'email', title: 'דוא"ל', type: 'string' }),
    defineField({ name: 'joinedAt', title: 'תאריך הצטרפות', type: 'datetime' }),
    defineField({ name: 'bookingsCount', title: 'מספר הזמנות', type: 'number' }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'email' },
  },
});
