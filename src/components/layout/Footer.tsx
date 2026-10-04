import { ArrowLeft, BadgeCheck, CreditCard, Mail, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { RenderBadge } from '@/components/ui/RenderBadge';
import { FREE_CANCELLATION_HOURS } from '@/lib/domain/booking-rules';
import type { Catalog } from '@/lib/domain/types';

export function Footer({ catalog }: { catalog: Catalog }) {
  const { settings, branches, legalPages, spaces } = catalog;
  const year = new Date().getFullYear();
  const promises = [
    { icon: ShieldCheck, title: `ביטול חינם עד ${FREE_CANCELLATION_HOURS} שעות לפני`, text: 'החזר מלא, אוטומטית, לאמצעי התשלום.' },
    { icon: BadgeCheck, title: 'המחיר שרואים הוא המחיר שמשלמים', text: 'כולל מע״מ. בלי עמלות ובלי הפתעות בקופה.' },
    { icon: CreditCard, title: 'תשלום מאובטח ב-Stripe', text: 'פרטי הכרטיס לא עוברים דרכנו.' },
  ];

  return (
    <footer className="relative isolate overflow-hidden border-t border-border bg-zinc-950 text-zinc-300">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_85%_0%,rgba(124,58,237,0.28),transparent_70%),radial-gradient(40%_40%_at_0%_100%,rgba(124,58,237,0.14),transparent_70%)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <ul className="grid gap-3 border-b border-white/10 py-8 sm:grid-cols-3 sm:gap-6 sm:py-10">
          {promises.map((p) => (
            <li key={p.title} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-violet-300">
                <p.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">{p.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-zinc-400">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="py-10 sm:py-12">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-lg font-bold text-white sm:text-xl">{branches.length} סניפים, קרוב לתחבורה ציבורית</h2>
            <Link href="/spaces" className="hidden items-center gap-1 text-sm font-semibold text-violet-300 hover:text-white sm:flex">
              לכל החללים <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
            {branches.map((branch) => {
              const count = spaces.filter((s) => s.branchId === branch.id).length;
              return (
                <li key={branch.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
                  <Link
                    href={`/branches/${branch.slug}`}
                    className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-[border-color,transform] duration-(--dur-base) ease-(--ease-out) hover:-translate-y-0.5 hover:border-violet-400/60"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <Image
                        src={branch.image.url}
                        alt={branch.image.alt}
                        fill
                        sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 72vw"
                        className="object-cover transition-transform duration-(--dur-reveal) ease-(--ease-out) group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent" />
                      <RenderBadge image={branch.image} className="left-2 top-2" />
                      <p className="absolute bottom-2 right-3 text-xs font-medium text-white/85">{branch.city.name}</p>
                    </div>
                    <div className="p-3">
                      <p className="font-semibold text-white">
                        {branch.name}
                        {branch.isFlagship && <span className="mr-2 rounded-full bg-accent px-2 py-0.5 align-middle text-3xs font-semibold text-white">הדגל</span>}
                      </p>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-400">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {branch.address}
                      </p>
                      <p className="mt-1 text-xs text-violet-300">{count} חללים להזמנה</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid gap-10 border-t border-white/10 py-10 md:grid-cols-[1.3fr_1fr_1fr]">
          <div className="space-y-4">
            <Logo className="text-white [&_.text-accent-text]:text-violet-300" />
            <p className="max-w-sm text-sm leading-6 text-zinc-400">{settings.tagline}</p>
          </div>

          <nav aria-label="מידע">
            <h2 className="mb-3 text-sm font-semibold text-white">מידע</h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm md:grid-cols-1">
              {legalPages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/legal/${page.slug}`} className="text-zinc-400 transition-colors hover:text-white">
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-white">מדברים איתנו</h2>
            <div className="flex flex-col gap-2.5 sm:flex-row md:flex-col">
              <a
                href={`https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(settings.whatsappMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 text-sm font-semibold text-zinc-950 transition-transform duration-(--dur-micro) ease-(--ease-out) hover:brightness-105 active:scale-[0.97]"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                וואטסאפ — עונים מהר
              </a>
              <a
                href={`mailto:${settings.legal.email}`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-medium text-white transition-colors hover:border-white/40"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                <span dir="ltr">{settings.legal.email}</span>
              </a>
            </div>
            {(settings.instagramUrl || settings.linkedinUrl) && (
              <div className="mt-3 flex gap-4 text-sm">
                {settings.instagramUrl && (
                  <a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white">
                    אינסטגרם
                  </a>
                )}
                {settings.linkedinUrl && (
                  <a href={settings.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white">
                    לינקדאין
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-1.5 px-4 py-5 pb-24 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-5">
          <p>
            © {year} {settings.legal.companyName} · ח.פ {settings.legal.companyId}
          </p>
          <p>{settings.legal.address} · כל המחירים כוללים מע״מ</p>
        </div>
      </div>
    </footer>
  );
}
