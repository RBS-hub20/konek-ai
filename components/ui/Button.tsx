'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  /* Inverts with the theme: black on light, white on dark */
  primary: 'bg-ink text-paper border border-ink hover:opacity-85',
  secondary: 'bg-paper text-ink border border-line hover:bg-surface',
  ghost: 'bg-transparent text-muted border border-transparent hover:text-ink hover:bg-surface',
  accent: 'bg-accent text-white border border-accent hover:opacity-90',
  danger: 'bg-paper text-red-600 border border-line hover:bg-surface',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-brand font-medium',
        'transition-[opacity,background-color,color] duration-150 focus-ring',
        'disabled:pointer-events-none disabled:opacity-40',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
