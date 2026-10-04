import { defineArrayMember, defineField, defineType } from 'sanity';

export const legal = defineType({
  name: 'legal',
  title: 'עמודים משפטיים',
  type: 'document',
  fields: [
    defineField({ name: 'title', title: 'שם העמוד (למשל: תקנון האתר)', type: 'string', validation: (r) => r.required().max(80) }),
    defineField({
      name: 'slug',
      title: 'קישור לעמוד',
      type: 'slug',
      options: { source: 'title', maxLength: 64 },
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'lawyerReviewed',
      title: 'נבדק על ידי עורך דין',
      description: 'כל עוד לא מסומן, בראש העמוד מוצגת הערת "טיוטה"',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'content',
      title: 'תוכן העמוד',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'block',
          styles: [
            { title: 'רגיל', value: 'normal' },
            { title: 'כותרת', value: 'h2' },
            { title: 'כותרת משנה', value: 'h3' },
          ],
          marks: { annotations: [] },
        }),
      ],
      validation: (r) => r.required(),
    }),
  ],
  preview: {
    select: { title: 'title', reviewed: 'lawyerReviewed' },
    prepare: ({ title, reviewed }) => ({ title, subtitle: reviewed ? 'נבדק ✓' : 'טיוטה — ממתין לעו"ד' }),
  },
});
