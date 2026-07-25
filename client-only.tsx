'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Renders its children only in the browser, after mount. Coddy apps run fully
 * client-side, so reading localStorage / window / document / Date / Math.random
 * while rendering is always safe here and can NEVER cause a server/client
 * hydration mismatch (the "build passed but the preview shows a runtime error"
 * trap). Keep <ClientOnly> wrapping {children} in app/layout.tsx, and don't
 * delete this file — it's what keeps every page free of hydration errors.
 */
export default function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main aria-hidden style={{ minHeight: '100vh' }} suppressHydrationWarning />;
  return <>{children}</>;
}
