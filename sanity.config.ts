'use client';

import { defineConfig } from 'sanity';
import { structureTool, type StructureResolver } from 'sanity/structure';
import { approveReview, rejectReview } from './src/sanity/reviewActions';
import { contentSchemaTypes, customerSchemaTypes } from './src/sanity/schemaTypes';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'missing-project-id';
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const customersDataset = process.env.NEXT_PUBLIC_SANITY_CUSTOMERS_DATASET || 'customers';

const SINGLETONS = new Set(['siteSettings', 'seo']);

const contentStructure: StructureResolver = (S) =>
  S.list()
    .title('SpaceHub')
    .items([
      S.listItem().title('הגדרות אתר').id('siteSettings').child(S.document().schemaType('siteSettings').documentId('siteSettings')),
      S.listItem().title('SEO').id('seo').child(S.document().schemaType('seo').documentId('seo')),
      S.divider(),
      S.documentTypeListItem('city').title('ערים'),
      S.documentTypeListItem('branch').title('סניפים'),
      S.documentTypeListItem('space').title('חללים'),
      S.documentTypeListItem('amenity').title('ציוד ושירותים'),
      S.documentTypeListItem('addon').title('תוספות'),
      S.divider(),
      S.documentTypeListItem('legal').title('עמודים משפטיים'),
    ]);

const customersStructure: StructureResolver = (S) =>
  S.list()
    .title('לקוחות (פרטי)')
    .items([
      S.listItem()
        .title('ביקורות ממתינות לאישור')
        .id('reviews-pending')
        .child(S.documentList().title('ממתינות').schemaType('review').filter('_type == "review" && status == "pending"').defaultOrdering([{ field: 'submittedAt', direction: 'asc' }])),
      S.listItem()
        .title('ביקורות מאושרות')
        .id('reviews-approved')
        .child(S.documentList().title('מאושרות').schemaType('review').filter('_type == "review" && status == "approved"')),
      S.listItem()
        .title('ביקורות שנדחו')
        .id('reviews-rejected')
        .child(S.documentList().title('נדחו').schemaType('review').filter('_type == "review" && status == "rejected"')),
      S.divider(),
      S.documentTypeListItem('customer').title('לקוחות'),
    ]);

export default defineConfig([
  {
    name: 'content',
    title: 'SpaceHub — תוכן',
    basePath: '/studio/content',
    projectId,
    dataset,
    plugins: [structureTool({ structure: contentStructure })],
    schema: {
      types: contentSchemaTypes,
      templates: (templates) => templates.filter(({ schemaType }) => !SINGLETONS.has(schemaType)),
    },
    document: {
      actions: (actions, { schemaType }) =>
        SINGLETONS.has(schemaType)
          ? actions.filter(({ action }) => action && ['publish', 'discardChanges', 'restore'].includes(action))
          : actions,
    },
  },
  {
    name: 'customers',
    title: 'SpaceHub — לקוחות (פרטי)',
    basePath: '/studio/customers',
    projectId,
    dataset: customersDataset,
    plugins: [structureTool({ structure: customersStructure })],
    schema: { types: customerSchemaTypes, templates: () => [] },
    document: {
      actions: (_actions, { schemaType }) => (schemaType === 'review' ? [approveReview, rejectReview] : []),
    },
  },
]);
