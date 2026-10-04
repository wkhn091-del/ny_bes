import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import type { Catalog } from '@/lib/domain/types';

export function Footer({ catalog }: { catalog: Catalog }) {
  const { settings, branches, legalPages, cities } = catalog;
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-subtle">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm leading-6 text-muted">{settings.tagline}</p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">סניפים</h2>
          <ul className="space-y-2 text-sm text-muted">
            {cities.map((city) => (
              <li key={city.id}>
                <span className="text-fg">{city.name}</span>
                <ul className="mt-1 space-y-1 pr-3">
                  {branches
                    .filter((b) => b.city.id === city.id)
                    .map((b) => (
                      <li key={b.id}>
                        <Link href={`/branches/${b.slug}`} className="hover:text-fg">
                          {b.name}
                        </Link>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">מידע</h2>
          <ul className="space-y-2 text-sm text-muted">
            {legalPages.map((page) => (
              <li key={page.slug}>
                <Link href={`/legal/${page.slug}`} className="hover:text-fg">
                  {page.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold">יצירת קשר</h2>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              <a href={`https://wa.me/${settings.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                וואטסאפ
              </a>
            </li>
            <li>
              <a href={`mailto:${settings.legal.email}`} className="hover:text-fg">
                {settings.legal.email}
              </a>
            </li>
            {settings.instagramUrl && (
              <li>
                <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                  אינסטגרם
                </a>
              </li>
            )}
            {settings.linkedinUrl && (
              <li>
                <a href={settings.linkedinUrl} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                  לינקדאין
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {year} {settings.legal.companyName} · ח.פ {settings.legal.companyId} · {settings.legal.address}
          </p>
          <p>כל המחירים כוללים מע״מ</p>
        </div>
      </div>
    </footer>
  );
}
