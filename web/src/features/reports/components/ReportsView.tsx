import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        label: t('features.reports.reportsView.avgProjectHealth'),
        icon: Gauge,
        value: m.projectHealthAverage,
        caption: m.projectHealthAverage >= 75 ? t('features.reports.reportsView.overallHealthy') : t('features.reports.reportsView.needsAttention'),
        tone: m.projectHealthAverage >= 75 ? '' : 'is-warn',
      },
      {
        label: t('features.reports.reportsView.requirementCompletionRate'),
        icon: Target,
        value: `${m.requirementCompletionAverage}%`,
        caption: t('features.reports.reportsView.crossProjectAverage'),
        tone: 'is-info',
      },
      {
        label: t('features.reports.reportsView.testPassRate'),
        icon: CheckCircle2,
        value: `${m.testPassRate}%`,
        caption: m.testPassRate >= 90 ? t('features.reports.reportsView.metTarget') : t('features.reports.reportsView.belowTarget'),
        tone: m.testPassRate >= 90 ? '' : 'is-risk',
      },
      {
        label: t('features.reports.reportsView.documentCount'),
        icon: FileText,
        value: m.documentCount,
        caption: t('features.reports.reportsView.documentTotal'),
        tone: '',
      },
      {
        label: t('features.reports.reportsView.openRisks'),
        icon: ShieldAlert,
        value: m.openRisks,
        caption: t('features.reports.reportsView.allProjectsCumulative'),
        tone: m.openRisks > 0 ? 'is-risk' : '',
      },
    ];
  }, [data, t]);

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
      <section className="reports-signal-strip" aria-label={t('features.reports.reportsView.signalStripAria')}>
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
        <div className="nav-tabs reports-view-tabs" role="tablist" aria-label={t('features.reports.reportsView.viewTabsAria')}>
          {[
            { key: 'overview', label: t('features.reports.reportModel.viewOverview'), icon: BarChart3 },
            { key: 'risk', label: t('features.reports.reportModel.viewRisk'), icon: AlertTriangle },
            { key: 'delivery', label: t('features.reports.reportModel.viewDelivery'), icon: Target },
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
            {t('features.reports.reportsView.refresh')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleExport}>
            <Download size={14} aria-hidden="true" />
            {t('features.reports.reportsView.export')}
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
