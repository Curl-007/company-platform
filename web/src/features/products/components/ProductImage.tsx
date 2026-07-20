import { useState } from 'react';

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
  const [failed, setFailed] = useState(!src);
  if (!src || failed) {
    return <span className={fallbackClassName ?? `product-image-fallback ${className ?? ''}`}>{alt.slice(0, 1).toUpperCase()}</span>;
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
