import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock3, ExternalLink, Eye, Radar, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { fetchAuditLogs, type AuditLogFilters } from '../api';
import { useAsync } from '../../../hooks/useAsync';
import PageHeader from '../../../components/common/PageHeader';
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
    return (
      <div>
        <PageHeader title="动态中心" description="按时间查看谁进入了哪些页面、做了什么操作，以及关键对象发生了哪些变化。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="stack dynamic-glass-page">
      <PageHeader
        title="动态中心"
        description={`按时间倒序查看所有角色的登录、增删改、日报和文档操作，共 ${timeline.length} 条记录。`}
        actions={<button className="btn btn-secondary btn-sm" onClick={reload}><RefreshCw size={14} /> 刷新</button>}
      />

      <MetricStrip
        className="dynamic-summary-grid"
        items={[
          {
            icon: <Activity size={14} />,
            label: '当前动态',
            value: timeline.length,
            caption: `${timeRange === 'week' ? '最近 7 天' : timeRange === 'today' ? '今日范围' : '全部范围'}操作轨迹`,
            className: 'dynamic-summary-card',
          },
          {
            icon: <AlertTriangle size={14} />,
            label: '重点关注',
            value: stats.importantCount,
            caption: '登录失败、删改、状态变更',
            tone: 'risk',
            className: 'dynamic-summary-card dynamic-summary-card-important',
          },
          {
            icon: <Clock3 size={14} />,
            label: '今日动态',
            value: stats.todayCount,
            caption: '当天新增的审计记录',
            className: 'dynamic-summary-card',
          },
          {
            icon: <Radar size={14} />,
            label: '风险信号',
            value: stats.riskCount,
            caption: '账号、测试、删除、发布风险',
            className: 'dynamic-summary-card',
          },
        ]}
      />

      <div className="dynamic-workbench dynamic-command-center">
        <aside className="dynamic-rail">
          <div className="dynamic-rail-header">
            <span>待关注</span>
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
            <div className="body-text">当前范围内暂无需要优先关注的动态。</div>
          )}
        </aside>

        <section className="dynamic-timeline-stage">
          <div className="dynamic-stage-toolbar">
            <FilterBar
              label={<span className="dynamic-filter-label"><Search size={14} /> 筛选</span>}
              trailing={
                <button
                  className={`btn btn-sm ${importantOnly ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setImportantOnly((value) => !value)}
                >
                  <Eye size={14} /> {importantOnly ? '已只看重点' : '只看重点'}
                </button>
              }
            >
              <input
                className="input"
                style={{ minWidth: 220 }}
                placeholder="搜索人员、页面、对象、动作"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <select className="select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">全部角色</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <select className="select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">全部分类</option>
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <option key={key} value={key}>{meta.label}</option>
                ))}
              </select>
            </FilterBar>
          </div>

          {filteredTimeline.length === 0 ? (
            <p className="body-text" style={{ margin: 0 }}>当前筛选条件下没有匹配的动态记录。</p>
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
                          {item.isImportant ? <span className="tag risk">重点</span> : null}
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
                        <div className="text-secondary dynamic-timeline-resource">关联对象：{item.resourceLabel}</div>
                        {getResourceTarget(item.record) ? (
                          <button className="btn btn-secondary btn-xs" onClick={() => openResource(item.record)}>
                            <ExternalLink size={12} /> 打开对象
                          </button>
                        ) : null}
                      </div>

                      {canExpand ? (
                        <button className="btn btn-text btn-xs" style={{ padding: '2px 0', marginTop: 8 }} onClick={() => toggle(item.record.id)}>
                          {isOpen ? '收起变更详情' : '查看变更详情'}
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

        <aside className="dynamic-filter-panel">
          <div className="dynamic-filter-panel-title"><SlidersHorizontal size={15} /> 筛选策略</div>
          <div className="dynamic-filter-grid">
            <div className="form-group">
              <label className="form-label">时间范围</label>
              <select className="form-select" value={timeRange} onChange={(event) => setTimeRange(event.target.value as TimeRange)}>
                <option value="today">今天</option>
                <option value="week">最近 7 天</option>
                <option value="all">全部</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">资源类型</label>
              <select className="form-select" value={resourceTypeFilter} onChange={(event) => setResourceTypeFilter(event.target.value)}>
                <option value="all">全部资源</option>
                <option value="project">项目</option>
                <option value="requirement">需求</option>
                <option value="task">任务</option>
                <option value="defect">缺陷</option>
                <option value="test_case">测试用例</option>
                <option value="document">文档</option>
                <option value="work_log">日报</option>
                <option value="build">构建</option>
                <option value="release">发布</option>
                <option value="user">用户</option>
                <option value="page">页面</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">动作类型</label>
              <select className="form-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                <option value="all">全部动作</option>
                <option value="auth.">登录</option>
                <option value="project.">项目</option>
                <option value="requirement.">需求</option>
                <option value="task.">任务</option>
                <option value="defect.">缺陷</option>
                <option value="test_case.">测试</option>
                <option value="document.">文档</option>
                <option value="work_log.">日报</option>
                <option value="build.">构建</option>
                <option value="release.">发布</option>
                <option value="user.">用户</option>
              </select>
            </div>
            <label className="form-checkbox dynamic-filter-checkbox">
              <input type="checkbox" checked={includePageViews} onChange={(event) => setIncludePageViews(event.target.checked)} />
              <span>包含页面访问</span>
            </label>
          </div>
          <div className="dynamic-category-dock">
            {categoryCounts.map((item) => (
              <button
                key={item.key}
                className={`dynamic-category-chip ${item.variant}${categoryFilter === item.key ? ' active' : ''}`}
                onClick={() => setCategoryFilter(categoryFilter === item.key ? 'all' : item.key)}
              >
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
