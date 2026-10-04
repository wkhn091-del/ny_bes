import { defineField, defineType } from 'sanity';

const STATUS_TITLES: Record<string, string> = { pending: '⏳ ממתינה', approved: '✅ מאושרת', rejected: '⛔ נדחתה' };

/**
 * Customer review in the PRIVATE `customers` dataset. Created by the server only (verified bookings),
 * moderated with the "אישור" / "דחייה" actions. Content is read-only so moderators cannot put words in a customer's mouth.
 */
export const review = defineType({
  name: 'review',
  title: 'ביקורות',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'status',
      title: 'סטטוס',
      type: 'string',
      options: { list: Object.entries(STATUS_TITLES).map(([value, title]) => ({ value, title })), layout: 'radio' },
    }),
    defineField({ name: 'rating', title: 'דירוג', type: 'number' }),
    defineField({ name: 'text', title: 'טקסט', type: 'text', rows: 6 }),
    defineField({ name: 'photos', title: 'תמונות', type: 'array', of: [{ type: 'image' }] }),
    defineField({ name: 'authorName', title: 'שם להצגה', type: 'string' }),
    defineField({ name: 'spaceId', title: 'מזהה חלל', type: 'string' }),
    defineField({ name: 'spaceName', title: 'חלל', type: 'string' }),
    defineField({ name: 'verified', title: 'הזמנה מאומתת', type: 'boolean' }),
    defineField({ name: 'bookingId', title: 'מזהה הזמנה', type: 'string' }),
    defineField({ name: 'supabaseUserId', title: 'מזהה משתמש', type: 'string' }),
    defineField({ name: 'submittedAt', title: 'נשלחה', type: 'datetime' }),
    defineField({ name: 'moderatedAt', title: 'טופלה', type: 'datetime' }),
  ],
  orderings: [{ title: 'החדשות קודם', name: 'submittedDesc', by: [{ field: 'submittedAt', direction: 'desc' }] }],
  preview: {
    select: { rating: 'rating', spaceName: 'spaceName', text: 'text', status: 'status', media: 'photos.0' },
    prepare: ({ rating, spaceName, text, status, media }) => ({
      title: `${'★'.repeat(Number(rating) || 0)} · ${spaceName ?? ''}`,
      subtitle: `${STATUS_TITLES[status as string] ?? ''} · ${String(text ?? '').slice(0, 80)}`,
      media,
    }),
  },
});
