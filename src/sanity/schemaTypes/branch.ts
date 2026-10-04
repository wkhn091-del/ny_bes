import { defineArrayMember, defineField, defineType } from 'sanity';

const HHMM = /^([01]\d|2[0-3]):([03]0)$/;
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const branch = defineType({
  name: 'branch',
  title: 'סניפים',
  type: 'document',
  groups: [
    { name: 'main', title: 'פרטים', default: true },
    { name: 'hours', title: 'שעות פעילות' },
    { name: 'media', title: 'תמונות' },
  ],
  fields: [
    defineField({ name: 'name', title: 'שם הסניף', type: 'string', group: 'main', validation: (r) => r.required().max(60) }),
    defineField({
      name: 'slug',
      title: 'מזהה בכתובת (באנגלית)',
      type: 'slug',
      group: 'main',
      options: { source: 'name', maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'city',
      title: 'עיר',
      type: 'reference',
      to: [{ type: 'city' }],
      group: 'main',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'address', title: 'כתובת מלאה', type: 'string', group: 'main', validation: (r) => r.required().max(160) }),
    defineField({ name: 'wazeUrl', title: 'קישור ל-Waze', type: 'url', group: 'main' }),
    defineField({
      name: 'phone',
      title: 'טלפון הקבלה בסניף',
      type: 'string',
      group: 'main',
      validation: (r) => r.required().regex(/^[0-9+\-\s]{9,15}$/, { name: 'phone' }),
    }),
    defineField({ name: 'description', title: 'תיאור קצר', type: 'text', rows: 3, group: 'main', validation: (r) => r.max(400) }),
    defineField({ name: 'isFlagship', title: 'סניף דגל', type: 'boolean', group: 'main', initialValue: false }),
    defineField({ name: 'active', title: 'פעיל להזמנות', type: 'boolean', group: 'main', initialValue: true }),
    defineField({
      name: 'hours',
      title: 'שעות פעילות',
      description: 'שבעה ימים בדיוק. שעות בקפיצות של חצי שעה. בשישי עד 13:00, שבת סגור.',
      type: 'array',
      group: 'hours',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'dayHours',
          fields: [
            defineField({
              name: 'day',
              title: 'יום',
              type: 'number',
              options: { list: DAYS.map((title, value) => ({ title, value })) },
              validation: (r) => r.required().min(0).max(6).integer(),
            }),
            defineField({ name: 'closed', title: 'סגור', type: 'boolean', initialValue: false }),
            defineField({
              name: 'open',
              title: 'פתיחה (HH:MM)',
              type: 'string',
              validation: (r) => r.required().regex(HHMM, { name: 'HH:MM' }),
            }),
            defineField({
              name: 'close',
              title: 'סגירה (HH:MM)',
              type: 'string',
              validation: (r) =>
                r
                  .required()
                  .regex(HHMM, { name: 'HH:MM' })
                  .custom((close, ctx) => {
                    const open = (ctx.parent as { open?: string })?.open;
                    if (!open || !close) return true;
                    return close > open ? true : 'שעת הסגירה חייבת להיות אחרי שעת הפתיחה';
                  }),
            }),
          ],
          preview: {
            select: { day: 'day', open: 'open', close: 'close', closed: 'closed' },
            prepare: ({ day, open, close, closed }) => ({
              title: DAYS[day as number] ?? '?',
              subtitle: closed ? 'סגור' : `${open}–${close}`,
            }),
          },
        }),
      ],
      validation: (r) =>
        r
          .required()
          .length(7)
          .custom((items) => {
            const days = new Set((items as { day?: number }[] | undefined)?.map((i) => i.day));
            return days.size === 7 ? true : 'כל יום בשבוע צריך להופיע פעם אחת';
          }),
    }),
    defineField({
      name: 'image',
      title: 'תמונה ראשית',
      type: 'image',
      group: 'media',
      options: { hotspot: true },
      fields: [defineField({ name: 'alt', title: 'טקסט חלופי (נגישות)', type: 'string', validation: (r) => r.required().max(160) })],
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'gallery',
      title: 'גלריה',
      type: 'array',
      group: 'media',
      of: [
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [defineField({ name: 'alt', title: 'טקסט חלופי', type: 'string', validation: (r) => r.required().max(160) })],
        }),
      ],
      validation: (r) => r.max(12),
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'city.name', media: 'image' },
  },
});
