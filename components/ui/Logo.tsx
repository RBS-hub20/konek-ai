'use client';

/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils';

/* The official KONEK AI logo — always the real image file in /public.
   Black artwork on light, white artwork on dark: same logo, swapped for contrast. */

const MARK_SIZES = { sm: 22, md: 28, lg: 40 } as const;
const WORD_SIZES = { sm: 'text-[11px]', md: 'text-[13px]', lg: 'text-[15px]' } as const;
export type LogoSize = keyof typeof MARK_SIZES;

/** Icon only — the K mark. */
export function LogoMark({ size = 'md', className }: { size?: LogoSize | number; className?: string }) {
  const px = typeof size === 'number' ? size : MARK_SIZES[size];
  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: px, height: px }}
      aria-hidden
    >
      <img
        src="/logo-mark.png"
        alt=""
        width={px}
        height={px}
        className="absolute inset-0 h-full w-full object-contain dark:hidden"
      />
      <img
        src="/logo-mark-white.png"
        alt=""
        width={px}
        height={px}
        className="absolute inset-0 hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}

/** Horizontal lockup: mark + KONEK AI wordmark. Used in every header and sidebar. */
export function Logo({
  size = 'md',
  className,
  showWordmark = true,
}: {
  size?: LogoSize;
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span
          className={cn(
            'font-display font-medium uppercase tracking-wordmark text-ink',
            WORD_SIZES[size]
          )}
        >
          Konek AI
        </span>
      )}
      <span className="sr-only">KONEK AI</span>
    </span>
  );
}

/** Full stacked logo file — loading screens and hero moments. */
export function LogoLockup({ width = 180, className }: { width?: number; className?: string }) {
  const height = Math.round((width * 592) / 1024);
  return (
    <span className={cn('relative inline-block', className)} style={{ width, height }}>
      <img
        src="/logo.png"
        alt="KONEK AI"
        width={width}
        height={height}
        className="absolute inset-0 h-full w-full object-contain dark:hidden"
      />
      <img
        src="/logo-white.png"
        alt="KONEK AI"
        width={width}
        height={height}
        className="absolute inset-0 hidden h-full w-full object-contain dark:block"
      />
    </span>
  );
}

export default Logo;
