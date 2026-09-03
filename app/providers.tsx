'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function Providers({
  children,
  defaultTheme = 'light',
  forcedTheme,
}: {
  children: ReactNode;
  defaultTheme?: string;
  forcedTheme?: string;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      forcedTheme={forcedTheme}
      enableSystem={false}
      disableTransitionOnChange
      storageKey="konek-theme"
    >
      {children}
    </ThemeProvider>
  );
}
