import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '../../../types';
import ProductForm, { type ProductFormSubmission } from './ProductForm';

let container: HTMLDivElement;
let root: Root;
let mounted: boolean;
let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

const initial: Product = {
  id: 'PROD-1',
  name: 'Managed product',
  owner: 'Owner',
  version: '1.0.0',
  stage: 'design',
  images: [{
    id: 'IMG-OLD',
    url: 'https://cdn.example.com/old.png',
    fileName: 'old.png',
    mimeType: 'image/png',
    size: 10,
    sortOrder: 0,
  }],
  imageUrl: 'https://legacy.example/old.png',
  imageUrls: ['https://legacy.example/old.png'],
  modules: [],
  roadmap: [],
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mounted = true;
  createObjectUrl = vi.fn(() => 'blob:pending-image');
  revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
});

afterEach(async () => {
  if (mounted) await act(async () => root.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('ProductForm image submission', () => {
  it('submits raw Files and persistent deletion IDs without legacy image fields', async () => {
    const onSubmit = vi.fn<(submission: ProductFormSubmission) => Promise<void>>().mockResolvedValue(undefined);
    await act(async () => {
      root.render(createElement(ProductForm, {
        title: '编辑产品',
        initial,
        onClose: vi.fn(),
        onSubmit,
      }));
    });

    const imageDelete = document.querySelector<HTMLButtonElement>('.product-image-preview-item button');
    await act(async () => imageDelete?.click());

    const file = new File(['new'], 'new.webp', { type: 'image/webp' });
    const fileInput = document.querySelector<HTMLInputElement>('#product-image-upload');
    expect(fileInput?.accept).not.toContain('svg');
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
    await act(async () => {
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(createObjectUrl).toHaveBeenCalledWith(file);

    const save = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === '保存');
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submission = onSubmit.mock.calls[0][0];
    expect(submission.product).not.toHaveProperty('imageUrl');
    expect(submission.product).not.toHaveProperty('imageUrls');
    expect(submission.imageChanges.deleteIds).toEqual(['IMG-OLD']);
    expect(submission.imageChanges.files).toEqual([file]);

    await act(async () => root.unmount());
    mounted = false;
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:pending-image');
  });
});
