import { useMemo, useState, type ReactNode } from 'react';
import { ListChecks, HeartPulse, FlaskConical } from 'lucide-react';
import { fetchDashboard } from '../features/dashboard/api';
import { sendAiChat } from '../features/ai/api';
import { ApiError } from '../services/api';
import { getSessionUser } from '../services/auth';
import { fallbackDashboard } from '../data/fallback';
import { useAsync } from '../hooks/useAsync';
import MetricCard, { type MetricCardTone } from '../components/common/MetricCard';
import DonutChart from '../components/common/DonutChart';
import Panel from '../components/common/Panel';
import PageHeader from '../components/common/PageHeader';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import PageState from '../components/common/PageState';
import type { DashboardData, Task, Project, RequirementProgress } from '../types';
import {
  healthVariant,
  HEALTH_THRESHOLD_OK,
  TASK_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  labelOf,
} from '../constants/enums';
import { canOperate } from '../constants/roles';

const ACTION_TASK_LIMIT = 12;

function buildDashboardAiPrompt(data: DashboardData): string {
  const taskCounts = Object.entries(data.metrics.tasks)
    .map(([status, count]) => `${labelOf(TASK_STATUS_LABELS, status)} ${count}`)
    .join('、');
  const actionTasks = data.focusTasks
    .filter((task) => !['done', 'cancelled'].includes(task.status))
    .slice(0, 10)
    .map((task) => `${task.id} ${task.title} / ${labelOf(TASK_STATUS_LABELS, task.status)} / ${task.owner || '未分配'} / ${task.dueDate || '未设截止'} / ${task.progress ?? 0}%`);
  const riskyProjects = data.riskyProjects
    .slice(0, 8)
    .map((project) => `${project.id} ${project.name} / ${labelOf(PROJECT_STATUS_LABELS, project.status)} / 健康 ${project.healthScore} / 风险 ${project.riskCount} / 进度 ${project.progress}%`);
  const requirements = data.requirementProgress
    .slice(0, 8)
    .map((item) => `${item.id} ${item.title} / ${item.projectName} / 完成 ${item.completion}%`);

  return [
    '请作为公司项目管理平台的 AI 管理参谋，基于下面仪表盘快照给出管理层行动建议。',
    '请控制在 800 字以内，输出：1. 当前经营判断 2. 最大风险 3. 本周优先动作 4. 需要项目经理补齐的数据。',
    '建议必须具体到项目、任务、需求或指标，不要泛泛而谈。',
    '',
    `任务总数：${data.metrics.tasks.total}，任务状态分布：${taskCounts || '无'}`,
    `项目平均健康度：${data.metrics.projectHealthAverage}`,
    `需求平均完成率：${data.metrics.requirementCompletionAverage}%`,
    `测试通过率：${data.metrics.testPassRate}%`,
    `开放风险：${data.metrics.openRisks}`,
    `文档总数：${data.metrics.documentCount}`,
    '',
    '优先行动任务：',
    actionTasks.length ? actionTasks.join('\n') : '暂无待处理任务',
    '',
    '风险项目：',
    riskyProjects.length ? riskyProjects.join('\n') : '暂无风险项目',
    '',
    '需求推进：',
    requirements.length ? requirements.join('\n') : '暂无需求推进数据',
  ].join('\n');
}

const taskColumns: DataTableColumn<Task>[] = [
  {
    key: 'title',
    title: '任务',
    render: (task) => <span className="font-medium">{task.title}</span>,
  },
  {
    key: 'status',
    title: '状态',
    render: (task) => <StatusBadge label={labelOf(TASK_STATUS_LABELS, task.status)} status={task.status} />,
  },
  { key: 'owner', title: '负责人', render: (task) => task.owner || '未分配' },
  { key: 'dueDate', title: '截止日期', render: (task) => task.dueDate || '未设置' },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (task) => <ProgressBar percent={task.progress ?? 0} height={6} />,
  },
];

const riskyColumns: DataTableColumn<Project>[] = [
  {
    key: 'name',
    title: '项目',
    render: (project) => <span className="font-medium">{project.name}</span>,
  },
  {
    key: 'status',
    title: '状态',
    render: (project) => (
      <StatusBadge label={labelOf(PROJECT_STATUS_LABELS, project.status)} status={project.status} />
    ),
  },
  {
    key: 'healthScore',
    title: '健康度',
    align: 'center',
    render: (project) => (
      <StatusBadge label={String(project.healthScore)} variant={healthVariant(project.healthScore)} showDot={false} />
    ),
  },
  {
    key: 'riskCount',
    title: '风险数',
    align: 'center',
    render: (project) => <span className="text-mono">{project.riskCount}</span>,
  },
  {
    key: 'progress',
    title: '进度',
    width: 160,
    render: (project) => <ProgressBar percent={project.progress ?? 0} height={6} />,
  },
];

