import { defineArrayMember, defineField, defineType } from 'sanity';

const TYPE_OPTIONS = [
  { title: 'עמדה חמה (מכסה משותפת)', value: 'hotDesk' },
  { title: 'משרד פרטי', value: 'privateOffice' },
  { title: 'חדר ישיבות', value: 'meetingRoom' },
];

const agorotHint = 'באגורות, כולל מע"מ (לדוגמה 12000 = 120 ₪)';

export const space = defineType({
  name: 'space',
  title: 'חללים',
  type: 'document',
  groups: [
    { name: 'main', title: 'פרטים', default: true },
    { name: 'pricing', title: 'מחיר ומלאי' },
    { name: 'media', title: 'מדיה' },
  ],
  fields: [
    defineField({ name: 'name', title: 'שם החלל', type: 'string', group: 'main', validation: (r) => r.required().max(80) }),
    defineField({
      name: 'slug',
      title: 'מזהה בכתובת (באנגלית)',
      type: 'slug',
      group: 'main',
      options: { source: 'name', maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'type',
      title: 'סוג',
      type: 'string',
      group: 'main',
      options: { list: TYPE_OPTIONS, layout: 'radio' },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'branch',
      title: 'סניף',
      type: 'reference',
      to: [{ type: 'branch' }],
      group: 'main',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'description', title: 'תיאור', type: 'text', rows: 4, group: 'main', validation: (r) => r.required().max(800) }),
    defineField({
      name: 'capacity',
      title: 'מספר אנשים',
      description: 'בעמדה חמה: מקסימום מקומות בהזמנה אחת',
      type: 'number',
      group: 'main',
      validation: (r) => r.required().integer().min(1).max(50),
    }),
    defineField({ name: 'sizeSqm', title: 'גודל (מ"ר)', type: 'number', group: 'main', validation: (r) => r.required().min(1).max(1000) }),
    defineField({
      name: 'amenities',
      title: 'ציוד ושירותים',
      type: 'array',
      group: 'main',
      of: [defineArrayMember({ type: 'reference', to: [{ type: 'amenity' }] })],
      validation: (r) => r.unique().max(20),
    }),
    defineField({ name: 'active', title: 'פעיל להזמנות', type: 'boolean', group: 'main', initialValue: true }),
    defineField({
      name: 'hourlyPrice',
      title: 'מחיר לשעה',
      description: `${agorotHint}. בעמדה חמה — לכל מקום.`,
      type: 'number',
      group: 'pricing',
      validation: (r) => r.required().integer().min(100).max(1_000_000),
    }),
    defineField({
      name: 'dayPassPrice',
      title: 'מחיר יום שלם (Day Pass)',
      description: `${agorotHint}. משרד פרטי בלבד.`,
      type: 'number',
      group: 'pricing',
      hidden: ({ parent }) => parent?.type !== 'privateOffice',
      validation: (r) =>
        r.integer().min(100).max(10_000_000).custom((value, ctx) => {
          const type = (ctx.parent as { type?: string })?.type;
          if (type !== 'privateOffice' && value != null) return 'Day Pass זמין רק למשרד פרטי';
          return true;
        }),
    }),
    defineField({
      name: 'poolSize',
      title: 'מספר עמדות במכסה',
      description: 'עמדה חמה בלבד: כמה עמדות יש באזור הפתוח',
      type: 'number',
      group: 'pricing',
      hidden: ({ parent }) => parent?.type !== 'hotDesk',
      validation: (r) =>
        r.integer().min(1).max(500).custom((value, ctx) => {
          const type = (ctx.parent as { type?: string })?.type;
          if (type === 'hotDesk' && value == null) return 'חובה לעמדה חמה';
          if (type !== 'hotDesk' && value != null) return 'רק לעמדה חמה';
          return true;
        }),
    }),
    defineField({
      name: 'images',
      title: 'גלריית תמונות',
      type: 'array',
      group: 'media',
      of: [
        defineArrayMember({
          type: 'image',
          options: { hotspot: true },
          fields: [defineField({ name: 'alt', title: 'טקסט חלופי', type: 'string', validation: (r) => r.required().max(160) })],
        }),
      ],
      validation: (r) => r.required().min(1).max(12),
    }),
    defineField({
      name: 'videoUrl',
      title: 'קישור לסרטון (לעתיד)',
      description: 'שמור לשימוש עתידי — לא מוצג באתר כרגע',
      type: 'url',
      group: 'media',
      validation: (r) => r.uri({ scheme: ['https'] }),
    }),
  ],
  preview: {
    select: { title: 'name', branch: 'branch.name', type: 'type', media: 'images.0' },
    prepare: ({ title, branch, type, media }) => ({
      title,
      subtitle: `${branch ?? ''} · ${TYPE_OPTIONS.find((t) => t.value === type)?.title ?? ''}`,
      media,
    }),
  },
});
