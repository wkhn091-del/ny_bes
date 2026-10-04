import { defineField, defineType } from 'sanity';

export const seo = defineType({
  name: 'seo',
  title: 'הגדרות SEO וקידום',
  type: 'document',
  fields: [
    defineField({ name: 'metaTitle', title: 'כותרת לגוגל (עד 60 תווים)', type: 'string', validation: (r) => r.required().max(60) }),
    defineField({ name: 'metaDescription', title: 'תיאור לגוגל (עד 160 תווים)', type: 'text', rows: 3, validation: (r) => r.required().max(160) }),
    defineField({
      name: 'shareImage',
      title: 'תמונה לשיתוף בוואטסאפ/פייסבוק',
      type: 'image',
      fields: [defineField({ name: 'alt', title: 'טקסט חלופי', type: 'string' })],
    }),
  ],
  preview: { prepare: () => ({ title: 'SEO' }) },
});
