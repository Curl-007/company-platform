import { useMemo } from 'react';
import { fetchAiSummary } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import MetricCard from '../components/common/MetricCard';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import type { AiSummary } from '../types';

// ---------------------------------------------------------------------------
// Extended AI data shape (the backend may return extra fields)
// ---------------------------------------------------------------------------

interface AiSummaryExtended extends AiSummary {
  metrics?: {
    todayAnalyses: number;
    pendingReview: number;
    documentParsing: number;
    logAnalysis: number;
    avgConfidence: number;
    writtenToBusiness: number;
  };
  modelRoutes?: Array<{
    scene: string;
    modelStrategy: string;
    status: string;
    humanReview: string;
    audit: string;
  }>;
  recentJobs?: Array<{
    jobId: string;
    scene: string;
    status: string;
    progress: number;
    currentStep: string;
  }>;
}

// ---------------------------------------------------------------------------
// Model routing columns
// ---------------------------------------------------------------------------

interface ModelRoute {
  scene: string;
  modelStrategy: string;
  status: string;
  humanReview: string;
  audit: string;
}

const routeColumns: DataTableColumn<ModelRoute>[] = [
  {
    key: 'scene',
    title: '场景',
    render: (r) => <span className="font-medium">{r.scene}</span>,
  },
  {
    key: 'modelStrategy',
    title: '模型策略',
    render: (r) => r.modelStrategy || '—',
  },
  {
    key: 'status',
    title: '状态',
    render: (r) => <StatusBadge label={r.status} status={r.status} />,
  },
  {
    key: 'humanReview',
    title: '人工审核',
    render: (r) => r.humanReview || '—',
  },
  {
    key: 'audit',
    title: '审计',
    render: (r) => r.audit || '—',
  },
];

// ---------------------------------------------------------------------------
// Recent jobs columns
// ---------------------------------------------------------------------------

interface RecentJob {
  jobId: string;
  scene: string;
  status: string;
  progress: number;
  currentStep: string;
}

const jobColumns: DataTableColumn<RecentJob>[] = [
  {
    key: 'jobId',
    title: '任务 ID',
    render: (j) => <span className="text-mono">{j.jobId.slice(0, 8)}</span>,
  },
  {
    key: 'scene',
    title: '场景',
    render: (j) => j.scene,
  },
  {
    key: 'status',
    title: '状态',
    render: (j) => <StatusBadge label={j.status} status={j.status} />,
  },
  {
    key: 'progress',
    title: '进度',
    align: 'center',
    render: (j) => <span className="text-mono">{j.progress}%</span>,
  },
  {
    key: 'currentStep',
    title: '当前步骤',
    render: (j) => j.currentStep || '—',
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AiPage() {
  const { data, loading, error, reload } = useAsync<AiSummaryExtended>(fetchAiSummary, []);

  const metrics = useMemo(() => {
    if (!data?.metrics) return null;
    const m = data.metrics;
    return [
      { label: '今日分析数', value: m.todayAnalyses, trend: '过去 24 小时', direction: 'flat' as const },
      { label: '待审核', value: m.pendingReview, trend: '需要人工确认', direction: m.pendingReview > 0 ? ('down' as const) : ('flat' as const) },
      { label: '文档解析', value: m.documentParsing, trend: '正在处理的文档', direction: 'flat' as const },
      { label: '日志分析', value: m.logAnalysis, trend: '工作日志分析任务', direction: 'flat' as const },
      { label: '平均置信度', value: `${m.avgConfidence}%`, trend: 'AI 分析可信度', direction: m.avgConfidence >= 80 ? ('up' as const) : ('down' as const) },
      { label: '已写入业务', value: m.writtenToBusiness, trend: 'AI 结果已落库', direction: 'up' as const },
    ];
  }, [data]);

  if (loading || error || !data) {
    return (
      <div>
        <PageHeader title="AI 分析中心" description="查看 AI 分析指标、模型路由策略与近期任务。" />
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="AI 分析中心" description="查看 AI 分析指标、模型路由策略与近期任务。" />

      {metrics && (
        <div className="metric-grid">
          {metrics.map((card) => (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              trend={card.trend}
              trendDirection={card.direction}
            />
          ))}
        </div>
      )}

      <div className="grid-2 mt-20">
        <Panel title="AI 洞察摘要" subtitle={data.title || '综合分析报告'}>
          <p className="body-text" style={{ marginTop: 0 }}>{data.summary}</p>

          {data.risks.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-title">风险识别</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {data.risks.map((risk, index) => (
                  <li key={index} className="body-text" style={{ marginBottom: 4 }}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {data.recommendations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="section-title">建议措施</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {data.recommendations.map((rec, index) => (
                  <li key={index} className="body-text" style={{ marginBottom: 4 }}>{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {data.modelRoutes && data.modelRoutes.length > 0 && (
          <Panel title="模型路由" subtitle="各场景模型策略与审核配置">
            <DataTable
              columns={routeColumns}
              data={data.modelRoutes}
              rowKey="scene"
              emptyText="暂无模型路由配置。"
            />
          </Panel>
        )}
      </div>

      {data.recentJobs && data.recentJobs.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <Panel title="近期 AI 任务" subtitle="最近执行的 AI 分析任务">
            <DataTable
              columns={jobColumns}
              data={data.recentJobs}
              rowKey="jobId"
              emptyText="暂无近期任务。"
            />
          </Panel>
        </div>
      )}
    </div>
  );
}

export default AiPage;
