import {
  DSH_MAX_VIEWS,
  parseDshDeclarativeView,
  parseDshSectionOrder,
  parseDshSurfaceId,
  parseDshSurfaceStyle,
  parseDshViewId,
  type DshDeclarativeView,
  type DshSurfaceStyle,
} from '../models/declarativeViewModel';

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'dsh-ui:v1';
const MAX_SURFACE_SETTINGS = 64;

export const DSH_UI_STORE_EVENT = 'dsh-ui:store-change' as const;

export interface DshSurfaceStyleEntry {
  surface: string;
  style: DshSurfaceStyle;
}

export interface DshLayoutEntry {
  surface: string;
  order: string[];
}

export interface DshUiState {
  views: DshDeclarativeView[];
  activeViewId: string | null;
  surfaceStyles: DshSurfaceStyleEntry[];
  layouts: DshLayoutEntry[];
}

interface PersistedDshUiState extends DshUiState {
  version: typeof STORAGE_VERSION;
}

interface StoreChangeDetail {
  userId: string;
}

const EMPTY_STATE: DshUiState = {
  views: [],
  activeViewId: null,
  surfaceStyles: [],
  layouts: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeUserId(userId: string | null | undefined): string | null {
  const normalized = String(userId ?? '').trim();
  return normalized || null;
}

export function dshUiStorageKey(userId: string | null | undefined): string | null {
  const normalized = normalizeUserId(userId);
  return normalized ? `${STORAGE_PREFIX}:${encodeURIComponent(normalized)}` : null;
}

function uniqueByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const result = new Map<string, T>();
  for (const item of items) result.set(getKey(item), item);
  return Array.from(result.values());
}

function parseState(value: unknown): DshUiState {
  if (!isRecord(value) || value.version !== STORAGE_VERSION) return { ...EMPTY_STATE };

  const parsedViews = Array.isArray(value.views)
    ? value.views.map(parseDshDeclarativeView).filter((view): view is DshDeclarativeView => Boolean(view))
    : [];
  const views = uniqueByKey(parsedViews, (view) => view.id).slice(-DSH_MAX_VIEWS);

  const surfaceStyles: DshSurfaceStyleEntry[] = [];
  if (Array.isArray(value.surfaceStyles)) {
    for (const rawEntry of value.surfaceStyles.slice(-MAX_SURFACE_SETTINGS)) {
      if (!isRecord(rawEntry)) continue;
      const surface = parseDshSurfaceId(rawEntry.surface);
      const style = parseDshSurfaceStyle(rawEntry.style);
      if (surface && style) surfaceStyles.push({ surface, style });
    }
  }

  const layouts: DshLayoutEntry[] = [];
  if (Array.isArray(value.layouts)) {
    for (const rawEntry of value.layouts.slice(-MAX_SURFACE_SETTINGS)) {
      if (!isRecord(rawEntry)) continue;
      const surface = parseDshSurfaceId(rawEntry.surface);
      const order = parseDshSectionOrder(rawEntry.order);
      if (surface && order) layouts.push({ surface, order });
    }
  }

  const requestedActive = parseDshViewId(value.activeViewId);
  const activeViewId = requestedActive && views.some((view) => view.id === requestedActive)
    ? requestedActive
    : (views[0]?.id ?? null);

  return {
    views,
    activeViewId,
    surfaceStyles: uniqueByKey(surfaceStyles, (entry) => entry.surface),
    layouts: uniqueByKey(layouts, (entry) => entry.surface),
  };
}

export function readDshUiState(userId: string | null | undefined): DshUiState {
  const key = dshUiStorageKey(userId);
  if (!key || typeof window === 'undefined') return { ...EMPTY_STATE };
  try {
    return parseState(JSON.parse(window.localStorage.getItem(key) ?? 'null'));
  } catch {
    return { ...EMPTY_STATE };
  }
}

