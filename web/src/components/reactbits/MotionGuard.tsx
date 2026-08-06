import React from 'react';

/**
 * Adapts react-bits animation components to the app's reduced-motion contract.
 *
 * react-bits components animate unconditionally and ignore prefers-reduced-motion.
 * The app theme engine emits `data-work-motion="reduced"` on <html> (and the user
 * can toggle it in ThemeSettings). When motion is reduced — either via that data
 * attribute or the OS-level prefers-reduced-motion — we skip the animated
 * component entirely and render a static fallback so the UI is still legible.
 *
 * Usage:
 *   <MotionGuard fallback={<span>{value}</span>}>
 *     <CountUp to={value} />
 *   </MotionGuard>
 */
export function MotionGuard({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [reduced, setReduced] = React.useState(() => isMotionReduced());

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(isMotionReduced());
    update();
    media.addEventListener('change', update);
    // Also observe the data-work-motion attribute in case the user toggles it
    // at runtime via ThemeSettings without a reload.
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-work-motion'],
    });
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);

  return <>{reduced ? fallback : children}</>;
}

function isMotionReduced(): boolean {
  if (typeof window === 'undefined') return false;
  if (document.documentElement.dataset.workMotion === 'reduced') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
