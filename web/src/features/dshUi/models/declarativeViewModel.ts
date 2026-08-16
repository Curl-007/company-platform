import type { PageKey } from '../../../types';

export const DSH_VIEW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
export const DSH_SURFACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
export const DSH_MAX_VIEWS = 32;
export const DSH_MAX_BLOCKS = 48;

const MAX_SHORT_TEXT = 160;
const MAX_LONG_TEXT = 4_000;
const MAX_LIST_ITEMS = 100;
const MAX_TABLE_COLUMNS = 12;
const MAX_TABLE_ROWS = 200;
const MAX_LINKS = 24;

/**
 * Internal navigation targets available to the declarative renderer. There is
 * deliberately no URL field in the DSL; adding a page requires a typed code
 * change here and in the page registry.
 */
export const DSH_LINK_PAGE_KEYS = [
  'dashboard',
  'projects',
  'products',
  'team',
  'teamlogs',
  'capacity',
  'requirements',
  'testing',
  'documents',
  'ai',
  'reports',
  'flow',
  'dynamic',
  'delivery',
  'builds',
  'releases',
  'mywork',
  'settings',
  'dsh-ui',
] as const satisfies readonly PageKey[];

export type DshLinkPageKey = (typeof DSH_LINK_PAGE_KEYS)[number];
export type DshSurfaceVariant = 'default' | 'quiet' | 'contrast';
export type DshNoticeTone = 'info' | 'success' | 'warning' | 'danger';
export type DshStatTone = 'default' | 'positive' | 'warning' | 'negative';
export type DshCellValue = string | number | boolean | null;

export interface DshSurfaceStyle {
  variant: DshSurfaceVariant;
  columns: 1 | 2 | 3;
  gap: number;
}

export const DEFAULT_DSH_SURFACE_STYLE: DshSurfaceStyle = {
  variant: 'default',
  columns: 2,
  gap: 16,
};

interface DshBlockBase {
  id: string;
  title?: string;
}

export interface DshStatBlock extends DshBlockBase {
  type: 'stat';
  label: string;
  value: string | number;
  detail?: string;
  tone?: DshStatTone;
}

export interface DshTextBlock extends DshBlockBase {
  type: 'text';
  text: string;
}

export interface DshListBlock extends DshBlockBase {
  type: 'list';
  items: string[];
  ordered?: boolean;
}

export interface DshTableColumn {
  key: string;
  label: string;
}

export interface DshTableBlock extends DshBlockBase {
  type: 'table';
  columns: DshTableColumn[];
  rows: Array<Record<string, DshCellValue>>;
}

export interface DshProgressBlock extends DshBlockBase {
  type: 'progress';
  label: string;
  value: number;
  detail?: string;
}

export interface DshNoticeBlock extends DshBlockBase {
  type: 'notice';
  text: string;
  tone?: DshNoticeTone;
}

export interface DshPageLink {
  label: string;
  page: DshLinkPageKey;
}

export interface DshLinksBlock extends DshBlockBase {
  type: 'links';
  items: DshPageLink[];
}

export type DshViewBlock =
  | DshStatBlock
  | DshTextBlock
  | DshListBlock
  | DshTableBlock
  | DshProgressBlock
  | DshNoticeBlock
  | DshLinksBlock;

export interface DshDeclarativeView {
  id: string;
  title: string;
  description?: string;
  /** Stable target for layout and surfaceStyle directives. */
  surface: string;
  blocks: DshViewBlock[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allow = new Set(allowed);
  return Object.keys(value).every((key) => allow.has(key));
}

function parseText(value: unknown, maxLength: number, allowEmpty = false): string | null {
  if (typeof value !== 'string' || value.length > maxLength) return null;
  const text = value.trim();
  if (!allowEmpty && !text) return null;
  return text;
}

function parseOptionalText(value: unknown, maxLength: number): string | undefined | null {
  if (value === undefined) return undefined;
  return parseText(value, maxLength);
}

export function parseDshViewId(value: unknown): string | null {
  const id = parseText(value, 64);
  return id && DSH_VIEW_ID_PATTERN.test(id) ? id : null;
}

export function parseDshSurfaceId(value: unknown): string | null {
  const surface = parseText(value, 80);
  return surface && DSH_SURFACE_ID_PATTERN.test(surface) ? surface : null;
}

export function parseDshSectionOrder(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const parsed = value.map(parseDshViewId);
  if (parsed.some((id) => id === null)) return null;
  const order = parsed as string[];
  return new Set(order).size === order.length ? order : null;
}

export function parseDshSurfaceStyle(value: unknown): DshSurfaceStyle | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['variant', 'columns', 'gap'])) return null;
  const variant = value.variant;
  const columns = value.columns;
  const gap = value.gap;
  if (variant !== 'default' && variant !== 'quiet' && variant !== 'contrast') return null;
  if (columns !== 1 && columns !== 2 && columns !== 3) return null;
  if (typeof gap !== 'number' || !Number.isInteger(gap) || gap < 8 || gap > 32) return null;
  return { variant, columns, gap };
}

function parseBase(
  value: Record<string, unknown>,
  allowed: readonly string[],
): { id: string; title?: string } | null {
  if (!hasOnlyKeys(value, allowed)) return null;
  const id = parseDshViewId(value.id);
  const title = parseOptionalText(value.title, MAX_SHORT_TEXT);
  if (!id || title === null) return null;
  return title === undefined ? { id } : { id, title };
}

function parseCell(value: unknown): DshCellValue | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= MAX_SHORT_TEXT) return value;
  return undefined;
}

