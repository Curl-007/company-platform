import { useMemo, useState } from 'react';
import { Download, RefreshCw, RotateCcw } from 'lucide-react';
import { fetchProjects } from '../../projects/api';
import { fetchTeamWeeklySummary, fetchTeamWorkLogs } from '../api';
import { useAsync } from '../../../hooks/useAsync';
import PageHeader from '../../../components/common/PageHeader';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import type { DataTableColumn } from '../../../components/common/DataTable';
import DataTable from '../../../components/common/DataTable';
import { USER_ROLE_LABELS, labelOf } from '../../../constants/enums';
import type { Project, TeamWorkSummary, TeamWorkSummaryMember, WorkLog } from '../../../types';
import {
  type QuickFilter,
  today,
  weekStart,
  downloadMarkdown,
  downloadCsv,
  goToTarget,
  buildRelatedLinks,
  hasRealBlockers,
  buildMemberLinks,
  buildOverallMarkdown,
} from './teamLogsHelpers';
import MemberSummaryDialog from './MemberSummaryDialog';
import ProgressMini from './ProgressMini';

export default function TeamLogsView() {
  const [projectId, setProjectId] = useState('');
  const [role, setRole] = useState('');
  const [author, setAuthor] = useState('');
  const [date, setDate] = useState(today());
  const [week, setWeek] = useState(weekStart());
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [selectedMemberSummary, setSelectedMemberSummary] = useState<TeamWorkSummaryMember | null>(null);

  const { data: projects } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const selectedProject = useMemo(
    () => (projects ?? []).find((item) => item.id === projectId) ?? null,
    [projectId, projects],
  );
  const teamLogsAsync = useAsync<WorkLog[]>(
    () => fetchTeamWorkLogs({ projectId: projectId || undefined, role: role || undefined, author: author || undefined, date: date || undefined }),
    [projectId, role, author, date],
    { cacheKey: 'work-logs:team' },
  );
  const summaryAsync = useAsync<TeamWorkSummary>(
    () => fetchTeamWeeklySummary({ projectId: projectId || undefined, week: week || undefined, role: role || undefined }),
    [projectId, week, role],
    { cacheKey: 'work-logs:weekly-summary' },
  );

  const logs = teamLogsAsync.data ?? [];
  const summary = summaryAsync.data;

  const authors = useMemo(() => {
    const names = new Set(logs.map((item) => item.author));
    return [...names];
  }, [logs]);

  const blockedLogs = useMemo(
    () => logs.filter((item) => Boolean(item.blockers?.trim()) || hasRealBlockers(item.analysis?.blockers ?? [])),
    [logs],
  );

  const visibleLogs = useMemo(() => {
    if (quickFilter === 'blocked') return blockedLogs;
    return logs;
  }, [logs, blockedLogs, quickFilter]);

  const teamSignals = useMemo(() => {
    const submitted = summary?.submittedCount ?? 0;
    const missing = summary?.missingCount ?? 0;
    const expected = submitted + missing;
    const submitRate = expected ? Math.round((submitted / expected) * 100) : 0;
    const blockerRate = logs.length ? Math.round((blockedLogs.length / logs.length) * 100) : 0;
    const activeAuthors = new Set(logs.map((item) => item.author)).size;
    const topBlockedAuthors = [...new Set(blockedLogs.map((item) => item.author))].slice(0, 5);
    const actions = [
      missing > 0
        ? `提醒 ${missing} 位成员补交本周日报。`
        : '本周成员提交情况完整，保持当前节奏。',
      blockedLogs.length > 0
        ? `优先处理 ${blockedLogs.length} 条带阻塞日报。`
        : '当前筛选范围内未发现阻塞日报。',
      summary?.overall.linkedRequirements.length
        ? `核对 ${summary.overall.linkedRequirements.length} 个关联需求的验收证据。`
        : '暂无关联需求，可从日报中补充 REQ 编号提高追踪性。',
    ];
    return { submitRate, blockerRate, activeAuthors, topBlockedAuthors, actions };
  }, [blockedLogs, logs, summary]);

  const resetFilters = () => {
    setProjectId('');
    setRole('');
    setAuthor('');
    setDate(today());
    setWeek(weekStart());
    setQuickFilter('all');
  };

  const reloadAll = () => {
    teamLogsAsync.reload();
    summaryAsync.reload();
  };

  const exportVisibleLogs = () => {
    downloadCsv(`team-logs-${date || 'all'}.csv`, visibleLogs.map((item) => ({
      date: item.logDate || '',
      project: item.project,
      author: item.author,
      role: labelOf(USER_ROLE_LABELS, item.role || 'dev'),
      content: item.content,
      blockers: item.blockers || item.analysis?.blockers?.filter((entry) => entry !== 'No explicit blocker was detected.').join('；') || '',
      nextPlan: item.nextPlan || '',
      linked: buildRelatedLinks(item).map((entry) => entry.label).join(' '),
    })));
  };

  const columns: DataTableColumn<WorkLog>[] = [
    { key: 'logDate', title: '日期', render: (item) => item.logDate || '-' },
    { key: 'project', title: '项目', render: (item) => item.project || '-' },
    { key: 'author', title: '成员', render: (item) => item.author },
    {
      key: 'role',
      title: '角色',
      render: (item) => <StatusBadge status={item.role || 'dev'} label={labelOf(USER_ROLE_LABELS, item.role || 'dev')} showDot={false} />,
    },
    { key: 'content', title: '今日完成', render: (item) => <span>{item.content}</span> },
    {
      key: 'blockers',
      title: '当前阻塞',
      render: (item) => {
        const text = item.blockers || item.analysis?.blockers?.filter((entry) => entry !== 'No explicit blocker was detected.').join('；') || '-';
        const blocked = text !== '-';
        return <span style={blocked ? { color: 'var(--color-risk, #dc2626)', fontWeight: 600 } : undefined}>{text}</span>;
      },
    },
    { key: 'nextPlan', title: '明日计划', render: (item) => item.nextPlan || '-' },
    {
      key: 'links',
      title: '关联详情',
      render: (item) => {
        const related = buildRelatedLinks(item);
        if (!related.length) return '-';
        return (
          <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
            {related.slice(0, 3).map((entry) => (
              <button key={`${entry.kind}-${entry.id}`} className="btn btn-text btn-xs" onClick={() => goToTarget(entry)}>
                {entry.label}
              </button>
            ))}
          </div>
        );
      },
    },
  ];

  if (teamLogsAsync.loading || summaryAsync.loading) {
    return (
      <div>
        <PageHeader title="团队日报" description="项目经理查看产品、开发、测试的日报与周报。" />
        <PageState loading error={null} isEmpty={false} />
      </div>
    );
  }

  if (teamLogsAsync.error || summaryAsync.error) {
    return (
      <div>
        <PageHeader title="团队日报" description="项目经理查看产品、开发、测试的日报与周报。" />
        <PageState
          loading={false}
          error={teamLogsAsync.error || summaryAsync.error}
          isEmpty={false}
          onRetry={() => {
            teamLogsAsync.reload();
            summaryAsync.reload();
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="团队日报"
        description="按项目、角色、成员、日期查看团队日报，并自动汇总团队周报。"
        actions={(
          <>
            <button className="btn btn-secondary btn-sm" onClick={reloadAll}>
              <RefreshCw size={14} />
              刷新
            </button>
            <button className="btn btn-secondary btn-sm" onClick={resetFilters}>
              <RotateCcw size={14} />
              重置
            </button>
            <button className="btn btn-primary btn-sm" onClick={exportVisibleLogs} disabled={visibleLogs.length === 0}>
              <Download size={14} />
              导出日报
            </button>
          </>
        )}
      />

      <Panel title="筛选条件" subtitle="支持按项目、角色、成员和日期快速定位。" className="panel-muted">
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="teamlogs-project">项目</label>
            <select id="teamlogs-project" className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">全部项目</option>
              {(projects ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="teamlogs-role">角色</label>
            <select id="teamlogs-role" className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">全部角色</option>
              <option value="pdm">产品经理</option>
              <option value="dev">开发</option>
              <option value="qa">测试</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="teamlogs-author">成员</label>
            <select id="teamlogs-author" className="form-select" value={author} onChange={(e) => setAuthor(e.target.value)}>
              <option value="">全部成员</option>
              {authors.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="teamlogs-date">日报日期</label>
            <input id="teamlogs-date" className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="teamlogs-week">周报周起始</label>
            <input id="teamlogs-week" className="form-input" type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </div>
        </div>

        <div className="quick-filter-bar">
          <button className={`btn btn-sm ${quickFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setQuickFilter('all')}>全部</button>
          <button className={`btn btn-sm ${quickFilter === 'missing' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setQuickFilter('missing')}>未提交</button>
          <button className={`btn btn-sm ${quickFilter === 'blocked' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setQuickFilter('blocked')}>有阻塞</button>
        </div>
      </Panel>

      <div className="metric-grid" style={{ marginTop: 16 }}>
        <div className="metric-card">
          <div className="metric-card-label">当日日报数</div>
          <div className="metric-card-value">{logs.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">有阻塞日报</div>
          <div className="metric-card-value">{blockedLogs.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">本周已提交人数</div>
          <div className="metric-card-value">{summary?.submittedCount ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">本周缺报人数</div>
          <div className="metric-card-value">{summary?.missingCount ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">周提交率</div>
          <div className="metric-card-value">{teamSignals.submitRate}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">阻塞占比</div>
          <div className="metric-card-value">{teamSignals.blockerRate}%</div>
        </div>
      </div>

      <div className="grid-2 mt-16">
        <Panel title="今日处置建议" subtitle="按当前筛选范围生成">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teamSignals.actions.map((item, index) => (
              <div key={item} className={`action-summary-item ${index === 0 && (summary?.missingCount ?? 0) > 0 ? 'warning' : index === 1 && blockedLogs.length > 0 ? 'risk' : 'info'}`} style={{ justifyContent: 'flex-start' }}>
                <strong>{index + 1}</strong>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="团队信号" subtitle={`${teamSignals.activeAuthors} 位成员在当前日期有日报`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="req-progress-bar-row">
              <span className="font-medium" style={{ width: 72 }}>提交率</span>
              <div className="progress-bar" style={{ flex: 1 }}>
                <ProgressMini percent={teamSignals.submitRate} tone={teamSignals.submitRate >= 90 ? 'success' : 'warning'} />
              </div>
              <span className="text-mono text-secondary">{teamSignals.submitRate}%</span>
            </div>
            <div className="req-progress-bar-row">
              <span className="font-medium" style={{ width: 72 }}>阻塞率</span>
              <div className="progress-bar" style={{ flex: 1 }}>
                <ProgressMini percent={teamSignals.blockerRate} tone={teamSignals.blockerRate > 0 ? 'risk' : 'success'} />
              </div>
              <span className="text-mono text-secondary">{teamSignals.blockerRate}%</span>
            </div>
            <div>
              <div className="helper-text">阻塞成员</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {teamSignals.topBlockedAuthors.length ? teamSignals.topBlockedAuthors.map((name) => (
                  <span key={name} className="tag" style={{ color: 'var(--color-risk)', borderColor: 'var(--color-risk)' }}>{name}</span>
                )) : <span className="text-secondary">暂无</span>}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {quickFilter === 'missing' ? (
        <Panel title="缺报成员" subtitle={`本周共 ${summary?.missingCount ?? 0} 人缺报`} style={{ marginTop: 16 }}>
          {summary?.missingMembers.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {summary.missingMembers.map((item) => (
                <span key={`${item.name}-${item.role}`} className="tag" style={{ borderColor: 'var(--color-risk, #dc2626)', color: 'var(--color-risk, #dc2626)' }}>
                  {item.name} · {labelOf(USER_ROLE_LABELS, item.role)}
                </span>
              ))}
            </div>
          ) : (
            <div className="body-text">当前项目本周没有缺报成员。</div>
          )}
        </Panel>
      ) : (
        <Panel title="团队日报列表" subtitle={`当前共 ${visibleLogs.length} 条日报`} style={{ marginTop: 16 }} className="panel-muted">
          <DataTable columns={columns} data={visibleLogs} rowKey="id" emptyText="当前筛选条件下暂无日报。" />
        </Panel>
      )}

      <Panel
        title="团队周报汇总"
        subtitle={summary ? `周起始：${summary.weekKey}` : '暂无周报'}
        style={{ marginTop: 16 }}
        toolbar={
          summary ? (
            <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(`${selectedProject?.name || summary.project || 'team'}-${summary.weekKey}.md`, buildOverallMarkdown(summary))}>
              导出周报 Markdown
            </button>
          ) : undefined
        }
      >
        {summary ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="section-title">整体摘要</div>
            <div className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{summary.overall.summary || '暂无整体摘要。'}</div>

            <div className="section-title">缺报成员</div>
            {summary.missingMembers.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {summary.missingMembers.map((item) => (
                  <span key={`${item.name}-${item.role}`} className="tag" style={{ borderColor: 'var(--color-risk, #dc2626)', color: 'var(--color-risk, #dc2626)' }}>
                    {item.name} · {labelOf(USER_ROLE_LABELS, item.role)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="body-text">本周暂无缺报成员。</div>
            )}

            <div className="section-title">成员周报</div>
            <div className="summary-stack">
              {summary.members.map((member) => {
                const blocked = hasRealBlockers(member.summary.blockers);
                const relatedLinks = buildMemberLinks(member);
                return (
                  <div
                    key={`${member.author}-${member.role}`}
                    className={`summary-card${blocked ? ' blocked' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedMemberSummary(member)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedMemberSummary(member);
                      }
                    }}
                  >
                    <div className="summary-card-header">
                      <span className="font-medium">{member.author}</span>
                      <StatusBadge status={member.role} label={labelOf(USER_ROLE_LABELS, member.role)} showDot={false} />
                      <span className="tag">{member.count} 篇日报</span>
                      <button
                        className="btn btn-text btn-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedMemberSummary(member);
                        }}
                      >
                        查看周报
                      </button>
                      {blocked ? (
                        <span className="tag" style={{ color: 'var(--color-risk, #dc2626)', borderColor: 'var(--color-risk, #dc2626)' }}>
                          有阻塞
                        </span>
                      ) : null}
                      <button
                        className="btn btn-text btn-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          downloadMarkdown(`${member.author}-${summary.weekKey}.md`, member.markdown);
                        }}
                      >
                        导出
                      </button>
                    </div>
                    <div className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{member.summary.summary || '暂无摘要。'}</div>
                    {relatedLinks.length ? (
                      <div className="summary-card-links">
                        {relatedLinks.map((entry) => (
                          <button
                            key={`${entry.kind}-${entry.id}`}
                            className="btn btn-text btn-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              goToTarget(entry);
                            }}
                          >
                            {entry.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="body-text">暂无团队周报数据。</div>
        )}
      </Panel>

      {summary && selectedMemberSummary ? (
        <MemberSummaryDialog
          member={selectedMemberSummary}
          weekKey={summary.weekKey}
          onClose={() => setSelectedMemberSummary(null)}
        />
      ) : null}
    </div>
  );
}
