import { defineField, defineType } from 'sanity';

export const addon = defineType({
  name: 'addon',
  title: 'תוספות להזמנה',
  type: 'document',
  fields: [
    defineField({ name: 'name', title: 'שם', type: 'string', validation: (r) => r.required().max(80) }),
    defineField({
      name: 'slug',
      title: 'מזהה (באנגלית)',
      type: 'slug',
      options: { source: 'name', maxLength: 64 },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'description', title: 'תיאור', type: 'text', rows: 2, validation: (r) => r.max(240) }),
    defineField({
      name: 'price',
      title: 'מחיר',
      description: 'באגורות, כולל מע"מ (5000 = 50 ₪). תוספות תמיד במחיר מלא — הנחות לא חלות עליהן.',
      type: 'number',
      validation: (r) => r.required().integer().min(0).max(1_000_000),
    }),
    defineField({
      name: 'pricingMode',
      title: 'אופן חישוב',
      type: 'string',
      options: {
        list: [
          { title: 'חד-פעמי להזמנה', value: 'perBooking' },
          { title: 'לכל שעה', value: 'perHour' },
        ],
        layout: 'radio',
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'spaceTypes',
      title: 'זמין לסוגי חללים',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: [
          { title: 'עמדה חמה', value: 'hotDesk' },
          { title: 'משרד פרטי', value: 'privateOffice' },
          { title: 'חדר ישיבות', value: 'meetingRoom' },
        ],
      },
      validation: (r) => r.required().min(1).unique(),
    }),
    defineField({ name: 'active', title: 'פעיל', type: 'boolean', initialValue: true }),
  ],
});