function DashboardPage() {
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchDashboard, []);
  const dashboard = data ?? (error ? fallbackDashboard : null);
  const currentUser = getSessionUser();
  const canUseAi = canOperate(currentUser, 'ai:analyze');

  const heroCards = useMemo(() => {
    if (!dashboard) return [];
    const { metrics } = dashboard;
    const completed = metrics.tasks.done ?? 0;
    const blocked = metrics.tasks.blocked ?? 0;

    const cards: Array<{
      label: string;
      value: string | number;
      icon: ReactNode;
      tone: MetricCardTone;
      trend: string;
      direction: 'up' | 'down' | 'flat';
    }> = [
      {
        label: '活跃任务',
        value: metrics.tasks.total,
        icon: <ListChecks size={16} />,
        tone: 'info',
        trend: `${completed} 已完成 · ${blocked} 阻塞中`,
        direction: 'flat',
      },
      {
        label: '项目平均健康度',
        value: metrics.projectHealthAverage,
        icon: <HeartPulse size={16} />,
        tone: metrics.projectHealthAverage >= HEALTH_THRESHOLD_OK ? 'success' : 'warning',
        trend: metrics.projectHealthAverage >= HEALTH_THRESHOLD_OK ? '整体稳定' : '需要关注',
        direction: metrics.projectHealthAverage >= HEALTH_THRESHOLD_OK ? 'up' : 'down',
      },
      {
        label: '测试通过率',
        value: `${metrics.testPassRate}%`,
        icon: <FlaskConical size={16} />,
        tone: metrics.testPassRate >= 90 ? 'success' : 'risk',
        trend: metrics.testPassRate >= 90 ? '达到目标' : '低于目标',
        direction: metrics.testPassRate >= 90 ? 'up' : 'down',
      },
    ];

    return cards;
  }, [dashboard]);

  const secondaryStats = useMemo(() => {
    if (!dashboard) return [];
    const { metrics } = dashboard;
    return [
      { label: '需求完成率', value: `${metrics.requirementCompletionAverage}%`, direction: 'flat' as const },
      { label: '开放风险', value: metrics.openRisks, direction: metrics.openRisks > 0 ? ('down' as const) : ('flat' as const) },
      { label: '文档总数', value: metrics.documentCount, direction: 'flat' as const },
    ];
  }, [dashboard]);

  const actionQueue = useMemo(() => {
    if (!dashboard) return { tasks: [] as Task[], blocked: 0, overdue: 0, inFlight: 0, review: 0 };
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const isOverdue = (task: Task) => {
      if (!task.dueDate) return false;
      const due = new Date(task.dueDate);
      return !Number.isNaN(due.getTime()) && due <= today && !['done', 'cancelled'].includes(task.status);
    };

    const weight = (task: Task) => {
      if (task.status === 'blocked') return 0;
      if (isOverdue(task)) return 1;
      if (['code_review', 'testing', 'acceptance'].includes(task.status)) return 2;
      if (task.status === 'in_progress') return 3;
      if (task.status === 'todo') return 4;
      return 9;
    };

    const activeTasks = dashboard.focusTasks
      .filter((task) => !['done', 'cancelled'].includes(task.status))
      .sort((a, b) => {
        const priority = weight(a) - weight(b);
        if (priority !== 0) return priority;
        return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
      });

    return {
      tasks: activeTasks.slice(0, ACTION_TASK_LIMIT),
      blocked: activeTasks.filter((task) => task.status === 'blocked').length,
      overdue: activeTasks.filter(isOverdue).length,
      inFlight: activeTasks.filter((task) => task.status === 'in_progress').length,
      review: activeTasks.filter((task) => ['code_review', 'testing', 'acceptance'].includes(task.status)).length,
    };
  }, [dashboard]);

  if (loading) {
    return (
      <PageHeaderShell>
        <PageState loading error={null} onRetry={reload} />
      </PageHeaderShell>
    );
  }

  if (!dashboard) {
    return (
      <PageHeaderShell>
        <PageState loading={false} error={error} onRetry={reload} />
      </PageHeaderShell>
    );
  }

  return (
    <PageHeaderShell>
      {error && (
        <div className="helper-text" style={{ marginBottom: 12, color: 'var(--color-warning, #BF8700)' }}>
          当前展示的是离线兜底数据，暂时未连接到实时接口。
        </div>
      )}

      <div className="kpi-hero-grid">
        {heroCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            tone={card.tone}
            size="hero"
            trend={card.trend}
            trendDirection={card.direction}
          />
        ))}
      </div>

      <div className="kpi-secondary">
        {secondaryStats.map((stat) => (
          <div key={stat.label} className="kpi-secondary-item">
            <span className="kpi-secondary-label">{stat.label}</span>
            <span className={`kpi-secondary-value ${stat.direction}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      <Panel title="健康概览" subtitle="关键指标的环形可视化" className="mt-20">
        <div className="donut-row">
          <div className="donut-cell">
            <DonutChart value={dashboard.metrics.projectHealthAverage} label="项目健康" size={130} />
            <span className="donut-caption">项目平均健康度</span>
          </div>
          <div className="donut-cell">
            <DonutChart value={dashboard.metrics.testPassRate} label="测试通过" size={130} />
            <span className="donut-caption">测试通过率</span>
          </div>
          <div className="donut-cell">
            <DonutChart value={dashboard.metrics.requirementCompletionAverage} label="需求完成" size={130} />
            <span className="donut-caption">需求完成率</span>
          </div>
        </div>
      </Panel>

      <div className="grid-2-1 mt-20">
        <div className="stack">
          <Panel
            title="今日行动队列"
            subtitle={`默认展示前 ${ACTION_TASK_LIMIT} 条，优先阻塞、逾期、评审与进行中事项`}
          >
            <div className="action-summary-row">
              <ActionSummaryItem label="阻塞" value={actionQueue.blocked} tone="risk" />
              <ActionSummaryItem label="逾期/今日到期" value={actionQueue.overdue} tone="warning" />
              <ActionSummaryItem label="进行中" value={actionQueue.inFlight} tone="info" />
              <ActionSummaryItem label="待确认" value={actionQueue.review} tone="success" />
            </div>
            <DataTable
              columns={taskColumns}
              data={actionQueue.tasks}
              rowKey="id"
              emptyText="当前没有需要优先处理的任务。"
            />
          </Panel>

          <Panel title="风险项目" subtitle="以下项目存在开放风险或健康度偏低">
            <DataTable
              columns={riskyColumns}
              data={dashboard.riskyProjects}
              rowKey="id"
              emptyText="当前没有标记为风险的项目。"
            />
          </Panel>
        </div>

        <div className="stack">
          {canUseAi ? <DashboardAiAdvisor data={dashboard} /> : null}
          <AiSummaryPanel data={dashboard} />
          <RequirementProgressPanel items={dashboard.requirementProgress} />
        </div>
      </div>
    </PageHeaderShell>
  );
}

function ActionSummaryItem({ label, value, tone }: { label: string; value: number; tone: 'risk' | 'warning' | 'info' | 'success' }) {
  return (
    <div className={`action-summary-item ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PageHeaderShell({ children }: { children: ReactNode }) {
  return (
    <div>
      <PageHeader
        title="工作台"
        description="集中查看任务、项目健康度、需求推进和 AI 总结。"
      />
      {children}
    </div>
  );
}

function DashboardAiAdvisor({ data }: { data: DashboardData }) {
  const [aiAdvice, setAiAdvice] = useState('');
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
            content: buildDashboardAiPrompt(data),
          },
        ],
        scope: 'dashboard-management-advice',
        currentPage: 'dashboard',
      });
      setAiAdvice(reply.content);
    } catch (err: unknown) {
      setAiError(err instanceof ApiError ? err.message : 'AI 管理建议生成失败，请检查模型配置或稍后重试。');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Panel
      title="AI 管理参谋"
      subtitle="基于当前 KPI、行动队列、风险项目和需求推进生成"
      toolbar={(
        <button className="btn btn-primary btn-sm" onClick={handleAnalyze} disabled={aiLoading}>
          {aiLoading ? 'AI 分析中...' : aiAdvice ? '重新分析' : '生成建议'}
        </button>
      )}
    >
      <div className="dashboard-ai-signal-grid">
        <span>健康 {data.metrics.projectHealthAverage}</span>
        <span>需求 {data.metrics.requirementCompletionAverage}%</span>
        <span>测试 {data.metrics.testPassRate}%</span>
        <span>风险 {data.metrics.openRisks}</span>
      </div>
      {(aiAdvice || aiLoading || aiError) ? (
        <div className="dashboard-ai-result">
          {aiLoading ? <div className="body-text">AI 正在分析经营指标、任务阻塞和项目风险，请稍候...</div> : null}
          {aiError ? <div className="form-error">{aiError}</div> : null}
          {aiAdvice ? <div className="dashboard-ai-content">{aiAdvice}</div> : null}
        </div>
      ) : (
        <p className="body-text dashboard-ai-empty">点击生成后，会给出本周优先动作、风险处置和需要补齐的数据。</p>
      )}
    </Panel>
  );
}

function AiSummaryPanel({ data }: { data: DashboardData }) {
  const { ai } = data;
  return (
    <Panel title={ai.title || 'AI 总结'} subtitle="面向当前工作区的自动摘要">
      <p className="body-text" style={{ marginTop: 0 }}>{ai.summary}</p>

      {ai.risks.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">风险提醒</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {ai.risks.map((risk, index) => (
              <li key={index} className="body-text" style={{ marginBottom: 4 }}>{risk}</li>
            ))}
          </ul>
        </div>
      )}

      {ai.recommendations.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="section-title">建议动作</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {ai.recommendations.map((item, index) => (
              <li key={index} className="body-text" style={{ marginBottom: 4 }}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function RequirementProgressPanel({ items }: { items: RequirementProgress[] }) {
  return (
    <Panel title="需求推进" subtitle="跟踪进行中的需求完成情况">
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>当前没有进行中的需求。</p>
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

export default DashboardPage;
