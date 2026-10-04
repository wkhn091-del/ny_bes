import { clsx } from 'clsx';
import Image from 'next/image';

interface Props {
  avatarUrl: string | null;
  initials: string;
  size?: number;
  className?: string;
}

/** Google profile picture through the image optimizer (no third-party request from the browser), else initials. */
export function UserAvatar({ avatarUrl, initials, size = 28, className }: Props) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={clsx('shrink-0 rounded-full object-cover', className)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-text',
        className,
      )}
    >
      {initials}
    </span>
  );
}