function parseBlock(value: unknown): DshViewBlock | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'stat': {
      const base = parseBase(value, ['type', 'id', 'title', 'label', 'value', 'detail', 'tone']);
      const label = parseText(value.label, MAX_SHORT_TEXT);
      const detail = parseOptionalText(value.detail, MAX_LONG_TEXT);
      const statValue = value.value;
      const tone = value.tone;
      if (!base || !label || detail === null) return null;
      if (!((typeof statValue === 'string' && statValue.length <= MAX_SHORT_TEXT)
        || (typeof statValue === 'number' && Number.isFinite(statValue)))) return null;
      if (tone !== undefined && tone !== 'default' && tone !== 'positive' && tone !== 'warning' && tone !== 'negative') return null;
      return { ...base, type: 'stat', label, value: statValue, ...(detail === undefined ? {} : { detail }), ...(tone === undefined ? {} : { tone }) };
    }
    case 'text': {
      const base = parseBase(value, ['type', 'id', 'title', 'text']);
      const text = parseText(value.text, MAX_LONG_TEXT);
      return base && text ? { ...base, type: 'text', text } : null;
    }
    case 'list': {
      const base = parseBase(value, ['type', 'id', 'title', 'items', 'ordered']);
      if (!base || !Array.isArray(value.items) || value.items.length > MAX_LIST_ITEMS) return null;
      const items = value.items.map((item) => parseText(item, MAX_LONG_TEXT));
      if (items.some((item) => item === null) || (value.ordered !== undefined && typeof value.ordered !== 'boolean')) return null;
      return { ...base, type: 'list', items: items as string[], ...(value.ordered === undefined ? {} : { ordered: value.ordered }) };
    }
    case 'table': {
      const base = parseBase(value, ['type', 'id', 'title', 'columns', 'rows']);
      if (!base || !Array.isArray(value.columns) || !value.columns.length || value.columns.length > MAX_TABLE_COLUMNS) return null;
      if (!Array.isArray(value.rows) || value.rows.length > MAX_TABLE_ROWS) return null;
      const columns: DshTableColumn[] = [];
      const columnKeys = new Set<string>();
      for (const rawColumn of value.columns) {
        if (!isRecord(rawColumn) || !hasOnlyKeys(rawColumn, ['key', 'label'])) return null;
        const key = parseDshViewId(rawColumn.key);
        const label = parseText(rawColumn.label, MAX_SHORT_TEXT);
        if (!key || !label || columnKeys.has(key)) return null;
        columnKeys.add(key);
        columns.push({ key, label });
      }
      const rows: Array<Record<string, DshCellValue>> = [];
      for (const rawRow of value.rows) {
        if (!isRecord(rawRow) || Object.keys(rawRow).some((key) => !columnKeys.has(key))) return null;
        const row: Record<string, DshCellValue> = {};
        for (const column of columns) {
          const cell = Object.prototype.hasOwnProperty.call(rawRow, column.key)
            ? parseCell(rawRow[column.key])
            : null;
          if (cell === undefined) return null;
          row[column.key] = cell;
        }
        rows.push(row);
      }
      return { ...base, type: 'table', columns, rows };
    }
    case 'progress': {
      const base = parseBase(value, ['type', 'id', 'title', 'label', 'value', 'detail']);
      const label = parseText(value.label, MAX_SHORT_TEXT);
      const detail = parseOptionalText(value.detail, MAX_LONG_TEXT);
      if (!base || !label || detail === null || typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < 0 || value.value > 100) return null;
      return { ...base, type: 'progress', label, value: value.value, ...(detail === undefined ? {} : { detail }) };
    }
    case 'notice': {
      const base = parseBase(value, ['type', 'id', 'title', 'text', 'tone']);
      const text = parseText(value.text, MAX_LONG_TEXT);
      const tone = value.tone;
      if (!base || !text) return null;
      if (tone !== undefined && tone !== 'info' && tone !== 'success' && tone !== 'warning' && tone !== 'danger') return null;
      return { ...base, type: 'notice', text, ...(tone === undefined ? {} : { tone }) };
    }
    case 'links': {
      const base = parseBase(value, ['type', 'id', 'title', 'items']);
      if (!base || !Array.isArray(value.items) || value.items.length > MAX_LINKS) return null;
      const items: DshPageLink[] = [];
      for (const rawItem of value.items) {
        if (!isRecord(rawItem) || !hasOnlyKeys(rawItem, ['label', 'page'])) return null;
        const label = parseText(rawItem.label, MAX_SHORT_TEXT);
        if (!label || !DSH_LINK_PAGE_KEYS.includes(rawItem.page as DshLinkPageKey)) return null;
        items.push({ label, page: rawItem.page as DshLinkPageKey });
      }
      return { ...base, type: 'links', items };
    }
    default:
      return null;
  }
}

/** Parse and rebuild a view from a strict, finite JSON-only whitelist. */
export function parseDshDeclarativeView(value: unknown): DshDeclarativeView | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'title', 'description', 'surface', 'blocks'])) return null;
  const id = parseDshViewId(value.id);
  const title = parseText(value.title, MAX_SHORT_TEXT);
  const description = parseOptionalText(value.description, MAX_LONG_TEXT);
  if (!id || !title || description === null || !Array.isArray(value.blocks) || value.blocks.length > DSH_MAX_BLOCKS) return null;
  const surface = value.surface === undefined ? `dsh-view:${id}` : parseDshSurfaceId(value.surface);
  if (!surface) return null;
  const blocks = value.blocks.map(parseBlock);
  if (blocks.some((block) => block === null)) return null;
  const parsedBlocks = blocks as DshViewBlock[];
  if (new Set(parsedBlocks.map((block) => block.id)).size !== parsedBlocks.length) return null;
  return { id, title, ...(description === undefined ? {} : { description }), surface, blocks: parsedBlocks };
}
