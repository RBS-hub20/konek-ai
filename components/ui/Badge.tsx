import { cn } from '@/lib/utils';

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'solid';

const tones: Record<Tone, string> = {
  default: 'border-line text-muted',
  accent: 'border-accent/30 text-accent bg-accent/[0.07]',
  success: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/[0.07]',
  warning: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/[0.07]',
  danger: 'border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/[0.07]',
  solid: 'border-ink bg-ink text-paper',
};

export function Badge({
  tone = 'default',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function StatusDot({ tone = 'success' }: { tone?: 'success' | 'warning' | 'danger' }) {
  const color =
    tone === 'success' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-red-500';
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)} />;
}
