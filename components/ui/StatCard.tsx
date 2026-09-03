import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  delta,
  accent = false,
  icon,
}: {
  label: string;
  value: string;
  delta?: string;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-brand border border-line bg-paper p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-medium text-muted">{label}</span>
        {icon && <span className={cn('text-muted', accent && 'text-accent')}>{icon}</span>}
      </div>
      <div
        className={cn(
          'mt-4 font-display text-[30px] font-semibold leading-none tracking-tight',
          accent ? 'text-accent' : 'text-ink'
        )}
      >
        {value}
      </div>
      {delta && <div className="mt-2 text-[12px] text-muted">{delta}</div>}
    </div>
  );
}
