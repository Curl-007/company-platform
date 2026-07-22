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
import { fetchDashboard } from '../../dashboard/api';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import PageHeader from '../../../components/common/PageHeader';
import PageState from '../../../components/common/PageState';
import MetricCard from '../../../components/common/MetricCard';
import type { DashboardData } from '../../../types';
import { canOperate } from '../../../constants/roles';
import {
  buildHealthRankData,
  buildReportModel,
  exportReportCsv,
  type ReportView,
} from '../reportModel';
import ReportAiInsight from './ReportAiInsight';
import OverviewReport from './OverviewReport';
import RiskReport from './RiskReport';
import DeliveryReport from './DeliveryReport';

export default function ReportsView() {
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

  const healthRankData = useMemo(() => (data ? buildHealthRankData(data) : []), [data]);
  const reportModel = useMemo(() => (data ? buildReportModel(data) : null), [data]);

  const handleExport = () => {
    if (!data || !reportModel) return;
    exportReportCsv(data, reportModel, view);
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
