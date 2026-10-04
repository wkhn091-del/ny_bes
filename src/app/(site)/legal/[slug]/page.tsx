import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLegalPage } from '@/lib/content/catalog';
import { slugSchema } from '@/lib/domain/schemas';

const components: PortableTextComponents = {
  block: {
    h2: ({ children }) => <h2 className="mb-3 mt-10 text-xl font-bold">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-6 text-lg font-semibold">{children}</h3>,
    normal: ({ children }) => <p className="mb-4 leading-8 text-fg/90">{children}</p>,
    blockquote: ({ children }) => <blockquote className="my-4 border-r-4 border-accent pr-4 text-muted">{children}</blockquote>,
  },
  list: {
    bullet: ({ children }) => <ul className="mb-4 list-disc space-y-1 pr-6 leading-8">{children}</ul>,
    number: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pr-6 leading-8">{children}</ol>,
  },
  marks: {
    link: ({ value, children }) => {
      const href = typeof value?.href === 'string' ? value.href : '';
      const safe = /^(https:\/\/|mailto:|tel:|\/)/.test(href) ? href : undefined;
      if (!safe) return <>{children}</>;
      const external = safe.startsWith('https://');
      return (
        <a href={safe} className="font-medium text-accent-text underline" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {children}
        </a>
      );
    },
  },
};

async function load(slug: string) {
  return slugSchema.safeParse(slug).success ? getLegalPage(slug) : null;
}

export async function generateMetadata({ params }: PageProps<'/legal/[slug]'>): Promise<Metadata> {
  const page = await load((await params).slug);
  return page ? { title: page.title, alternates: { canonical: `/legal/${page.slug}` } } : { title: 'העמוד לא נמצא' };
}

export default async function LegalPage({ params }: PageProps<'/legal/[slug]'>) {
  const page = await load((await params).slug);
  if (!page) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      {!page.lawyerReviewed && (
        <p role="note" className="mb-8 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          טיוטה: מסמך זה טרם נבדק על ידי עורך דין ואינו מהווה ייעוץ משפטי.
        </p>
      )}
      <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
      <div className="mt-8">
        <PortableText value={page.content} components={components} />
      </div>
    </article>
  );
}
