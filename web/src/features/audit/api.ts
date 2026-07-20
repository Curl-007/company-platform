import { buildQuery, unwrap, unwrapPost } from '../../services/apiClient';
import type { AuditLogRecord } from '../../types';

export interface AuditLogFilters {
  keyword?: string;
  actor?: string;
  action?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  includePageViews?: string;
}

export function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogRecord[]> {
  return unwrap<Array<Record<string, unknown>>>(`/api/audit-logs${buildQuery(filters as Record<string, string | undefined>)}`).then((items) =>
    items.map((item) => ({
      id: String(item.id ?? ''),
      actorId: item.actorId != null ? String(item.actorId) : item.actor_id != null ? String(item.actor_id) : null,
      actorName: String(item.actorName ?? item.actor_name ?? ''),
      action: String(item.action ?? ''),
      resourceType: String(item.resourceType ?? item.resource_type ?? ''),
      resourceId: item.resourceId != null ? String(item.resourceId) : item.resource_id != null ? String(item.resource_id) : null,
      createdAt: String(item.createdAt ?? item.created_at ?? ''),
      before: item.before,
      after: item.after,
    })),
  );
}

export function trackPageView(page: string, pageTitle?: string): Promise<{ page: string; pageTitle: string }> {
  return unwrapPost<{ page: string; pageTitle: string }>('/api/activity/page-view', { page, pageTitle }, { invalidateCache: false });
}
