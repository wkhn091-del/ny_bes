'use client';

import { clsx } from 'clsx';
import { ImagePlus, Loader2, Star, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Turnstile } from '@/components/security/Turnstile';
import { Button } from '@/components/ui/Button';
import { REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_MAX_COUNT } from '@/lib/security/image-guard';
import { REVIEW_TEXT_MAX, REVIEW_TEXT_MIN } from '@/lib/reviews/review';

const RATING_WORDS = ['', 'גרוע', 'לא משהו', 'סביר', 'טוב מאוד', 'מצוין'];
const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_EDGE = 1600;

const ERRORS: Record<string, string> = {
  captcha: 'האימות נכשל. נסו שוב.',
  rate_limited: 'שלחתם כמה ביקורות ברצף. נסו שוב בעוד שעה.',
  already_reviewed: 'כבר כתבתם ביקורת על החלל הזה.',
  not_eligible: 'אפשר לכתוב ביקורת רק אחרי הזמנה בחלל הזה.',
  photo_invalid: 'אחת התמונות לא נתמכת. אפשר JPG, PNG או WebP.',
  too_large: 'התמונות גדולות מדי. נסו פחות תמונות.',
  unauthorized: 'פג תוקף ההתחברות. התחברו מחדש ונסו שוב.',
};

/** Downscales in the browser (also drops EXIF/GPS on re-encode); the server re-validates and re-encodes anyway. */
async function shrink(file: File): Promise<Blob | null> {
  if (!ACCEPT.split(',').includes(file.type) || file.size > 25_000_000) return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob && blob.size <= REVIEW_PHOTO_MAX_BYTES ? blob : null;
  } catch {
    return null;
  }
}

interface Photo {
  blob: Blob;
  url: string;
}

export function ReviewForm({ spaceId, turnstileSiteKey, nonce }: { spaceId: string; turnstileSiteKey: string; nonce?: string }) {
  const id = useId();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const photosRef = useRef<Photo[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = REVIEW_PHOTO_MAX_COUNT - photos.length;
    const picked = Array.from(files).slice(0, room);
    const shrunk = await Promise.all(picked.map(shrink));
    if (shrunk.some((b) => b === null)) setError('אפשר להעלות רק תמונות JPG, PNG או WebP.');
    const next = shrunk.filter((b): b is Blob => b !== null).map((blob) => ({ blob, url: URL.createObjectURL(blob) }));
    setPhotos((prev) => [...prev, ...next].slice(0, REVIEW_PHOTO_MAX_COUNT));
  }

  function removePhoto(url: string) {
    URL.revokeObjectURL(url);
    setPhotos((prev) => prev.filter((p) => p.url !== url));
  }

  const trimmed = text.trim().length;
  const needsCaptcha = Boolean(turnstileSiteKey);
  const canSend = rating > 0 && trimmed >= REVIEW_TEXT_MIN && trimmed <= REVIEW_TEXT_MAX && (!needsCaptcha || token) && status === 'idle';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend) return;
    setStatus('sending');
    setError(null);
    const body = new FormData();
    body.set('spaceId', spaceId);
    body.set('rating', String(rating));
    body.set('text', text);
    body.set('website', (e.currentTarget.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '');
    body.set('turnstileToken', token ?? '');
    photos.forEach((p, i) => body.append('photos', p.blob, `photo-${i}.jpg`));
    try {
      const res = await fetch('/api/reviews', { method: 'POST', body });
      if (res.ok) {
        setStatus('done');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(ERRORS[data.error ?? ''] ?? 'משהו השתבש. נסו שוב בעוד רגע.');
    } catch {
      setError('אין חיבור לרשת. נסו שוב.');
    }
    setStatus('idle');
    setResetKey((k) => k + 1);
  }

  if (status === 'done') {
    return (
      <p className="rounded-xl bg-success-soft p-4 text-sm text-success" role="status">
        תודה! הביקורת התקבלה ותפורסם אחרי בדיקה קצרה (בדרך כלל עד יום עסקים).
      </p>
    );
  }

  const shown = hover || rating;

  return (
    <form onSubmit={submit} className="relative rounded-2xl border border-border bg-subtle p-5" noValidate>
      <h3 className="font-semibold">איך היה?</h3>
      <p className="mb-4 text-xs text-muted">הביקורת שלכם עוזרת לאחרים לבחור — ומופיעה עם שם פרטי ואות ראשונה בלבד.</p>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">דירוג</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" />
              <Star
                className={clsx('h-7 w-7 rounded transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent', n <= shown ? 'fill-warning text-warning' : 'text-border-strong')}
                aria-hidden="true"
              />
              <span className="sr-only">
                {n} כוכבים — {RATING_WORDS[n]}
              </span>
            </label>
          ))}
          <span className="ms-2 text-sm text-muted" aria-live="polite">
            {RATING_WORDS[shown]}
          </span>
        </div>
      </fieldset>

      <label htmlFor={`${id}-text`} className="mb-1 mt-4 block text-sm font-medium">
        מה כדאי לדעת על החלל?
      </label>
      <textarea
        id={`${id}-text`}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, REVIEW_TEXT_MAX))}
        rows={4}
        maxLength={REVIEW_TEXT_MAX}
        placeholder="שקט? נוח? הציוד עבד? איך הצוות?"
        aria-describedby={`${id}-count`}
        className="w-full rounded-xl border border-border bg-bg p-3 text-sm focus:border-accent focus:outline-none"
      />
      <p id={`${id}-count`} className="mt-1 text-xs text-muted">
        {trimmed < REVIEW_TEXT_MIN ? `עוד ${REVIEW_TEXT_MIN - trimmed} תווים לפחות` : `${trimmed}/${REVIEW_TEXT_MAX}`}
      </p>

      <div className="mt-4">
        <span className="mb-1 block text-sm font-medium">תמונות (לא חובה, עד {REVIEW_PHOTO_MAX_COUNT})</span>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={p.url} className="relative h-20 w-20 overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={p.url} alt={`תמונה ${i + 1} שנבחרה`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(p.url)}
                className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                aria-label={`הסרת תמונה ${i + 1}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          {photos.length < REVIEW_PHOTO_MAX_COUNT && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong text-xs text-muted hover:border-accent hover:text-accent-text focus-within:ring-2 focus-within:ring-accent">
              <ImagePlus className="h-5 w-5" aria-hidden="true" />
              הוספה
              <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ''))} />
            </label>
          )}
        </div>
      </div>

      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          אתר
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {needsCaptcha && <Turnstile siteKey={turnstileSiteKey} action="review" nonce={nonce} onToken={setToken} resetKey={resetKey} />}

      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="mt-4" disabled={!canSend}>
        {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        שליחת ביקורת
      </Button>
    </form>
  );
}
