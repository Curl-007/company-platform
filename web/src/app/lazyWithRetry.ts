import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type DefaultModule<T> = { default: T };

/**
 * React.lazy wrapper that retries a failed dynamic import once after a short delay.
 * Helps transient network blips; permanent failures still surface to ErrorBoundary.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<DefaultModule<T>>,
  retries = 1,
  delayMs = 400,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;
    const attempts = Math.max(0, retries) + 1;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (i < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
        }
      }
    }
    throw lastError;
  });
}
