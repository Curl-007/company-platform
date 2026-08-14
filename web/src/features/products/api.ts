import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import { ApiError, SessionSupersededError } from '../../services/api';
import type { Portfolio, Product, ProductImage, Program, StrategicGoal } from '../../types';

export function fetchProducts(): Promise<Product[]> {
  return unwrap<Product[]>('/api/products');
}

export interface CreateProductInput {
  name: string;
  owner: string;
  version?: string;
  stage?: string;
  description?: string;
  systemName?: string;
  systemVersion?: string;
  applicationVersion?: string;
  modules?: Array<{ name?: string; owner?: string; status?: string }>;
  roadmap?: Array<{ title?: string; version?: string; quarter?: string; status?: string }>;
  hardwareInfo?: Record<string, unknown>;
  systemInfo?: Record<string, unknown>;
  applicationInfo?: Record<string, unknown>;
  hardwareMetrics?: Array<{ label: string; value: string; unit?: string; status?: string }>;
  systemMetrics?: Array<{ label: string; value: string; unit?: string; status?: string }>;
  appMetrics?: Array<{ label: string; value: string; unit?: string; status?: string }>;
}

export function createProduct(input: CreateProductInput): Promise<Product> {
  return unwrapPost<Product>('/api/products', input, { invalidation: 'products' });
}

export function updateProduct(id: string, input: Partial<CreateProductInput>): Promise<Product> {
  return unwrapPatch<Product>(`/api/products/${id}`, input, { invalidation: 'products' });
}

export function deleteProduct(id: string, cascade?: boolean): Promise<void> {
  return unwrapDel(`/api/products/${id}${cascade ? '?cascade=true' : ''}`, { invalidation: 'products' });
}

export interface ProductImageUploadResult {
  image: ProductImage;
  product: Product;
}

export interface ProductImageDeletionResult {
  deleted: boolean;
  id: string;
  product: Product;
}

export interface ProductImageChanges {
  files: File[];
  deleteIds: string[];
}

export interface ProductImageChangeFailure {
  operation: 'upload' | 'delete';
  subject: string;
  error: unknown;
}

export interface ProductImageChangeResult {
  uploaded: ProductImage[];
  deletedIds: string[];
  failures: ProductImageChangeFailure[];
}

export function uploadProductImage(productId: string, file: File): Promise<ProductImageUploadResult> {
  const body = new FormData();
  body.append('file', file, file.name);
  return unwrapPost<ProductImageUploadResult>(`/api/products/${encodeURIComponent(productId)}/images`, body, {
    timeoutMs: 30_000,
    invalidation: 'products',
  });
}

export function deleteProductImage(productId: string, imageId: string): Promise<ProductImageDeletionResult> {
  return unwrapDel<ProductImageDeletionResult>(
    `/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    { invalidation: 'products' },
  );
}

export async function applyProductImageChanges(
  productId: string,
  changes: ProductImageChanges,
): Promise<ProductImageChangeResult> {
  const result: ProductImageChangeResult = { uploaded: [], deletedIds: [], failures: [] };

  const captureFailure = (failure: ProductImageChangeFailure) => {
    if (failure.error instanceof SessionSupersededError) throw failure.error;
    if (failure.error instanceof ApiError && failure.error.status === 401) throw failure.error;
    result.failures.push(failure);
  };

  for (const imageId of new Set(changes.deleteIds)) {
    try {
      const deleted = await deleteProductImage(productId, imageId);
      if (deleted.deleted) result.deletedIds.push(imageId);
    } catch (error) {
      captureFailure({ operation: 'delete', subject: imageId, error });
    }
  }

  for (const file of changes.files) {
    try {
      const uploaded = await uploadProductImage(productId, file);
      result.uploaded.push(uploaded.image);
    } catch (error) {
      captureFailure({ operation: 'upload', subject: file.name, error });
    }
  }

  return result;
}

export interface StrategyInput {
  name: string;
  owner: string;
  objective: string;
  status?: string;
  projectIds?: string[];
  productIds?: string[];
  risks?: string[];
  roadmap?: Array<{ title?: string; version?: string; quarter?: string; status?: string }>;
}

export function fetchPrograms(): Promise<Program[]> {
  return unwrap<Program[]>('/api/programs');
}

export function createProgram(input: StrategyInput): Promise<Program> {
  return unwrapPost<Program>('/api/programs', input, { invalidation: 'products' });
}

export function updateProgram(id: string, input: Partial<StrategyInput>): Promise<Program> {
  return unwrapPatch<Program>(`/api/programs/${id}`, input, { invalidation: 'products' });
}

export function deleteProgram(id: string): Promise<void> {
  return unwrapDel(`/api/programs/${id}`, { invalidation: 'products' });
}

export function fetchPortfolios(): Promise<Portfolio[]> {
  return unwrap<Portfolio[]>('/api/portfolios');
}

export function createPortfolio(input: StrategyInput): Promise<Portfolio> {
  return unwrapPost<Portfolio>('/api/portfolios', input, { invalidation: 'products' });
}

export function updatePortfolio(id: string, input: Partial<StrategyInput>): Promise<Portfolio> {
  return unwrapPatch<Portfolio>(`/api/portfolios/${id}`, input, { invalidation: 'products' });
}

export function deletePortfolio(id: string): Promise<void> {
  return unwrapDel(`/api/portfolios/${id}`, { invalidation: 'products' });
}

export interface StrategicGoalInput {
  name: string;
  owner: string;
  objective: string;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  successMetrics?: string[];
  programIds?: string[];
  portfolioIds?: string[];
}

export function fetchStrategicGoals(): Promise<StrategicGoal[]> {
  return unwrap<StrategicGoal[]>('/api/strategic-goals');
}

export function createStrategicGoal(input: StrategicGoalInput): Promise<StrategicGoal> {
  return unwrapPost<StrategicGoal>('/api/strategic-goals', input, { invalidation: 'products' });
}

export function updateStrategicGoal(id: string, input: Partial<StrategicGoalInput>): Promise<StrategicGoal> {
  return unwrapPatch<StrategicGoal>(`/api/strategic-goals/${id}`, input, { invalidation: 'products' });
}

export function deleteStrategicGoal(id: string): Promise<void> {
  return unwrapDel(`/api/strategic-goals/${id}`, { invalidation: 'products' });
}
