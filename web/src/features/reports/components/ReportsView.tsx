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
import PageState from '../../../components/common/PageState';
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

type SignalTone = '' | 'is-warn' | 'is-risk' | 'is-info';

interface ReportsSignal {
  label: string;
  icon: typeof Gauge;
  value: string | number;
  caption: string;
  tone: SignalTone;
}

export default function ReportsView() {
  const { data, loading, error, reload } = useAsync<DashboardData>(fetchDashboard, [], { cacheKey: 'dashboard:overview' });
  const [view, setView] = useState<ReportView>('overview');
  const currentUser = getSessionUser();
  const canUseAi = canOperate(currentUser, 'ai:analyze');

  // Compact KPI signals mirroring the doc-workbench signal strip:
  // (label / value / caption) triad with an emphasis tone per card.
  const signals = useMemo<ReportsSignal[]>(() => {
    if (!data) return [];
    const m = data.metrics;
    return [
      {
        label: '项目平均健康度',
        icon: Gauge,
        value: m.projectHealthAverage,
        caption: m.projectHealthAverage >= 75 ? '整体健康' : '需要关注',
        tone: m.projectHealthAverage >= 75 ? '' : 'is-warn',
      },
      {
        label: '需求完成率',
        icon: Target,
        value: `${m.requirementCompletionAverage}%`,
        caption: '跨项目平均完成水平',
        tone: 'is-info',
      },
      {
        label: '测试通过率',
        icon: CheckCircle2,
        value: `${m.testPassRate}%`,
        caption: m.testPassRate >= 90 ? '达到目标' : '低于目标',
        tone: m.testPassRate >= 90 ? '' : 'is-risk',
      },
      {
        label: '文档数量',
        icon: FileText,
        value: m.documentCount,
        caption: '文档中心总量',
        tone: '',
      },
      {
        label: '开放风险',
        icon: ShieldAlert,
        value: m.openRisks,
        caption: '全部项目累计',
        tone: m.openRisks > 0 ? 'is-risk' : '',
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
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <div className="reports-workbench reports-page">
      <section className="reports-signal-strip" aria-label="报表指标概况">
        {signals.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className={`reports-signal ${item.tone}`.trim()}>
              <span className="reports-signal-label">
                <Icon size={13} aria-hidden="true" /> {item.label}
              </span>
              <strong>{item.value}</strong>
              <em>{item.caption}</em>
            </div>
          );
        })}
      </section>

      {canUseAi && reportModel ? (
        <ReportAiInsight data={data} reportModel={reportModel} view={view} />
      ) : null}

      <div className="reports-toolbar">
        <div className="nav-tabs reports-view-tabs" role="tablist" aria-label="报表视图">
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
                <Icon size={15} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="reports-toolbar-actions">
          <button className="btn btn-secondary btn-sm" onClick={reload}>
            <RefreshCw size={14} aria-hidden="true" />
            刷新
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleExport}>
            <Download size={14} aria-hidden="true" />
            导出
          </button>
        </div>
      </div>

      <div className="reports-view-body">
        {view === 'overview' && reportModel ? (
          <OverviewReport data={data} reportModel={reportModel} />
        ) : null}
        {view === 'risk' && reportModel ? (
          <RiskReport data={data} reportModel={reportModel} healthRankData={healthRankData} />
        ) : null}
        {view === 'delivery' && reportModel ? (
          <DeliveryReport data={data} reportModel={reportModel} />
        ) : null}
      </div>
    </div>
  );
}
