import { useTranslation } from 'react-i18next';
import StatusBadge from '../../../components/common/StatusBadge';
import type { ReleaseReport } from '../../../types';
import { formatDate, statusLabel } from '../deliveryPageModel';

export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="delivery-detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function TagList({ items, empty }: { items: string[]; empty: string }) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return <div className="delivery-empty-inline">{empty}</div>;
  return <div className="delivery-tag-list">{list.map((item) => <span key={item}>{item}</span>)}</div>;
}

export function RecordList({
  loading,
  empty,
  records,
}: {
  loading: boolean;
  empty: string;
  records: Array<{ id: string; title: string; meta: string; body: string }>;
}) {
  const { t } = useTranslation();
  if (loading) return <div className="delivery-empty-inline">{t('common.loading')}</div>;
  if (records.length === 0) return <div className="delivery-empty-inline">{empty}</div>;
  return (
    <div className="delivery-governance-records">
      {records.map((record) => (
        <div className="delivery-governance-record" key={record.id}>
          <div>
            <strong>{record.title}</strong>
            <span>{record.meta}</span>
          </div>
          <p>{record.body}</p>
        </div>
      ))}
    </div>
  );
}

export function ReleaseReportSection({ report, loading, error }: { report?: ReleaseReport | null; loading: boolean; error: unknown }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <section className="delivery-report-section">
        <div className="delivery-empty-inline">{t('features.delivery.deliveryDetailParts.reportGenerating')}</div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="delivery-report-section">
        <div className="form-error">{t('features.delivery.deliveryDetailParts.reportLoadFailed')}</div>
      </section>
    );
  }
  if (!report) return null;

  const metrics = report.metrics ?? {
    requirementCount: 0,
    defectCount: 0,
    openDefectCount: 0,
    approvalCount: 0,
    rollbackCount: 0,
    auditCount: 0,
    readyScore: 0,
  };
  const gateReady = Boolean(report.gate?.ready);
  const readyScore = metrics.readyScore ?? report.gate?.score ?? 0;
  const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];
  const auditTrail = Array.isArray(report.auditTrail) ? report.auditTrail : [];

  return (
    <section className="delivery-report-section">
      <div className="delivery-report-head">
        <div>
          <h3>{t('features.delivery.deliveryDetailParts.reportTitle')}</h3>
          <p>{report.summary || t('features.delivery.deliveryDetailParts.noReportSummary')}</p>
        </div>
        <StatusBadge status={gateReady ? 'passed' : 'blocked'} label={`${readyScore}%`} showDot={false} />
      </div>
      <div className="delivery-report-metrics">
        <DetailItem label={t('features.delivery.deliveryDetailParts.coveredRequirements')} value={`${metrics.requirementCount ?? 0}`} />
        <DetailItem label={t('features.delivery.deliveryDetailParts.linkedDefects')} value={`${metrics.defectCount ?? 0}`} />
        <DetailItem label={t('features.delivery.deliveryDetailParts.openDefects')} value={`${metrics.openDefectCount ?? 0}`} />
        <DetailItem label={t('features.delivery.deliveryDetailParts.approvals')} value={`${metrics.approvalCount ?? 0}`} />
        <DetailItem label={t('features.delivery.deliveryDetailParts.rollbacks')} value={`${metrics.rollbackCount ?? 0}`} />
        <DetailItem label={t('features.delivery.deliveryDetailParts.auditRecords')} value={`${metrics.auditCount ?? 0}`} />
      </div>
      {report.build ? (
        <div className="delivery-report-linked">
          <span>{t('features.delivery.deliveryDetailParts.linkedBuild')}</span>
          <strong>{report.build.id} · {report.build.name || t('features.delivery.deliveryDetailParts.unnamedBuild')}</strong>
          <StatusBadge status={report.build.status || 'building'} label={statusLabel('build', report.build.status || 'building')} showDot={false} />
        </div>
      ) : null}
      {recommendations.length ? (
        <div className="delivery-report-list">
          <strong>{t('features.delivery.deliveryDetailParts.recommendations')}</strong>
          {recommendations.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <div className="delivery-report-list">
        <strong>{t('features.delivery.deliveryDetailParts.recentAudit')}</strong>
        {auditTrail.slice(0, 6).map((item) => (
          <span key={item.id}>{t('features.delivery.deliveryDetailParts.auditItem', { action: item.action, actor: item.actorName || t('features.delivery.deliveryDetailParts.unknown'), date: formatDate(item.createdAt) })}</span>
        ))}
        {auditTrail.length === 0 ? <span>{t('features.delivery.deliveryDetailParts.noAuditRecords')}</span> : null}
      </div>
    </section>
  );
}
