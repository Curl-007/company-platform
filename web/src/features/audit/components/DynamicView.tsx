import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, AlertTriangle, Clock3, ExternalLink, Eye, Radar, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { fetchAuditLogs, type AuditLogFilters } from '../api';
import { useAsync } from '../../../hooks/useAsync';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import FilterBar from '../../../components/common/FilterBar';
import MetricStrip from '../../../components/common/MetricStrip';
import type { AuditLogRecord } from '../../../types';
import { isSameBusinessDay } from '../../../utils/businessDate';
import DiffView from './DiffView';
import {
  CATEGORY_META,
  createEntry,
  dateRangeFor,
  formatTime,
  getResourceTarget,
  getRoleLabel,
  openResource,
  shouldShowDiff,
  type TimeRange,
} from './dynamicMeta';

export default function DynamicView() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [includePageViews, setIncludePageViews] = useState(false);
  const [importantOnly, setImportantOnly] = useState(false);
  const serverFilters = useMemo<AuditLogFilters>(() => ({
    ...dateRangeFor(timeRange),
    resourceType: resourceTypeFilter === 'all' ? undefined : resourceTypeFilter,
    action: actionFilter === 'all' ? undefined : actionFilter,
    includePageViews: includePageViews ? '1' : undefined,
  }), [actionFilter, includePageViews, resourceTypeFilter, timeRange]);
  const { data, loading, error, reload } = useAsync<AuditLogRecord[]>(
    () => fetchAuditLogs(serverFilters),
    [serverFilters.dateFrom ?? '', serverFilters.dateTo ?? '', serverFilters.resourceType ?? '', serverFilters.action ?? '', serverFilters.includePageViews ?? ''],
    { cacheKey: 'audit:logs' },
  );

  const timeline = useMemo(
    () => (data ?? []).map(createEntry),
    [data],
  );

  const filteredTimeline = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return timeline.filter((item) => {
      const roleLabel = getRoleLabel(item.record);
      if (roleFilter !== 'all' && roleLabel !== roleFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (importantOnly && !item.isImportant) return false;
      if (!text) return true;
      const searchText = [
        item.title,
        item.detail,
        item.resourceLabel,
        item.actionLabel,
        item.record.actorName,
        roleLabel,
      ].join(' ').toLowerCase();
      return searchText.includes(text);
    });
  }, [categoryFilter, importantOnly, keyword, roleFilter, timeline]);

  const stats = useMemo(() => {
    const now = new Date();
    const importantCount = timeline.filter((item) => item.isImportant).length;
    const loginCount = timeline.filter((item) => item.category === 'auth').length;
    const changeCount = timeline.filter((item) => shouldShowDiff(item.record)).length;
    const riskCount = timeline.filter((item) => ['risk', 'blocked'].includes(item.categoryVariant)).length;
    const todayCount = timeline.filter((item) => isSameBusinessDay(new Date(item.record.createdAt), now)).length;
    return { importantCount, loginCount, changeCount, riskCount, todayCount };
  }, [timeline]);

  const categoryCounts = useMemo(
    () => Object.entries(CATEGORY_META).map(([key, meta]) => ({
      key,
      label: meta.label,
      variant: meta.variant,
      count: timeline.filter((item) => item.category === key).length,
    })).filter((item) => item.count > 0),
    [timeline],
  );

  const attentionQueue = useMemo(
    () => timeline.filter((item) => item.isImportant || ['risk', 'blocked'].includes(item.categoryVariant)).slice(0, 6),
    [timeline],
  );

  const roleOptions = useMemo(() => {
    const roles = Array.from(new Set(timeline.map((item) => getRoleLabel(item.record)).filter(Boolean)));
    return roles;
  }, [timeline]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <div className="stack dynamic-page">
      <div className="page-inline-actions mb-1 flex items-center justify-between gap-3">
        <p className="text-secondary text-sm m-0">{t('features.audit.dynamicView.recordCount', { count: timeline.length })}</p>
        <button className="btn btn-secondary btn-sm" onClick={reload}><RefreshCw size={14} /> {t('features.audit.dynamicView.refresh')}</button>
      </div>

      <MetricStrip
        className="dynamic-summary-grid"
        items={[
          {
            icon: <Activity size={14} />,
            label: t('features.audit.dynamicView.currentActivity'),
            value: timeline.length,
            caption: `${timeRange === 'week' ? t('features.audit.dynamicView.rangeLast7Days') : timeRange === 'today' ? t('features.audit.dynamicView.rangeToday') : t('features.audit.dynamicView.rangeAll')}${t('features.audit.dynamicView.operationTrail')}`,
            className: 'dynamic-summary-card',
          },
          {
            icon: <AlertTriangle size={14} />,
            label: t('features.audit.dynamicView.keyFocus'),
            value: stats.importantCount,
            caption: t('features.audit.dynamicView.keyFocusCaption'),
            tone: 'risk',
            className: 'dynamic-summary-card dynamic-summary-card-important',
          },
          {
            icon: <Clock3 size={14} />,
            label: t('features.audit.dynamicView.todayActivity'),
            value: stats.todayCount,
            caption: t('features.audit.dynamicView.todayActivityCaption'),
            className: 'dynamic-summary-card',
          },
          {
            icon: <Radar size={14} />,
            label: t('features.audit.dynamicView.riskSignals'),
            value: stats.riskCount,
            caption: t('features.audit.dynamicView.riskSignalsCaption'),
            className: 'dynamic-summary-card',
          },
        ]}
      />

      <div className="dynamic-workbench dynamic-command-center">
        <div className="dynamic-rail-column">
        <aside className="dynamic-rail">
          <div className="dynamic-rail-header">
            <span>{t('features.audit.dynamicView.attentionQueue')}</span>
            <strong>{attentionQueue.length}</strong>
          </div>
          {attentionQueue.length ? (
            <div className="dynamic-attention-list">
              {attentionQueue.map((item) => (
                <button key={item.record.id} className="dynamic-attention-item" onClick={() => setExpanded((prev) => new Set(prev).add(item.record.id))}>
                  <span>{item.actionLabel}</span>
                  <strong>{item.title}</strong>
                  <small>{formatTime(item.record.createdAt)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="body-text">{t('features.audit.dynamicView.noPriorityActivity')}</div>
          )}
        </aside>

        <aside className="dynamic-filter-panel">
          <div className="dynamic-filter-panel-title"><SlidersHorizontal size={15} /> {t('features.audit.dynamicView.filterStrategy')}</div>
          <div className="dynamic-filter-grid">
            <div className="form-group">
              <label className="form-label">{t('features.audit.dynamicView.timeRange')}</label>
              <select className="form-select" value={timeRange} onChange={(event) => setTimeRange(event.target.value as TimeRange)}>
                <option value="today">{t('features.audit.dynamicView.today')}</option>
                <option value="week">{t('features.audit.dynamicView.rangeLast7Days')}</option>
                <option value="all">{t('features.audit.dynamicView.all')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.audit.dynamicView.resourceType')}</label>
              <select className="form-select" value={resourceTypeFilter} onChange={(event) => setResourceTypeFilter(event.target.value)}>
                <option value="all">{t('features.audit.dynamicView.allResources')}</option>
                <option value="project">{t('features.audit.dynamicMeta.resourceType.project')}</option>
                <option value="requirement">{t('features.audit.dynamicMeta.resourceType.requirement')}</option>
                <option value="task">{t('features.audit.dynamicMeta.resourceType.task')}</option>
                <option value="defect">{t('features.audit.dynamicMeta.resourceType.defect')}</option>
                <option value="test_case">{t('features.audit.dynamicMeta.resourceType.test_case')}</option>
                <option value="document">{t('features.audit.dynamicMeta.resourceType.document')}</option>
                <option value="work_log">{t('features.audit.dynamicMeta.resourceType.work_log')}</option>
                <option value="build">{t('features.audit.dynamicMeta.resourceType.build')}</option>
                <option value="release">{t('features.audit.dynamicMeta.resourceType.release')}</option>
                <option value="user">{t('features.audit.dynamicMeta.resourceType.user')}</option>
                <option value="page">{t('features.audit.dynamicMeta.resourceType.page')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.audit.dynamicView.actionType')}</label>
              <select className="form-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">{t('features.audit.dynamicView.allActions')}</option>
                <option value="auth.">{t('features.audit.dynamicView.actionAuth')}</option>
                <option value="project.">{t('features.audit.dynamicView.actionProject')}</option>
                <option value="requirement.">{t('features.audit.dynamicView.actionRequirement')}</option>
                <option value="task.">{t('features.audit.dynamicView.actionTask')}</option>
                <option value="defect.">{t('features.audit.dynamicView.actionDefect')}</option>
                <option value="test_case.">{t('features.audit.dynamicView.actionTestCase')}</option>
                <option value="document.">{t('features.audit.dynamicView.actionDocument')}</option>
                <option value="work_log.">{t('features.audit.dynamicView.actionWorkLog')}</option>
                <option value="build.">{t('features.audit.dynamicView.actionBuild')}</option>
                <option value="release.">{t('features.audit.dynamicView.actionRelease')}</option>
                <option value="user.">{t('features.audit.dynamicView.actionUser')}</option>
              </select>
            </div>
            <label className="form-checkbox dynamic-filter-checkbox">
              <input type="checkbox" checked={includePageViews} onChange={(event) => setIncludePageViews(event.target.checked)} />
              <span>{t('features.audit.dynamicView.includePageViews')}</span>
            </label>
          </div>
          <div className="dynamic-category-dock">
            {categoryCounts.map((item) => (
              <button
                key={item.key}
                className={`dynamic-category-chip ${item.variant}${categoryFilter === item.key ? ' active' : ''}`}
                onClick={() => setCategoryFilter(item.key === categoryFilter ? 'all' : item.key)}
              >
                <span>{t(item.label)}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>
        </aside>
        </div>

        <section className="dynamic-timeline-stage">
          <div className="dynamic-stage-toolbar">
            <FilterBar
              trailing={
                <button
                  className={`btn btn-sm ${importantOnly ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setImportantOnly((value) => !value)}
                >
                  <Eye size={14} /> {importantOnly ? t('features.audit.dynamicView.onlyImportantActive') : t('features.audit.dynamicView.onlyImportant')}
                </button>
              }
            >
              <div className="input-with-icon filter-search" style={{ minHeight: 34, flex: '1 1 220px', maxWidth: 320 }}>
                <Search size={14} className="shrink-0 text-secondary" aria-hidden="true" />
                <input
                  className="form-input border-0 bg-transparent shadow-none"
                  placeholder={t('features.audit.dynamicView.searchPlaceholder')}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  aria-label={t('features.audit.dynamicView.searchAria')}
                />
              </div>
              <select className="form-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label={t('features.audit.dynamicView.role')}>
                <option value="all">{t('features.audit.dynamicView.allRoles')}</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select className="form-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label={t('features.audit.dynamicView.category')}>
                <option value="all">{t('features.audit.dynamicView.allCategories')}</option>
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <option key={key} value={key}>{t(meta.label)}</option>
                ))}
              </select>
            </FilterBar>
          </div>

          {filteredTimeline.length === 0 ? (
            <p className="body-text" style={{ margin: 0 }}>{t('features.audit.dynamicView.noMatchingRecords')}</p>
          ) : (
            <div className="timeline dynamic-timeline">
              {filteredTimeline.map((item) => {
                const isOpen = expanded.has(item.record.id);
                const roleLabel = getRoleLabel(item.record);
                const canExpand = shouldShowDiff(item.record);

                return (
                  <div key={item.record.id} className={`timeline-item dynamic-timeline-item${item.isImportant ? ' is-important' : ''}`}>
                    <div className={`timeline-dot dynamic-timeline-dot ${item.categoryVariant}`} />
                    <div className="timeline-content dynamic-timeline-content">
                      <div className="dynamic-timeline-top">
                        <div className="dynamic-timeline-heading">
                          <span className="font-medium">{item.title}</span>
                          {item.isImportant ? <span className="tag risk">{t('features.audit.dynamicView.important')}</span> : null}
                        </div>
                        <span className="text-secondary dynamic-timeline-time">{formatTime(item.record.createdAt)}</span>
                      </div>

                      <div className="dynamic-timeline-meta">
                        <StatusBadge status={item.record.action} label={item.actionLabel} showDot={false} />
                        <span className={`tag ${item.categoryVariant === 'neutral' ? '' : item.categoryVariant}`}>{item.categoryLabel}</span>
                        {roleLabel ? <span className="tag">{roleLabel}</span> : null}
                      </div>

                      <div className="body-text dynamic-timeline-detail">{item.detail}</div>
                      <div className="dynamic-timeline-footer">
                        <div className="text-secondary dynamic-timeline-resource">{t('features.audit.dynamicView.relatedResource', { resource: item.resourceLabel })}</div>
                        {getResourceTarget(item.record) ? (
                          <button className="btn btn-secondary btn-xs" onClick={() => openResource(item.record)}>
                            <ExternalLink size={12} /> {t('features.audit.dynamicView.openObject')}
                          </button>
                        ) : null}
                      </div>

                      {canExpand ? (
                        <button className="btn btn-text btn-xs" style={{ padding: '2px 0', marginTop: 8 }} onClick={() => toggle(item.record.id)}>
                          {isOpen ? t('features.audit.dynamicView.collapseChanges') : t('features.audit.dynamicView.viewChanges')}
                        </button>
                      ) : null}

                      {isOpen ? (
                        <div className="timeline-diff" style={{ marginTop: 10 }}>
                          <DiffView record={item.record} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
