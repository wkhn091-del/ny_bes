import { defineField, defineType } from 'sanity';

export const amenity = defineType({
  name: 'amenity',
  title: 'ציוד ושירותים',
  type: 'document',
  fields: [
    defineField({ name: 'name', title: 'שם', type: 'string', validation: (r) => r.required().max(60) }),
    defineField({
      name: 'slug',
      title: 'מזהה (באנגלית)',
      type: 'slug',
      options: { source: 'name', maxLength: 64 },
      validation: (r) => r.required(),
    }),
  ],
});
