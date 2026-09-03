'use client';

import { cn } from '@/lib/utils';

export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200 focus-ring',
        checked ? 'border-accent bg-accent' : 'border-line bg-surface',
        className
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all duration-200',
          checked ? 'left-[calc(100%-1.125rem)] bg-white' : 'left-[0.15rem] bg-ink/40'
        )}
      />
    </button>
  );
}
