import { serializeJsonLd, type JsonLdObject } from '@/lib/seo/structured-data';

/** Data block, not executable script: CSP script-src does not apply, and the serializer escapes every HTML-significant character. */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
