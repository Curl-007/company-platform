import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlob } from '../../../services/api';
import ProductImage from './ProductImage';

vi.mock('../../../services/api', () => ({ getBlob: vi.fn() }));

let container: HTMLDivElement;
let root: Root;
let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  createObjectUrl = vi.fn(() => 'blob:product-image');
  revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('ProductImage', () => {
  it('loads protected product content through the authenticated blob helper and revokes it', async () => {
    vi.mocked(getBlob).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    const src = '/api/products/PROD-1/images/IMG-1/content';

    await act(async () => {
      root.render(createElement(ProductImage, { src, alt: 'Product' }));
      await Promise.resolve();
    });

    expect(getBlob).toHaveBeenCalledWith(src, { signal: expect.any(AbortSignal) });
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:product-image');
    const signal = vi.mocked(getBlob).mock.calls[0][1]?.signal;

    await act(async () => root.unmount());
    expect(signal?.aborted).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:product-image');
    root = createRoot(container);
  });

  it('renders public URLs directly without fetching a blob', async () => {
    await act(async () => {
      root.render(createElement(ProductImage, { src: 'https://cdn.example.com/cover.png', alt: 'Product' }));
    });

    expect(getBlob).not.toHaveBeenCalled();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/cover.png');
  });
});
