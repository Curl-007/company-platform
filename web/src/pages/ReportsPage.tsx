import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Download,
  FileText,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { fetchDashboard, sendAiChat } from '../services/resources';
import { ApiError } from '../services/api';
import { getSessionUser } from '../services/auth';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import StatusBadge from '../components/common/StatusBadge';
import MetricCard from '../components/common/MetricCard';
import DonutChart from '../components/common/DonutChart';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import ProgressBar from '../components/common/ProgressBar';
import type { DashboardData, Project, RequirementProgress } from '../types';
import { PROJECT_STATUS_LABELS, healthVariant, labelOf } from '../constants/enums';
import { canOperate } from '../constants/roles';

type ReportView = 'overview' | 'risk' | 'delivery';
type ReportActionTone = 'success' | 'warning' | 'risk' | 'info';

interface ReportActionItem {
  tone: ReportActionTone;
  title: string;
  detail: string;
}

interface ReportModel {
  riskProjects: Project[];
  lowRequirements: RequirementProgress[];
  healthBuckets: Array<{ label: string; count: number; tone: 'success' | 'warning' | 'risk' }>;
  taskCounts: DashboardData['metrics']['tasks'];
  doneRate: number;
  blockedRate: number;
  actionItems: ReportActionItem[];
}

function buildReportsAiPrompt(data: DashboardData, reportModel: ReportModel, view: ReportView): string {
  const riskProjects = reportModel.riskProjects.slice(0, 4)
    .map((project) => `${project.id} ${project.name} / ${labelOf(PROJECT_STATUS_LABELS, project.status)} / 健康 ${project.healthScore} / 风险 ${project.riskCount} / 进度 ${project.progress}%`);
  const lowRequirements = reportModel.lowRequirements.slice(0, 4)
    .map((item) => `${item.id} ${item.title} / ${item.projectName} / 完成 ${item.completion}%`);
  const viewLabel = view === 'overview' ? '经营概览' : view === 'risk' ? '风险分析' : '交付追踪';

  return [
    '请作为项目组合报表 AI 分析师，基于下面报表数据生成管理层解读。',
    `当前报表视图：${viewLabel}`,
    '请控制在 500 字以内，只输出：1. 报表结论 2. 异常指标 3. 三条管理动作 4. 一句话摘要。',
    '必须引用具体项目、需求或指标。',
    '',
    `项目平均健康度：${data.metrics.projectHealthAverage}`,
    `需求平均完成率：${data.metrics.requirementCompletionAverage}%`,
    `测试通过率：${data.metrics.testPassRate}%`,
    `开放风险：${data.metrics.openRisks}`,
    `任务完成率：${reportModel.doneRate}%，阻塞率：${reportModel.blockedRate}%`,
    '',
    '风险项目：',
    riskProjects.length ? riskProjects.join('\n') : '暂无风险项目',
    '',
    '低进展需求：',
    lowRequirements.length ? lowRequirements.join('\n') : '暂无低进展需求',
  ].join('\n');
}

const riskyColumns: DataTableColumn<Project>[] = [
  {
    key: 'name',
    title: '项目名称',
    render: (project) => <span className="font-medium">{project.name}</span>,
  },
  {
    key: 'status',
    title: '状态',
    render: (project) => <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />,
  },
  {
    key: 'healthScore',
    title: '健康度',
    align: 'center',
    sorter: (a, b) => a.healthScore - b.healthScore,
    render: (project) => (
      <StatusBadge label={String(project.healthScore)} variant={healthVariant(project.healthScore)} showDot={false} />
    ),
  },
  {
    key: 'riskCount',
    title: '风险数',
    align: 'center',
    sorter: (a, b) => a.riskCount - b.riskCount,
    render: (project) => <span className="text-mono">{project.riskCount}</span>,
  },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
  },
];

