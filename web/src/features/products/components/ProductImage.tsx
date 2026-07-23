import { useEffect, useState } from 'react';
import { getBlob } from '../../../services/api';

export function isProtectedProductImageSource(src: string): boolean {
  try {
    const url = new URL(src, window.location.origin);
    return url.origin === window.location.origin
      && /^\/api\/products\/[^/]+\/images\/[^/]+\/content$/.test(url.pathname);
  } catch {
    return false;
  }
}

export default function ProductImage({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src?: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [loadedBlob, setLoadedBlob] = useState<{ source: string; url: string } | null>(null);
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const protectedSource = src ? isProtectedProductImageSource(src) : false;

  useEffect(() => {
    if (!src || !protectedSource) return undefined;

    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    getBlob(src, { signal: controller.signal })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setLoadedBlob({ source: src, url: objectUrl });
        setFailedSource(null);
      })
      .catch(() => {
        if (active) setFailedSource(src);
      });

    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [protectedSource, src]);

  const resolvedSource = protectedSource
    ? loadedBlob && loadedBlob.source === src ? loadedBlob.url : ''
    : src ?? '';
  const failed = !src || failedSource === src;

  if (!resolvedSource || failed) {
    return <span className={fallbackClassName ?? `product-image-fallback ${className ?? ''}`}>{alt.slice(0, 1).toUpperCase()}</span>;
  }
  return <img src={resolvedSource} alt={alt} className={className} onError={() => setFailedSource(src ?? null)} />;
}
