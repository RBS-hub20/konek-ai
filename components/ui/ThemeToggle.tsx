'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'inline-flex items-center gap-2 rounded-brand border border-line px-2.5 text-muted',
        'h-9 transition-colors hover:text-ink hover:bg-surface focus-ring',
        withLabel && 'px-3',
        className
      )}
    >
      {/* Render a stable icon until mounted to avoid a hydration mismatch */}
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {withLabel && <span className="text-[13px]">{isDark ? 'Light' : 'Dark'}</span>}
    </button>
  );
}
