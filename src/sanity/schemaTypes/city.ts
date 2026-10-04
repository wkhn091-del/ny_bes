import { defineField, defineType } from 'sanity';

export const city = defineType({
  name: 'city',
  title: 'ערים',
  type: 'document',
  fields: [
    defineField({ name: 'name', title: 'שם העיר', type: 'string', validation: (r) => r.required().max(60) }),
    defineField({
      name: 'slug',
      title: 'מזהה בכתובת (באנגלית)',
      type: 'slug',
      options: { source: 'name', maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({ name: 'order', title: 'סדר תצוגה', type: 'number', initialValue: 0 }),
  ],
  orderings: [{ title: 'סדר תצוגה', name: 'orderAsc', by: [{ field: 'order', direction: 'asc' }] }],
});