function notifyStoreChange(userId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StoreChangeDetail>(DSH_UI_STORE_EVENT, {
    detail: { userId },
  }));
}

function writeDshUiState(userId: string | null | undefined, state: DshUiState): boolean {
  const normalizedUserId = normalizeUserId(userId);
  const key = dshUiStorageKey(normalizedUserId);
  if (!normalizedUserId || !key || typeof window === 'undefined') return false;
  const payload: PersistedDshUiState = { version: STORAGE_VERSION, ...state };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
    notifyStoreChange(normalizedUserId);
    return true;
  } catch {
    return false;
  }
}

export function subscribeDshUiStore(
  userId: string | null | undefined,
  listener: () => void,
): () => void {
  const normalizedUserId = normalizeUserId(userId);
  const key = dshUiStorageKey(normalizedUserId);
  if (!normalizedUserId || !key || typeof window === 'undefined') return () => undefined;

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<StoreChangeDetail>).detail;
    if (detail?.userId === normalizedUserId) listener();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) listener();
  };
  window.addEventListener(DSH_UI_STORE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(DSH_UI_STORE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}

export function upsertDshView(userId: string | null | undefined, view: DshDeclarativeView): boolean {
  const parsed = parseDshDeclarativeView(view);
  if (!parsed) return false;
  const current = readDshUiState(userId);
  const existing = current.views.findIndex((item) => item.id === parsed.id);
  if (existing < 0 && current.views.length >= DSH_MAX_VIEWS) return false;
  const views = [...current.views];
  if (existing >= 0) views[existing] = parsed;
  else views.push(parsed);
  return writeDshUiState(userId, {
    ...current,
    views,
    activeViewId: current.activeViewId ?? parsed.id,
  });
}

export function removeDshView(userId: string | null | undefined, viewId: string): boolean {
  const parsedId = parseDshViewId(viewId);
  if (!parsedId) return false;
  const current = readDshUiState(userId);
  const views = current.views.filter((view) => view.id !== parsedId);
  if (views.length === current.views.length) return true;
  return writeDshUiState(userId, {
    ...current,
    views,
    activeViewId: current.activeViewId === parsedId ? (views[0]?.id ?? null) : current.activeViewId,
  });
}

export function openDshView(userId: string | null | undefined, viewId: string): boolean {
  const parsedId = parseDshViewId(viewId);
  if (!parsedId) return false;
  const current = readDshUiState(userId);
  if (!current.views.some((view) => view.id === parsedId)) return false;
  if (current.activeViewId === parsedId) return true;
  return writeDshUiState(userId, { ...current, activeViewId: parsedId });
}

export function setDshSurfaceStyle(
  userId: string | null | undefined,
  surface: string,
  style: DshSurfaceStyle,
): boolean {
  const parsedSurface = parseDshSurfaceId(surface);
  const parsedStyle = parseDshSurfaceStyle(style);
  if (!parsedSurface || !parsedStyle) return false;
  const current = readDshUiState(userId);
  const remaining = current.surfaceStyles.filter((entry) => entry.surface !== parsedSurface);
  const surfaceStyles = [...remaining, { surface: parsedSurface, style: parsedStyle }].slice(-MAX_SURFACE_SETTINGS);
  return writeDshUiState(userId, { ...current, surfaceStyles });
}

export function setDshLayout(
  userId: string | null | undefined,
  surface: string,
  order: string[],
): boolean {
  const parsedSurface = parseDshSurfaceId(surface);
  const parsedOrder = parseDshSectionOrder(order);
  if (!parsedSurface || !parsedOrder) return false;
  const current = readDshUiState(userId);
  const remaining = current.layouts.filter((entry) => entry.surface !== parsedSurface);
  const layouts = [...remaining, { surface: parsedSurface, order: parsedOrder }].slice(-MAX_SURFACE_SETTINGS);
  return writeDshUiState(userId, { ...current, layouts });
}
