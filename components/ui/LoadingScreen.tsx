'use client';

import { motion } from 'framer-motion';
import { LogoLockup } from './Logo';

export function LoadingScreen({ label = 'Connecting' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-paper">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <LogoLockup width={168} />
      </motion.div>
      <div className="flex items-center gap-3">
        <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-dot" />
        <span className="eyebrow">{label}</span>
      </div>
    </div>
  );
}

/* Also exported as default for route-level loading files. */
export default LoadingScreen;
