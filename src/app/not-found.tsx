import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="grid-backdrop flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Link href="/" className="mb-10">
        <Logo />
      </Link>
      <p className="font-mono text-sm text-accent-text">404</p>
      <h1 className="mt-2 text-3xl font-bold">העמוד לא נמצא</h1>
      <p className="mt-3 max-w-md text-muted">ייתכן שהקישור שגוי או שהחלל הוסר מהקטלוג.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink href="/spaces">לכל החללים</ButtonLink>
        <ButtonLink href="/" variant="outline">
          לעמוד הבית
        </ButtonLink>
      </div>
    </div>
  );
}
