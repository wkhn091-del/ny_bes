import { defineQuery } from 'next-sanity';

// Every query uses an explicit projection and $params — never string concatenation.

const IMAGE = `{ "url": asset->url, "alt": coalesce(alt, "") }`;

export const CATALOG_QUERY = defineQuery(`{
  "cities": *[_type == "city" && defined(slug.current)] | order(order asc, name asc) {
    "id": _id, "slug": slug.current, name
  },
  "branches": *[_type == "branch" && active != false && defined(slug.current)] | order(isFlagship desc, name asc) {
    "id": _id,
    "slug": slug.current,
    name,
    "city": city->{ "id": _id, "slug": slug.current, name },
    address,
    wazeUrl,
    phone,
    "description": coalesce(description, ""),
    "isFlagship": coalesce(isFlagship, false),
    hours[]{ day, "closed": coalesce(closed, false), open, close },
    "image": image${IMAGE},
    "gallery": coalesce(gallery[]${IMAGE}, [])
  },
  "spaces": *[_type == "space" && active != false && defined(slug.current) && branch->active != false] | order(name asc) {
    "id": _id,
    "slug": slug.current,
    name,
    type,
    "branchId": branch._ref,
    description,
    "images": coalesce(images[]${IMAGE}, []),
    "videoUrl": coalesce(videoUrl, null),
    capacity,
    sizeSqm,
    hourlyPrice,
    "dayPassPrice": coalesce(dayPassPrice, null),
    "poolSize": coalesce(poolSize, null),
    "amenityIds": coalesce(amenities[]._ref, [])
  },
  "amenities": *[_type == "amenity" && defined(slug.current)] | order(name asc) {
    "id": _id, "slug": slug.current, name
  },
  "addons": *[_type == "addon" && active != false && defined(slug.current)] | order(price desc) {
    "id": _id, "slug": slug.current, name, "description": coalesce(description, ""), price, pricingMode, spaceTypes
  },
  "settings": *[_type == "siteSettings" && _id == "siteSettings"][0] {
    businessName,
    "tagline": coalesce(tagline, ""),
    whatsappNumber,
    "whatsappMessage": coalesce(whatsappMessage, ""),
    "instagramUrl": coalesce(instagram, null),
    "linkedinUrl": coalesce(linkedin, null),
    vatRate,
    autoDiscountMinHours,
    autoDiscountPercent,
    "legal": {
      "companyName": legalCompanyName,
      "companyId": legalCompanyId,
      "address": legalAddress,
      "email": legalEmail,
      "accessibilityCoordinator": accessibilityCoordinator,
      "accessibilityPhone": accessibilityPhone,
      "isDemo": coalesce(legalIsDemo, true)
    }
  },
  "seo": *[_type == "seo" && _id == "seo"][0] {
    metaTitle,
    metaDescription,
    "shareImage": select(defined(shareImage.asset) => shareImage${IMAGE}, null)
  },
  "legalPages": *[_type == "legal" && defined(slug.current)] | order(title asc) { "slug": slug.current, title }
}`);

export const LEGAL_PAGE_QUERY = defineQuery(`*[_type == "legal" && slug.current == $slug][0] {
  title,
  "slug": slug.current,
  "lawyerReviewed": coalesce(lawyerReviewed, false),
  content
}`);

export const PRICING_SOURCE_QUERY = defineQuery(`{
  "space": *[_type == "space" && _id == $spaceId && active != false && branch->active != false][0] {
    "id": _id, name, type, "branchId": branch._ref, capacity, hourlyPrice,
    "dayPassPrice": coalesce(dayPassPrice, null), "poolSize": coalesce(poolSize, null),
    "branch": branch->{ "id": _id, name, hours[]{ day, "closed": coalesce(closed, false), open, close } }
  },
  "addons": *[_type == "addon" && active != false && _id in $addonIds] {
    "id": _id, name, price, pricingMode, spaceTypes
  },
  "settings": *[_type == "siteSettings" && _id == "siteSettings"][0] { vatRate, autoDiscountMinHours, autoDiscountPercent }
}`);

export const MIRROR_SOURCE_QUERY = defineQuery(`{
  "branches": *[_type == "branch" && defined(slug.current)] {
    "id": _id, "slug": slug.current, name, "active": active != false,
    hours[]{ day, "closed": coalesce(closed, false), open, close }
  },
  "spaces": *[_type == "space" && defined(slug.current)] {
    "id": _id, "slug": slug.current, name, type, "branchId": branch._ref,
    "poolSize": coalesce(poolSize, null), "active": active != false
  }
}`);
