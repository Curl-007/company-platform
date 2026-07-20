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
  if (items.length === 0) return <div className="delivery-empty-inline">{empty}</div>;
  return <div className="delivery-tag-list">{items.map((item) => <span key={item}>{item}</span>)}</div>;
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
  return (
    <section className="delivery-report-section">
      <div className="delivery-report-head">
        <div>
          <h3>发布报告</h3>
          <p>{report.summary}</p>
        </div>
        <StatusBadge status={report.gate.ready ? 'passed' : 'blocked'} label={`${report.metrics.readyScore}%`} showDot={false} />
      </div>
      <div className="delivery-report-metrics">
        <DetailItem label="覆盖需求" value={`${report.metrics.requirementCount}`} />
        <DetailItem label="关联缺陷" value={`${report.metrics.defectCount}`} />
        <DetailItem label="未关闭缺陷" value={`${report.metrics.openDefectCount}`} />
        <DetailItem label="审批记录" value={`${report.metrics.approvalCount}`} />
        <DetailItem label="回滚记录" value={`${report.metrics.rollbackCount}`} />
        <DetailItem label="审计记录" value={`${report.metrics.auditCount}`} />
      </div>
      {report.build ? (
        <div className="delivery-report-linked">
          <span>关联构建</span>
          <strong>{report.build.id} · {report.build.name}</strong>
          <StatusBadge status={report.build.status} label={statusLabel('build', report.build.status)} showDot={false} />
        </div>
      ) : null}
      {report.recommendations.length ? (
        <div className="delivery-report-list">
          <strong>复盘建议</strong>
          {report.recommendations.map((item) => <span key={item}>{item}</span>)}
        </div>
      ) : null}
      <div className="delivery-report-list">
        <strong>最近审计</strong>
        {report.auditTrail.slice(0, 6).map((item) => (
          <span key={item.id}>{item.action} · {item.actorName || '未知'} · {formatDate(item.createdAt)}</span>
        ))}
        {report.auditTrail.length === 0 ? <span>暂无审计记录</span> : null}
      </div>
    </section>
  );
}
