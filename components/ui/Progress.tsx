import { cn } from '@/lib/utils';

export function Progress({
  value,
  max = 100,
  className,
  tone = 'ink',
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: 'ink' | 'accent' | 'auto';
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color =
    tone === 'auto'
      ? pct >= 90
        ? 'bg-red-500'
        : pct >= 70
          ? 'bg-amber-500'
          : 'bg-accent'
      : tone === 'accent'
        ? 'bg-accent'
        : 'bg-ink';

  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-line', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}
