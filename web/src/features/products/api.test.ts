import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, setToken } from '../../services/api';
import {
  applyProductImageChanges,
  uploadProductImage,
} from './api';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function uploadedImage(id: string, fileName: string) {
  return {
    id,
    url: `/api/products/PROD-1/images/${id}/content`,
    fileName,
    mimeType: 'image/png',
    size: 1,
    sortOrder: 0,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  window.location.hash = '';
  setToken('product-token');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  setToken(null);
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('product image API', () => {
  it('uploads a File as multipart without overriding the browser content type', async () => {
    const image = uploadedImage('IMG-1', 'cover.png');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: { image, product: { id: 'PROD-1' } } }, 201));
    const file = new File(['png'], 'cover.png', { type: 'image/png' });

    await expect(uploadProductImage('PROD-1', file)).resolves.toMatchObject({ image });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/products/PROD-1/images');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer product-token' });
    expect(init?.headers).not.toHaveProperty('Content-Type');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('deletes first, attempts every upload, and reports partial failures without rejecting', async () => {
    const uploaded = uploadedImage('IMG-NEW', 'good.png');
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ data: { deleted: true, id: 'IMG-OLD', product: { id: 'PROD-1' } } }))
      .mockResolvedValueOnce(jsonResponse({ message: 'delete denied' }, 403))
      .mockResolvedValueOnce(jsonResponse({ message: 'bad image' }, 400))
      .mockResolvedValueOnce(jsonResponse({ data: { image: uploaded, product: { id: 'PROD-1' } } }, 201));

    const result = await applyProductImageChanges('PROD-1', {
      deleteIds: ['IMG-OLD', 'IMG-DENIED', 'IMG-OLD'],
      files: [
        new File(['bad'], 'bad.png', { type: 'image/png' }),
        new File(['good'], 'good.png', { type: 'image/png' }),
      ],
    });

    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/products/PROD-1/images/IMG-OLD',
      '/api/products/PROD-1/images/IMG-DENIED',
      '/api/products/PROD-1/images',
      '/api/products/PROD-1/images',
    ]);
    expect(result.deletedIds).toEqual(['IMG-OLD']);
    expect(result.uploaded).toEqual([uploaded]);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map((failure) => [failure.operation, failure.subject])).toEqual([
      ['delete', 'IMG-DENIED'],
      ['upload', 'bad.png'],
    ]);
    expect(result.failures.every((failure) => failure.error instanceof ApiError)).toBe(true);
  });

  it('stops the batch when authentication expires instead of continuing under another session', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'expired' }, 401));

    await expect(applyProductImageChanges('PROD-1', {
      deleteIds: ['IMG-OLD'],
      files: [new File(['new'], 'new.png', { type: 'image/png' })],
    })).rejects.toMatchObject({ status: 401 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#/login');
  });
});
