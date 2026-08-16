import {
  Children,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSessionUser } from '../../services/auth';
import { subscribeToUiCommands } from '../../features/ai/uiCommandBus';
import { setDshLayout } from '../../features/dshUi/store/dshUiStore';

const STORAGE_VERSION = 'v1';

export interface SortableSectionDefinition {
  /** Stable, page-local identifier exposed to the DSH layout directive. */
  id: string;
  /** Human-readable name used by the drag handle and announcements. */
  label: string;
  content: ReactNode;
  /** Applied to the sortable wrapper, for example a two-column `wide` item. */
  className?: string;
}

interface SortableSectionLayoutProps {
  /** Stable DSH surface key, shared by every entity rendered on this page. */
  surface: string;
  sections?: SortableSectionDefinition[];
  children?: ReactNode;
  className?: string;
  /** Defaults to the authenticated session user. Null disables persistence. */
  userId?: string | null;
}

interface SortableSectionProps extends Omit<SortableSectionDefinition, 'content'> {
  children: ReactNode;
}

/** Declarative child form used by detail pages to keep their JSX readable. */
export function SortableSection({ children }: SortableSectionProps) {
  return <>{children}</>;
}

interface LayoutDirective {
  kind: 'layout';
  surface: string;
  order: string[];
}

function isLayoutDirective(value: unknown): value is LayoutDirective {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LayoutDirective>;
  return candidate.kind === 'layout'
    && typeof candidate.surface === 'string'
    && Array.isArray(candidate.order)
    && candidate.order.every((id) => typeof id === 'string');
}

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return ids.reduce<string[]>((result, rawId) => {
    const id = rawId.trim();
    if (!id || seen.has(id)) return result;
    seen.add(id);
    result.push(id);
    return result;
  }, []);
}

/** Unknown and duplicate IDs are ignored; newly added sections append safely. */
export function reconcileSectionOrder(order: readonly string[], availableIds: readonly string[]): string[] {
  const available = uniqueIds(availableIds);
  const allowed = new Set(available);
  const known = uniqueIds(order).filter((id) => allowed.has(id));
  const included = new Set(known);
  return [...known, ...available.filter((id) => !included.has(id))];
}

export function detailLayoutStorageKey(surface: string, userId: string | null | undefined): string | null {
  const normalizedSurface = surface.trim();
  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedSurface || !normalizedUserId) return null;
  return `dsh-detail-layout:${STORAGE_VERSION}:${encodeURIComponent(normalizedUserId)}:${encodeURIComponent(normalizedSurface)}`;
}

function readStoredOrder(key: string | null, availableIds: readonly string[]): string[] {
  if (!key || typeof window === 'undefined') return reconcileSectionOrder([], availableIds);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return reconcileSectionOrder(Array.isArray(parsed) ? parsed : [], availableIds);
  } catch {
    return reconcileSectionOrder([], availableIds);
  }
}

function writeStoredOrder(key: string | null, order: readonly string[]): void {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(uniqueIds(order)));
  } catch {
    // Layout customization is progressive enhancement; storage failures must
    // not make a detail page unusable.
  }
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function languageText(language: string | undefined) {
  const chinese = String(language ?? '').toLowerCase().startsWith('zh');
  return chinese
    ? {
        region: '可排序详情区块',
        drag: (label: string) => `拖拽“${label}”调整位置；方向键也可移动`,
        up: (label: string) => `上移“${label}”`,
        down: (label: string) => `下移“${label}”`,
        reset: '重置区块布局',
        edit: '调整区块布局',
        done: '完成布局调整',
        moved: (label: string, position: number, total: number) => `${label}已移动到第${position}位，共${total}个区块`,
        resetDone: '区块布局已重置',
      }
    : {
        region: 'Sortable detail sections',
        drag: (label: string) => `Drag ${label} to reorder; arrow keys also move it`,
        up: (label: string) => `Move ${label} up`,
        down: (label: string) => `Move ${label} down`,
        reset: 'Reset section layout',
        edit: 'Arrange sections',
        done: 'Finish arranging sections',
        moved: (label: string, position: number, total: number) => `${label} moved to position ${position} of ${total}`,
        resetDone: 'Section layout reset',
      };
}

