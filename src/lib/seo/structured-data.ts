import type { Branch, Space } from '@/lib/domain/types';
import { SPACE_TYPE_LABELS } from '@/lib/domain/types';
import type { PublicReview } from '@/lib/server/reviews';
import type { RatingSummary } from '@/lib/reviews/review';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
export type JsonLdObject = { [key: string]: Json | undefined };

const UNSAFE_CHARS: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/** JSON for a `<script type="application/ld+json">` body: `</script>`, HTML comments and line separators can't break out. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (ch) => UNSAFE_CHARS[ch]);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function absolute(base: string, pathOrUrl: string): string {
  return pathOrUrl.startsWith('/') ? `${base}${pathOrUrl}` : pathOrUrl;
}

export function breadcrumbJsonLd(base: string, items: { name: string; path: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absolute(base, item.path),
    })),
  };
}

/**
 * Product + Offer for a bookable space. Price is the real catalog hourly rate (VAT-inclusive).
 * Rating and reviews are emitted only from approved, verified reviews — never when there are none.
 */
export function spaceJsonLd(input: {
  base: string;
  businessName: string;
  space: Space;
  branch: Branch;
  rating: RatingSummary;
  reviews: PublicReview[];
}): JsonLdObject {
  const { base, businessName, space, branch, rating, reviews } = input;
  const url = absolute(base, `/spaces/${space.slug}`);
  const price = (space.hourlyPrice / 100).toFixed(2);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: `${space.name} · ${branch.name}, ${branch.city.name}`,
    description: space.description.slice(0, 500),
    category: SPACE_TYPE_LABELS[space.type],
    image: space.images.slice(0, 6).map((img) => absolute(base, img.url)),
    url,
    brand: { '@type': 'Brand', name: businessName },
    offers: {
      '@type': 'Offer',
      url,
      price,
      priceCurrency: 'ILS',
      availability: 'https://schema.org/InStock',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price,
        priceCurrency: 'ILS',
        unitCode: 'HUR',
        unitText: space.type === 'hotDesk' ? 'שעה לעמדה' : 'שעה',
        valueAddedTaxIncluded: true,
      },
      seller: { '@type': 'Organization', name: businessName },
    },
    aggregateRating:
      rating.count > 0
        ? { '@type': 'AggregateRating', ratingValue: rating.average.toFixed(1), reviewCount: rating.count, bestRating: 5, worstRating: 1 }
        : undefined,
    review:
      reviews.length > 0
        ? reviews.slice(0, 5).map((r) => ({
            '@type': 'Review',
            reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            author: { '@type': 'Person', name: r.authorName },
            datePublished: r.submittedAt.slice(0, 10),
            reviewBody: r.text.slice(0, 1000),
          }))
        : undefined,
  };
}

export function branchJsonLd(input: { base: string; businessName: string; branch: Branch }): JsonLdObject {
  const { base, businessName, branch } = input;
  const url = absolute(base, `/branches/${branch.slug}`);
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${url}#branch`,
    name: `${businessName} ${branch.name}`,
    description: branch.description.slice(0, 500),
    url,
    image: absolute(base, branch.image.url),
    telephone: branch.phone,
    address: { '@type': 'PostalAddress', streetAddress: branch.address, addressLocality: branch.city.name, addressCountry: 'IL' },
    openingHoursSpecification: branch.hours
      .filter((h) => !h.closed)
      .map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_NAMES[h.day], opens: h.open, closes: h.close })),
    priceRange: '₪₪',
  };
}
