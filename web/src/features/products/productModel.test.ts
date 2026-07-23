import { describe, expect, it } from 'vitest';
import type { Product } from '../../types';
import {
  PRODUCT_IMAGE_MAX_BYTES,
  isAcceptedProductImage,
  productImageUrls,
  productImages,
  validateProductImageFiles,
} from './productModel';

function file(name: string, type: string, size = 1): File {
  const value = new File(['x'], name, { type });
  Object.defineProperty(value, 'size', { configurable: true, value: size });
  return value;
}

function product(partial: Partial<Product> = {}): Product {
  return {
    id: 'PROD-1',
    name: 'Product',
    owner: 'Owner',
    version: '1.0.0',
    stage: 'design',
    images: [],
    modules: [],
    roadmap: [],
    ...partial,
  };
}

describe('product image model', () => {
  it('accepts only server-compatible extension and MIME pairs', () => {
    expect(isAcceptedProductImage(file('cover.png', 'image/png'))).toBe(true);
    expect(isAcceptedProductImage(file('cover.JPEG', 'image/jpeg'))).toBe(true);
    expect(isAcceptedProductImage(file('cover.svg', 'image/svg+xml'))).toBe(false);
    expect(isAcceptedProductImage(file('cover.gif', 'image/png'))).toBe(false);
    expect(isAcceptedProductImage(file('cover', 'image/png'))).toBe(false);
  });

  it('enforces the 5 MiB and six-image limits before upload', () => {
    expect(validateProductImageFiles([file('cover.webp', 'image/webp')], 5)).toBeNull();
    expect(validateProductImageFiles([file('extra.gif', 'image/gif')], 6)).toContain('最多 6 张');
    expect(validateProductImageFiles([
      file('large.png', 'image/png', PRODUCT_IMAGE_MAX_BYTES + 1),
    ], 0)).toContain('超过 5 MiB');
  });

  it('sorts structured images and only falls back to legacy URLs when needed', () => {
    const structured = product({
      images: [
        { id: 'IMG-2', url: '/second', fileName: 'second.png', mimeType: 'image/png', size: 2, sortOrder: 2 },
        { id: 'IMG-1', url: '/first', fileName: 'first.png', mimeType: 'image/png', size: 1, sortOrder: 1 },
      ],
      imageUrls: ['https://legacy.example/ignored.png'],
    });
    expect(productImages(structured).map((image) => image.id)).toEqual(['IMG-1', 'IMG-2']);
    expect(productImageUrls(structured)).toEqual(['/first', '/second']);
    expect(productImageUrls(product({ imageUrls: ['https://legacy.example/cover.png'] })))
      .toEqual(['https://legacy.example/cover.png']);
  });
});