export default function SortableSectionLayout({
  surface,
  sections,
  children,
  className = '',
  userId,
}: SortableSectionLayoutProps) {
  const { i18n } = useTranslation();
  const resolvedUserId = userId === undefined ? getSessionUser()?.id : userId;
  const storageKey = detailLayoutStorageKey(surface, resolvedUserId);
  const sourceSections = useMemo(() => {
    if (sections?.length) return sections;
    return Children.toArray(children).flatMap((child) => {
      if (!isValidElement<SortableSectionProps>(child) || child.type !== SortableSection) return [];
      return [{
        id: child.props.id,
        label: child.props.label,
        className: child.props.className,
        content: child.props.children,
      }];
    });
  }, [children, sections]);
  const validSections = useMemo(() => {
    const seen = new Set<string>();
    return sourceSections.filter((section) => {
      const id = section.id.trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [sourceSections]);
  const sectionIds = validSections.map((section) => section.id.trim());
  const sectionSignature = sectionIds.join('\u001f');
  const [storedState, setStoredState] = useState(() => ({
    key: storageKey,
    order: readStoredOrder(storageKey, sectionIds),
  }));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const text = useMemo(() => languageText(i18n.resolvedLanguage || i18n.language), [i18n.language, i18n.resolvedLanguage]);

  const order = storedState.key === storageKey
    ? reconcileSectionOrder(storedState.order, sectionIds)
    : readStoredOrder(storageKey, sectionIds);

  useEffect(() => {
    setStoredState((current) => {
      const next = current.key === storageKey
        ? reconcileSectionOrder(current.order, sectionIds)
        : readStoredOrder(storageKey, sectionIds);
      if (current.key === storageKey && sameOrder(current.order, next)) return current;
      return { key: storageKey, order: next };
    });
  }, [storageKey, sectionSignature]);

  const applyOrder = useCallback((requestedOrder: readonly string[], announceId?: string, syncDsh = false) => {
    const next = reconcileSectionOrder(requestedOrder, sectionIds);
    setStoredState({ key: storageKey, order: next });
    writeStoredOrder(storageKey, next);
    if (syncDsh && resolvedUserId) setDshLayout(resolvedUserId, surface, next);
    if (announceId) {
      const section = validSections.find((item) => item.id.trim() === announceId);
      const index = next.indexOf(announceId);
      if (section && index >= 0) setAnnouncement(text.moved(section.label, index + 1, next.length));
    }
  }, [resolvedUserId, sectionSignature, storageKey, surface, text, validSections]);

  useEffect(() => subscribeToUiCommands(({ detail }) => {
    const directive: unknown = detail.directive;
    if (!isLayoutDirective(directive) || directive.surface !== surface) return;
    applyOrder(directive.order);
  }), [applyOrder, surface]);

  function moveTo(id: string, targetIndex: number) {
    const from = order.indexOf(id);
    const boundedTarget = Math.max(0, Math.min(order.length - 1, targetIndex));
    if (from < 0 || from === boundedTarget) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(boundedTarget, 0, id);
    applyOrder(next, id, true);
  }

  function handleDrop(targetId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const sourceId = draggedId || event.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetId && order.includes(sourceId)) {
      moveTo(sourceId, order.indexOf(targetId));
    }
    setDraggedId(null);
    setDropTargetId(null);
  }

  function handleGripKeyDown(id: string, event: KeyboardEvent<HTMLButtonElement>) {
    const index = order.indexOf(id);
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      moveTo(id, index - 1);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      moveTo(id, index + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTo(id, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTo(id, order.length - 1);
    }
  }

  const sectionById = new Map(validSections.map((section) => [section.id.trim(), section]));
  const isCustomized = !sameOrder(order, sectionIds);

  return (
    <div
      className={`sortable-section-layout${isEditing ? ' is-layout-editing' : ''} ${className}`.trim()}
      data-layout-surface={surface}
      aria-label={text.region}
    >
      <div className="sortable-section-layout-tools">
        <button
          type="button"
          className="sortable-section-edit"
          onClick={() => setIsEditing((current) => !current)}
          aria-label={isEditing ? text.done : text.edit}
          aria-pressed={isEditing}
          title={isEditing ? text.done : text.edit}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="sortable-section-reset"
          onClick={() => {
            applyOrder(sectionIds, undefined, true);
            setAnnouncement(text.resetDone);
          }}
          disabled={!isCustomized}
          aria-label={text.reset}
          title={text.reset}
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      </div>
      {order.map((id, index) => {
        const section = sectionById.get(id);
        if (!section) return null;
        return (
          <div
            key={id}
            className={`sortable-section ${section.className ?? ''}${draggedId === id ? ' is-dragging' : ''}${dropTargetId === id ? ' is-drop-target' : ''}`.trim()}
            data-layout-section-id={id}
            onDragOver={(event) => {
              if (!draggedId || draggedId === id) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropTargetId(id);
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTargetId(null);
            }}
            onDrop={(event) => handleDrop(id, event)}
          >
            {isEditing ? <div className="sortable-section-controls">
              <button
                type="button"
                className="sortable-section-handle"
                draggable
                aria-label={text.drag(section.label)}
                title={text.drag(section.label)}
                onKeyDown={(event) => handleGripKeyDown(id, event)}
                onDragStart={(event) => {
                  setDraggedId(id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropTargetId(null);
                }}
              >
                <GripVertical size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sortable-section-move"
                onClick={() => moveTo(id, index - 1)}
                disabled={index === 0}
                aria-label={text.up(section.label)}
                title={text.up(section.label)}
              >
                <ArrowUp size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="sortable-section-move"
                onClick={() => moveTo(id, index + 1)}
                disabled={index === order.length - 1}
                aria-label={text.down(section.label)}
                title={text.down(section.label)}
              >
                <ArrowDown size={13} aria-hidden="true" />
              </button>
            </div> : null}
            {section.content}
          </div>
        );
      })}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    </div>
  );
}