const requirementColumns: DataTableColumn<RequirementProgress>[] = [
  {
    key: 'title',
    title: '需求',
    render: (item) => <span className="font-medium">{item.title}</span>,
  },
  {
    key: 'projectName',
    title: '所属项目',
    render: (item) => <span className="text-secondary">{item.projectName}</span>,
  },
  {
    key: 'completion',
    title: '完成度',
    width: 180,
    sorter: (a, b) => a.completion - b.completion,
    render: (item) => (
      <div style={{ minWidth: 140 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <span className="text-secondary text-mono">{item.completion}%</span>
          <StatusBadge
            label={item.completion >= 80 ? '稳定' : item.completion >= 50 ? '推进中' : '低进展'}
            variant={item.completion >= 80 ? 'success' : item.completion >= 50 ? 'warning' : 'risk'}
            showDot={false}
          />
        </div>
        <ProgressBar percent={item.completion} showPercent={false} height={6} />
      </div>
    ),
  },
];

function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchDashboard, []);
  const [view, setView] = useState<ReportView>('overview');
  const currentUser = getSessionUser();
  const canUseAi = canOperate(currentUser, 'ai:analyze');

  const metricCards = useMemo(() => {
    if (!data) return [];
    const { metrics } = data;
    return [
      {
        label: '项目平均健康度',
        value: metrics.projectHealthAverage,
        trend: metrics.projectHealthAverage >= 75 ? '整体健康' : '需要关注',
        direction: metrics.projectHealthAverage >= 75 ? ('up' as const) : ('down' as const),
        tone: metrics.projectHealthAverage >= 75 ? ('success' as const) : ('warning' as const),
        icon: <Gauge size={18} />,
      },
      {
        label: '需求完成率',
        value: `${metrics.requirementCompletionAverage}%`,
        trend: '跨项目平均完成水平',
        direction: 'flat' as const,
        tone: 'info' as const,
        icon: <Target size={18} />,
      },
      {
        label: '测试通过率',
        value: `${metrics.testPassRate}%`,
        trend: metrics.testPassRate >= 90 ? '达到目标' : '低于目标',
        direction: metrics.testPassRate >= 90 ? ('up' as const) : ('down' as const),
        tone: metrics.testPassRate >= 90 ? ('success' as const) : ('risk' as const),
        icon: <CheckCircle2 size={18} />,
      },
      {
        label: '文档数量',
        value: metrics.documentCount,
        trend: '文档中心总量',
        direction: 'flat' as const,
        tone: 'default' as const,
        icon: <FileText size={18} />,
      },
      {
        label: '开放风险',
        value: metrics.openRisks,
        trend: '全部项目累计',
        direction: metrics.openRisks > 0 ? ('down' as const) : ('flat' as const),
        tone: metrics.openRisks > 0 ? ('risk' as const) : ('success' as const),
        icon: <ShieldAlert size={18} />,
      },
    ];
  }, [data]);

  const healthRankData = useMemo(() => {
    if (!data) return [];
    return [...data.riskyProjects]
      .sort((a, b) => b.healthScore - a.healthScore)
      .slice(0, 8)
      .map((project) => ({
        name: project.name.length > 10 ? `${project.name.slice(0, 10)}...` : project.name,
        health: project.healthScore,
        id: project.id,
      }));
  }, [data]);

  const reportModel = useMemo(() => {
    if (!data) return null;
    const projects = data.riskyProjects;
    const riskProjects = [...projects].sort((a, b) => b.riskCount - a.riskCount || a.healthScore - b.healthScore);
    const lowRequirements = [...data.requirementProgress]
      .sort((a, b) => a.completion - b.completion)
      .slice(0, 8);
    const healthBuckets = [
      { label: '健康', count: projects.filter((project) => project.healthScore >= 75).length, tone: 'success' as const },
      { label: '关注', count: projects.filter((project) => project.healthScore >= 50 && project.healthScore < 75).length, tone: 'warning' as const },
      { label: '高风险', count: projects.filter((project) => project.healthScore < 50).length, tone: 'risk' as const },
    ];
    const taskCounts = data.metrics.tasks;
    const doneTasks = Number(taskCounts.done ?? 0);
    const blockedTasks = Number(taskCounts.blocked ?? 0);
    const totalTasks = Number(taskCounts.total ?? 0);
    const doneRate = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const blockedRate = totalTasks ? Math.round((blockedTasks / totalTasks) * 100) : 0;
    const actionItems = [
      data.metrics.openRisks > 0
        ? { tone: 'risk' as const, title: '风险收敛', detail: `当前累计 ${data.metrics.openRisks} 个开放风险，优先处理健康度最低的项目。` }
        : { tone: 'success' as const, title: '风险状态', detail: '当前没有开放风险项目，可保持常规巡检节奏。' },
      data.metrics.testPassRate < 90
        ? { tone: 'warning' as const, title: '质量门禁', detail: `测试通过率 ${data.metrics.testPassRate}%，发布前建议补充回归证据。` }
        : { tone: 'success' as const, title: '质量门禁', detail: '测试通过率已达到目标，可继续观察缺陷关闭趋势。' },
      data.metrics.requirementCompletionAverage < 70
        ? { tone: 'info' as const, title: '需求推进', detail: '需求平均完成率偏低，建议拆分低进展需求并绑定负责人。' }
        : { tone: 'info' as const, title: '需求推进', detail: '需求整体推进稳定，可关注验收证据完整度。' },
    ];

    return { riskProjects, lowRequirements, healthBuckets, taskCounts, doneRate, blockedRate, actionItems };
  }, [data]);

  const handleExport = () => {
    if (!data || !reportModel) return;
    if (view === 'risk') {
      downloadCsv('risk-projects.csv', reportModel.riskProjects.map((project) => ({
        id: project.id,
        name: project.name,
        status: labelOf(PROJECT_STATUS_LABELS, project.status),
        healthScore: project.healthScore,
        riskCount: project.riskCount,
        progress: project.progress,
      })));
      return;
    }
    if (view === 'delivery') {
      downloadCsv('requirement-progress.csv', data.requirementProgress.map((item) => ({
        id: item.id,
        title: item.title,
        projectId: item.projectId,
        projectName: item.projectName,
        completion: item.completion,
      })));
      return;
    }
    downloadCsv('report-summary.csv', [
      {
        projectHealthAverage: data.metrics.projectHealthAverage,
        requirementCompletionAverage: data.metrics.requirementCompletionAverage,
        testPassRate: data.metrics.testPassRate,
        documentCount: data.metrics.documentCount,
        openRisks: data.metrics.openRisks,
        totalTasks: data.metrics.tasks.total,
      },
    ]);
  };

  if (loading || error || !data) {
    return (
      <div>
        <PageHeader title="报表中心" description="查看项目健康度、需求完成率、测试通过率等综合报表。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="报表中心"
        description="查看项目健康度、需求完成率、测试通过率等综合报表。"
        actions={(
          <>
            <button className="btn btn-secondary btn-sm" onClick={reload}>
              <RefreshCw size={14} />
              刷新
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleExport}>
              <Download size={14} />
              导出
            </button>
          </>
        )}
      />

      <div className="nav-tabs mb-16" role="tablist" aria-label="报表视图">
        {[
          { key: 'overview', label: '经营概览', icon: BarChart3 },
          { key: 'risk', label: '风险分析', icon: AlertTriangle },
          { key: 'delivery', label: '交付追踪', icon: Target },
        ].map((item) => {
          const Icon = item.icon;
          const active = view === item.key;
          return (
            <button
              key={item.key}
              className={`nav-tab ${active ? 'active' : ''}`}
              onClick={() => setView(item.key as ReportView)}
              role="tab"
              aria-selected={active}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="metric-grid">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            trend={card.trend}
            trendDirection={card.direction}
            tone={card.tone}
            icon={card.icon}
          />
        ))}
      </div>

      {canUseAi && reportModel ? (
        <ReportAiInsight data={data} reportModel={reportModel} view={view} />
      ) : null}

      {view === 'overview' && reportModel && (
        <OverviewReport data={data} reportModel={reportModel} />
      )}

      {view === 'risk' && reportModel && (
        <RiskReport data={data} reportModel={reportModel} healthRankData={healthRankData} />
      )}

      {view === 'delivery' && reportModel && (
        <DeliveryReport data={data} reportModel={reportModel} />
      )}
    </div>
  );
}

function OverviewReport({
  data,
  reportModel,
}: {
  data: DashboardData;
  reportModel: ReportModel;
}) {
  return (
    <>
      <div className="action-summary-row mt-20">
        {reportModel.healthBuckets.map((bucket) => (
          <div key={bucket.label} className={`action-summary-item ${bucket.tone}`}>
            <span>{bucket.label}项目</span>
            <strong>{bucket.count}</strong>
          </div>
        ))}
        <div className={`action-summary-item ${reportModel.blockedRate > 0 ? 'warning' : 'success'}`}>
          <span>阻塞任务</span>
          <strong>{reportModel.blockedRate}%</strong>
        </div>
      </div>

      <Panel title="关键指标对比" subtitle="健康度 / 测试通过率 / 需求完成率" className="mt-20">
        <div className="donut-row">
          <div className="donut-cell">
            <DonutChart value={data.metrics.projectHealthAverage} label="项目健康" size={140} />
            <span className="donut-caption">项目平均健康度</span>
          </div>
          <div className="donut-cell">
            <DonutChart value={data.metrics.testPassRate} label="测试通过" size={140} />
            <span className="donut-caption">测试通过率</span>
          </div>
          <div className="donut-cell">
            <DonutChart value={data.metrics.requirementCompletionAverage} label="需求完成" size={140} />
            <span className="donut-caption">需求完成率</span>
          </div>
        </div>
      </Panel>

      <div className="grid-2 mt-20">
        <Panel title="管理动作建议" subtitle="按当前指标自动生成">
          <ActionList items={reportModel.actionItems} />
        </Panel>
        <Panel title="任务交付概览" subtitle={`完成率 ${reportModel.doneRate}%`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ProgressLine label="已完成" value={Number(reportModel.taskCounts.done ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="success" />
            <ProgressLine label="进行中" value={Number(reportModel.taskCounts.in_progress ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="info" />
            <ProgressLine label="阻塞" value={Number(reportModel.taskCounts.blocked ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="risk" />
            <ProgressLine label="待验收" value={Number(reportModel.taskCounts.acceptance ?? 0)} total={Number(reportModel.taskCounts.total ?? 0)} tone="warning" />
          </div>
        </Panel>
      </div>
    </>
  );
}

function ReportAiInsight({
  data,
  reportModel,
  view,
}: {
  data: DashboardData;
  reportModel: ReportModel;
  view: ReportView;
}) {
  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function handleAnalyze() {
    setAiError(null);
    setAiLoading(true);
    try {
      const reply = await sendAiChat({
        messages: [
          {
            role: 'user',
            content: buildReportsAiPrompt(data, reportModel, view),
          },
        ],
        scope: 'reports-management-insight',
        currentPage: `reports:${view}`,
      });
      setAiInsight(reply.content);
    } catch (err: unknown) {
      setAiError(err instanceof ApiError ? err.message : 'AI 报表解读生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  const viewLabel = view === 'overview' ? '经营概览' : view === 'risk' ? '风险分析' : '交付追踪';

  return (
    <Panel
      title="AI 报表解读"
      subtitle={`当前视图：${viewLabel} · 面向管理层输出结论与动作`}
      className="mt-20 report-ai-panel"
      toolbar={(
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={aiLoading}>
          {aiLoading ? 'AI 解读中...' : aiInsight ? '重新解读' : '生成解读'}
        </button>
      )}
    >
      <div className="report-ai-signal-row">
        <span>健康 {data.metrics.projectHealthAverage}</span>
        <span>需求 {data.metrics.requirementCompletionAverage}%</span>
        <span>测试 {data.metrics.testPassRate}%</span>
        <span>阻塞 {reportModel.blockedRate}%</span>
      </div>
      {(aiInsight || aiLoading || aiError) ? (
        <div className="report-ai-result">
          {aiLoading ? <div className="body-text">AI 正在解读当前报表指标、风险项目和交付趋势，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiInsight ? <div className="report-ai-content">{aiInsight}</div> : null}
        </div>
      ) : (
        <p className="body-text report-ai-empty">点击生成后，会输出可用于周会/经营会的报表结论、异常指标和管理动作。</p>
      )}
    </Panel>
  );
}

function RiskReport({
  data,
  reportModel,
  healthRankData,
}: {
  data: DashboardData;
  reportModel: ReportModel;
  healthRankData: Array<{ name: string; health: number; id: string }>;
}) {
  return (
    <>
      <Panel title="风险项目健康度排名" subtitle="按健康度降序" className="mt-20">
        {healthRankData.length === 0 ? (
          <p className="text-secondary" style={{ margin: 0 }}>当前没有风险项目数据。</p>
        ) : (
          <div className="health-rank-list">
            {healthRankData.map((item) => (
              <div key={item.id} className="health-rank-item">
                <span className="health-rank-name font-medium">{item.name}</span>
                <div className="health-rank-bar-track">
                  <div
                    className="health-rank-bar-fill"
                    style={{ width: `${item.health}%`, background: item.health >= 75 ? 'var(--color-success, #16a34a)' : item.health >= 50 ? 'var(--color-warning, #d97706)' : 'var(--color-risk, #dc2626)' }}
                  />
                </div>
                <span className="health-rank-value text-mono">{item.health}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid-2 mt-20">
        <Panel title="风险项目" subtitle="存在开放风险的项目">
          <DataTable columns={riskyColumns} data={reportModel.riskProjects} rowKey="id" emptyText="当前没有风险项目。" />
        </Panel>
        <Panel title="风险处置清单" subtitle="优先处理低健康度、高风险数项目">
          <ActionList items={reportModel.actionItems} />
          <div className="mt-16">
            <StatusBadge label={`开放风险 ${data.metrics.openRisks}`} variant={data.metrics.openRisks > 0 ? 'risk' : 'success'} />
          </div>
        </Panel>
      </div>
    </>
  );
}

function DeliveryReport({
  data,
  reportModel,
}: {
  data: DashboardData;
  reportModel: ReportModel;
}) {
  return (
    <div className="grid-2 mt-20">
      <Panel title="低进展需求" subtitle="按完成度升序">
        <DataTable
          columns={requirementColumns}
          data={reportModel.lowRequirements}
          rowKey="id"
          emptyText="暂无低进展需求。"
          defaultSortKey="completion"
        />
      </Panel>
      <RequirementProgressTable items={data.requirementProgress} />
    </div>
  );
}

function ActionList({ items }: { items: ReportActionItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => (
        <div key={item.title} className={`action-summary-item ${item.tone}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start' }}>
          <StatusBadge label={item.title} variant={item.tone === 'info' ? 'info' : item.tone} showDot={false} />
          <span style={{ lineHeight: 1.6 }}>{item.detail}</span>
        </div>
      ))}
    </div>
  );
}

function ProgressLine({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'success' | 'warning' | 'risk' | 'info' }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  const color = tone === 'success'
    ? 'var(--color-success)'
    : tone === 'warning'
      ? 'var(--color-warning)'
      : tone === 'risk'
        ? 'var(--color-risk)'
        : 'var(--color-info)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span className="font-medium">{label}</span>
        <span className="text-secondary text-mono">{value}/{total}</span>
      </div>
      <div className="health-rank-bar-track">
        <div className="health-rank-bar-fill" style={{ width: `${percent}%`, background: color }} />
      </div>
    </div>
  );
}

function RequirementProgressTable({ items }: { items: RequirementProgress[] }) {
  return (
    <Panel title="需求进度" subtitle="跟踪各需求完成情况">
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>暂无需求进度数据。</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.map((item) => (
            <div key={item.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="font-medium" style={{ minWidth: 0 }}>{item.title}</span>
                <span className="text-secondary text-mono">{item.completion}%</span>
              </div>
              <div className="text-secondary" style={{ fontSize: 12, marginBottom: 4 }}>{item.projectName}</div>
              <ProgressBar percent={item.completion} showPercent={false} height={6} />
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default ReportsPage;
