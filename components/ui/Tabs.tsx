'use client';

import { cn } from '@/lib/utils';

export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              'h-9 rounded-brand border px-4 text-[13px] font-medium transition-colors focus-ring',
              active
                ? 'border-ink bg-ink text-paper'
                : 'border-line bg-paper text-muted hover:text-ink hover:bg-surface'
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
