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
  if (loading) return <div className="delivery-empty-inline">加载中...</div>;
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
  if (loading) {
    return (
      <section className="delivery-report-section">
        <div className="delivery-empty-inline">发布报告生成中...</div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="delivery-report-section">
        <div className="form-error">发布报告加载失败。</div>
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
          <h3>发布报告</h3>
          <p>{report.summary || '暂无发布报告摘要。'}</p>
        </div>
        <StatusBadge status={gateReady ? 'passed' : 'blocked'} label={`${readyScore}%`} showDot={false} />
      </div>
      <div className="delivery-report-metrics">
        <DetailItem label="覆盖需求" value={`${metrics.requirementCount ?? 0}`} />
        <DetailItem label="关联缺陷" value={`${metrics.defectCount ?? 0}`} />
        <DetailItem label="未关闭缺陷" value={`${metrics.openDefectCount ?? 0}`} />
        <DetailItem label="审批记录" value={`${metrics.approvalCount ?? 0}`} />
        <DetailItem label="回滚记录" value={`${metrics.rollbackCount ?? 0}`} />
        <DetailItem label="审计记录" value={`${metrics.auditCount ?? 0}`} />
      </div>
      {report.build ? (
        <div className="delivery-report-linked">
          <span>关联构建</span>
          <strong>{report.build.id} · {report.build.name || '未命名构建'}</strong>
          <StatusBadge status={report.build.status || 'building'} label={statusLabel('build', report.build.status || 'building')} showDot={false} />
        </div>
      ) : null}
      {recommendations.length ? (
        <div className="delivery-report-list">
          <strong>复盘建议</strong>
          {recommendations.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <div className="delivery-report-list">
        <strong>最近审计</strong>
        {auditTrail.slice(0, 6).map((item) => (
          <span key={item.id}>{item.action} · {item.actorName || '未知'} · {formatDate(item.createdAt)}</span>
        ))}
        {auditTrail.length === 0 ? <span>暂无审计记录</span> : null}
      </div>
    </section>
  );
}
