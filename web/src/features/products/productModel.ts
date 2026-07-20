import type { Portfolio, Product, ProductMetric, ProductModule, Program, RoadmapItem } from '../../types';
import { PROJECT_STATUS_LABELS, ROADMAP_STATUS_LABELS } from '../../constants/enums';

export type DetailItem = { key: string; value: string };
export type StrategyKind = 'program' | 'portfolio';
export type StrategyRecord = Program | Portfolio;

export const EMPTY_DETAIL: DetailItem = { key: '', value: '' };
export const EMPTY_MODULE: ProductModule = { name: '', owner: '', status: 'planned' };
export const EMPTY_METRIC: ProductMetric = { label: '', value: '', unit: '', status: 'planned' };
export const EMPTY_ROADMAP: RoadmapItem = { title: '', version: '', quarter: '', status: 'planned' };
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_COUNT = 6;
export const PRODUCT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export const GOAL_STATUS_LABELS: Record<string, string> = {
  draft: '草稿', active: '推进中', on_hold: '暂停', achieved: '已达成', closed: '已关闭',
};

export function toDetailItems(record?: Record<string, unknown>): DetailItem[] {
  const entries = Object.entries(record ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return entries.length ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ ...EMPTY_DETAIL }];
}

export function toModules(modules?: ProductModule[]): ProductModule[] {
  return modules?.length ? modules.map((item) => ({ name: item.name ?? '', owner: item.owner ?? '', status: item.status ?? 'planned' })) : [{ ...EMPTY_MODULE }];
}

export function toMetrics(metrics?: ProductMetric[]): ProductMetric[] {
  return metrics?.length ? metrics.map((item) => ({ label: item.label ?? '', value: item.value ?? '', unit: item.unit ?? '', status: item.status ?? 'planned' })) : [{ ...EMPTY_METRIC }];
}

export function toRoadmap(items?: RoadmapItem[]): RoadmapItem[] {
  return items?.length
    ? items.map((item) => ({ title: item.title ?? '', version: item.version ?? '', quarter: item.quarter ?? '', status: item.status ?? 'planned' }))
    : [{ ...EMPTY_ROADMAP }];
}

export function sanitizeDetailItems(items: DetailItem[]): Record<string, string> {
  return items.reduce<Record<string, string>>((acc, item) => {
    const key = item.key.trim();
    const value = item.value.trim();
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

export function sanitizeModules(items: ProductModule[]): ProductModule[] {
  return items
    .map((item) => ({
      name: String(item.name ?? '').trim(),
      owner: String(item.owner ?? '').trim(),
      status: String(item.status ?? 'planned'),
    }))
    .filter((item) => item.name);
}

export function sanitizeMetrics(items: ProductMetric[]): ProductMetric[] {
  return items
    .map((item) => ({
      label: item.label.trim(),
      value: item.value.trim(),
      unit: item.unit?.trim(),
      status: item.status?.trim(),
    }))
    .filter((item) => item.label && item.value);
}

export function sanitizeRoadmap(items: RoadmapItem[]): RoadmapItem[] {
  return items
    .map((item) => ({
      title: String(item.title ?? '').trim(),
      version: String(item.version ?? '').trim(),
      quarter: String(item.quarter ?? '').trim(),
      status: String(item.status ?? 'planned'),
    }))
    .filter((item) => item.title || item.version || item.quarter);
}

export function productImages(product?: Product | null): string[] {
  const values = product?.imageUrls?.length ? product.imageUrls : product?.imageUrl ? [product.imageUrl] : [];
  return values
    .map((item) => String(item || '').trim())
    .filter((item) => item && !/^https?:\/\/(?:www\.)?example\.com\//i.test(item));
}

export function currentProductImage(product?: Product | null) {
  return productImages(product)[0] || '';
}

export function allProductMetrics(product?: Product | null): ProductMetric[] {
  if (!product) return [];
  return [
    ...(product.hardwareMetrics ?? []),
    ...(product.systemMetrics ?? []),
    ...(product.appMetrics ?? []),
  ].filter((item) => item.label && item.value);
}

export function roadmapInProgress(product?: Product | null) {
  return (product?.roadmap ?? []).filter((item) => ['design', 'development', 'evaluating', 'planned'].includes(String(item.status || 'planned')));
}

export function productStageTone(stage: string) {
  if (['released', 'maintenance'].includes(stage)) return 'success';
  if (['development', 'mvp'].includes(stage)) return 'info';
  if (['evaluating', 'planned', 'concept', 'design'].includes(stage)) return 'warning';
  return 'neutral';
}

export function strategyStatusOptions(kind: StrategyKind) {
  return kind === 'program'
    ? Object.keys(PROJECT_STATUS_LABELS)
    : Object.keys(ROADMAP_STATUS_LABELS);
}
