import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, RotateCcw } from 'lucide-react';
import { fetchProjects } from '../../projects/api';
import { fetchTeamWeeklySummary, fetchTeamWorkLogs } from '../api';
import { useAsync } from '../../../hooks/useAsync';
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
  const { t } = useTranslation();
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
        ? t('features.workLogs.teamLogsView.remindMissing', { count: missing })
        : t('features.workLogs.teamLogsView.completeSubmission'),
      blockedLogs.length > 0
        ? t('features.workLogs.teamLogsView.prioritizeBlocked', { count: blockedLogs.length })
        : t('features.workLogs.teamLogsView.noBlockedLogs'),
      summary?.overall.linkedRequirements.length
        ? t('features.workLogs.teamLogsView.verifyRequirements', { count: summary.overall.linkedRequirements.length })
        : t('features.workLogs.teamLogsView.noLinkedRequirements'),
    ];
    return { submitRate, blockerRate, activeAuthors, topBlockedAuthors, actions };
  }, [blockedLogs, logs, summary, t]);

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
    { key: 'logDate', title: t('features.workLogs.teamLogsView.column.date'), render: (item) => item.logDate || '-' },
    { key: 'project', title: t('features.workLogs.teamLogsView.column.project'), render: (item) => item.project || '-' },
    { key: 'author', title: t('features.workLogs.teamLogsView.column.member'), render: (item) => item.author },
    {
      key: 'role',
      title: t('features.workLogs.teamLogsView.column.role'),
      render: (item) => <StatusBadge status={item.role || 'dev'} label={labelOf(USER_ROLE_LABELS, item.role || 'dev')} showDot={false} />,
    },
    { key: 'content', title: t('features.workLogs.teamLogsView.column.todayCompleted'), render: (item) => <span>{item.content}</span> },
    {
      key: 'blockers',
      title: t('features.workLogs.teamLogsView.column.currentBlockers'),
      render: (item) => {
        const text = item.blockers || item.analysis?.blockers?.filter((entry) => entry !== 'No explicit blocker was detected.').join('；') || '-';
        const blocked = text !== '-';
        return <span style={blocked ? { color: 'var(--color-risk, #dc2626)', fontWeight: 600 } : undefined}>{text}</span>;
      },
    },
    { key: 'nextPlan', title: t('features.workLogs.teamLogsView.column.tomorrowPlan'), render: (item) => item.nextPlan || '-' },
    {
      key: 'links',
      title: t('features.workLogs.teamLogsView.column.relatedDetails'),
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
    return <PageState loading error={null} isEmpty={false} />;
  }

  if (teamLogsAsync.error || summaryAsync.error) {
    return (
      <PageState
        loading={false}
        error={teamLogsAsync.error || summaryAsync.error}
        isEmpty={false}
        onRetry={() => {
          teamLogsAsync.reload();
          summaryAsync.reload();
        }}
      />
    );
  }

  return (
    <div>
      <div className="page-inline-actions mb-4 flex flex-wrap justify-end gap-2">
        <button className="btn btn-secondary btn-sm" onClick={reloadAll}>
          <RefreshCw size={14} />
          {t('features.workLogs.teamLogsView.refresh')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={resetFilters}>
          <RotateCcw size={14} />
          {t('common.reset')}
        </button>
        <button className="btn btn-primary btn-sm" onClick={exportVisibleLogs} disabled={visibleLogs.length === 0}>
          <Download size={14} />
          {t('features.workLogs.teamLogsView.exportLogs')}
        </button>
      </div>

      <div className="filter-bar teamlogs-filter-bar">
        <div className="filter-bar-controls">
          <select id="teamlogs-project" className="form-select" aria-label={t('features.workLogs.teamLogsView.aria.project')} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('features.workLogs.teamLogsView.allProjects')}</option>
            {(projects ?? []).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <select id="teamlogs-role" className="form-select" aria-label={t('features.workLogs.teamLogsView.aria.role')} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">{t('features.workLogs.teamLogsView.allRoles')}</option>
            <option value="pdm">{t('enums.userRole.pdm')}</option>
            <option value="dev">{t('enums.userRole.dev')}</option>
            <option value="qa">{t('enums.userRole.qa')}</option>
          </select>
          <select id="teamlogs-author" className="form-select" aria-label={t('features.workLogs.teamLogsView.aria.member')} value={author} onChange={(e) => setAuthor(e.target.value)}>
            <option value="">{t('features.workLogs.teamLogsView.allMembers')}</option>
            {authors.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <input id="teamlogs-date" className="form-input" type="date" aria-label={t('features.workLogs.teamLogsView.aria.logDate')} value={date} onChange={(e) => setDate(e.target.value)} />
          <input id="teamlogs-week" className="form-input" type="date" aria-label={t('features.workLogs.teamLogsView.aria.weekStart')} value={week} onChange={(e) => setWeek(e.target.value)} />
          <div className="quick-filter-bar" role="group" aria-label={t('features.workLogs.teamLogsView.aria.quickFilter')}>
            <button className={`btn btn-sm ${quickFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setQuickFilter('all')}>{t('features.workLogs.teamLogsView.all')}</button>
            <button className={`btn btn-sm ${quickFilter === 'missing' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setQuickFilter('missing')}>{t('features.workLogs.teamLogsView.notSubmitted')}</button>
            <button className={`btn btn-sm ${quickFilter === 'blocked' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setQuickFilter('blocked')}>{t('features.workLogs.common.hasBlockers')}</button>
          </div>
        </div>
      </div>

      <div className="metric-grid" style={{ marginTop: 16 }}>
        <div className="metric-card">
          <div className="metric-card-label">{t('features.workLogs.teamLogsView.metric.logCountToday')}</div>
          <div className="metric-card-value">{logs.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">{t('features.workLogs.teamLogsView.metric.blockedLogCount')}</div>
          <div className="metric-card-value">{blockedLogs.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">{t('features.workLogs.teamLogsView.metric.submittedCount')}</div>
          <div className="metric-card-value">{summary?.submittedCount ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">{t('features.workLogs.teamLogsView.metric.missingCount')}</div>
          <div className="metric-card-value">{summary?.missingCount ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">{t('features.workLogs.teamLogsView.metric.submitRate')}</div>
          <div className="metric-card-value">{teamSignals.submitRate}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-card-label">{t('features.workLogs.teamLogsView.metric.blockerRate')}</div>
          <div className="metric-card-value">{teamSignals.blockerRate}%</div>
        </div>
      </div>

      <div className="grid-2 mt-16">
        <Panel title={t('features.workLogs.teamLogsView.todaysActions')} subtitle={t('features.workLogs.teamLogsView.generatedByFilters')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teamSignals.actions.map((item, index) => (
              <div key={item} className={`action-summary-item ${index === 0 && (summary?.missingCount ?? 0) > 0 ? 'warning' : index === 1 && blockedLogs.length > 0 ? 'risk' : 'info'}`} style={{ justifyContent: 'flex-start' }}>
                <strong>{index + 1}</strong>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={t('features.workLogs.teamLogsView.teamSignals')} subtitle={t('features.workLogs.teamLogsView.activeAuthorsSubtitle', { count: teamSignals.activeAuthors })}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="req-progress-bar-row">
              <span className="font-medium" style={{ width: 72 }}>{t('features.workLogs.teamLogsView.submitRate')}</span>
              <div className="progress-bar" style={{ flex: 1 }}>
                <ProgressMini percent={teamSignals.submitRate} tone={teamSignals.submitRate >= 90 ? 'success' : 'warning'} />
              </div>
              <span className="text-mono text-secondary">{teamSignals.submitRate}%</span>
            </div>
            <div className="req-progress-bar-row">
              <span className="font-medium" style={{ width: 72 }}>{t('features.workLogs.teamLogsView.blockerRate')}</span>
              <div className="progress-bar" style={{ flex: 1 }}>
                <ProgressMini percent={teamSignals.blockerRate} tone={teamSignals.blockerRate > 0 ? 'risk' : 'success'} />
              </div>
              <span className="text-mono text-secondary">{teamSignals.blockerRate}%</span>
            </div>
            <div>
              <div className="helper-text">{t('features.workLogs.teamLogsView.blockedMembers')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {teamSignals.topBlockedAuthors.length ? teamSignals.topBlockedAuthors.map((name) => (
                  <span key={name} className="tag" style={{ color: 'var(--color-risk)', borderColor: 'var(--color-risk)' }}>{name}</span>
                )) : <span className="text-secondary">{t('features.workLogs.common.none')}</span>}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {quickFilter === 'missing' ? (
        <Panel title={t('features.workLogs.teamLogsView.missingMembers')} subtitle={t('features.workLogs.teamLogsView.missingCountSubtitle', { count: summary?.missingCount ?? 0 })} style={{ marginTop: 16 }}>
          {summary?.missingMembers.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {summary.missingMembers.map((item) => (
                <span key={`${item.name}-${item.role}`} className="tag" style={{ borderColor: 'var(--color-risk, #dc2626)', color: 'var(--color-risk, #dc2626)' }}>
                  {item.name} · {labelOf(USER_ROLE_LABELS, item.role)}
                </span>
              ))}
            </div>
          ) : (
            <div className="body-text">{t('features.workLogs.teamLogsView.noMissingMembers')}</div>
          )}
        </Panel>
      ) : (
        <Panel title={t('features.workLogs.teamLogsView.teamLogList')} subtitle={t('features.workLogs.teamLogsView.logCountSubtitle', { count: visibleLogs.length })} style={{ marginTop: 16 }} className="panel-muted">
          <DataTable columns={columns} data={visibleLogs} rowKey="id" emptyText={t('features.workLogs.teamLogsView.noLogs')} />
        </Panel>
      )}

      <Panel
        title={t('features.workLogs.teamLogsView.weeklySummary')}
        subtitle={summary ? t('features.workLogs.teamLogsView.weekStartSubtitle', { week: summary.weekKey }) : t('features.workLogs.teamLogsView.noWeeklyReport')}
        style={{ marginTop: 16 }}
        toolbar={
          summary ? (
            <button className="btn btn-secondary btn-sm" onClick={() => downloadMarkdown(`${selectedProject?.name || summary.project || 'team'}-${summary.weekKey}.md`, buildOverallMarkdown(summary))}>
              {t('features.workLogs.teamLogsView.exportWeeklyMarkdown')}
            </button>
          ) : undefined
        }
      >
        {summary ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="section-title">{t('features.workLogs.teamLogsView.overallSummary')}</div>
            <div className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{summary.overall.summary || t('features.workLogs.common.noSummary')}</div>

            <div className="section-title">{t('features.workLogs.teamLogsView.missingMembers')}</div>
            {summary.missingMembers.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {summary.missingMembers.map((item) => (
                  <span key={`${item.name}-${item.role}`} className="tag" style={{ borderColor: 'var(--color-risk, #dc2626)', color: 'var(--color-risk, #dc2626)' }}>
                    {item.name} · {labelOf(USER_ROLE_LABELS, item.role)}
                  </span>
                ))}
              </div>
            ) : (
              <div className="body-text">{t('features.workLogs.teamLogsView.noMissingMembersThisWeek')}</div>
            )}

            <div className="section-title">{t('features.workLogs.teamLogsView.memberReports')}</div>
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
                      <span className="tag">{t('features.workLogs.common.logCountTag', { count: member.count })}</span>
                      <button
                        className="btn btn-text btn-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedMemberSummary(member);
                        }}
                      >
                        {t('features.workLogs.teamLogsView.viewReport')}
                      </button>
                      {blocked ? (
                        <span className="tag" style={{ color: 'var(--color-risk, #dc2626)', borderColor: 'var(--color-risk, #dc2626)' }}>
                          {t('features.workLogs.common.hasBlockers')}
                        </span>
                      ) : null}
                      <button
                        className="btn btn-text btn-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          downloadMarkdown(`${member.author}-${summary.weekKey}.md`, member.markdown);
                        }}
                      >
                        {t('features.workLogs.teamLogsView.export')}
                      </button>
                    </div>
                    <div className="body-text" style={{ whiteSpace: 'pre-wrap' }}>{member.summary.summary || t('features.workLogs.common.noSummary')}</div>
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
          <div className="body-text">{t('features.workLogs.teamLogsView.noWeeklyData')}</div>
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
