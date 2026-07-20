import { Package, Rocket } from 'lucide-react';
import ProgressBar from '../../../components/common/ProgressBar';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  formatDate,
  releaseReadiness,
  statusLabel,
  statusOptions,
  statusTone,
  type DeliveryRecord,
} from '../deliveryPageModel';

export default function DeliveryRecordList({
  records,
  onOpen,
  onStatus,
  onDelete,
  canManageDelivery,
}: {
  records: DeliveryRecord[];
  onOpen: (record: DeliveryRecord) => void;
  onStatus: (record: DeliveryRecord, status: string) => void;
  onDelete: (record: DeliveryRecord) => void;
  canManageDelivery: boolean;
}) {
  if (records.length === 0) {
    return <div className="delivery-empty-block">暂无匹配的交付记录。</div>;
  }
  return (
    <div className="delivery-record-list">
      {records.map((record) => (
        <div
          key={`${record.kind}-${record.id}`}
          className={`delivery-record-card ${record.kind}`}
          role="button"
          tabIndex={0}
          onClick={() => onOpen(record)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onOpen(record);
            }
          }}
        >
          <div className="delivery-record-icon">
            {record.kind === 'build' ? <Package size={18} /> : <Rocket size={18} />}
          </div>
          <div className="delivery-record-main">
            <div className="delivery-record-title">
              <span className="delivery-version">{record.version ? `v${record.version}` : record.id}</span>
              <strong>{record.title}</strong>
              <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
            </div>
            <div className="delivery-record-meta">
              <span>{record.kind === 'build' ? '项目' : '产品'}：{record.ownerLabel}</span>
              <span>{formatDate(record.date)}</span>
              {record.buildId ? <span>构建 {record.buildId}</span> : null}
            </div>
            {record.notes ? <p>{record.notes}</p> : null}
          </div>
          <div className="delivery-record-side">
            <div className="delivery-mini-metrics">
              <span>{record.linkedStories.length} 需求</span>
              <span>{record.linkedBugs.length} 缺陷</span>
              <span>{releaseReadiness(record)}% 就绪</span>
            </div>
            <ProgressBar percent={releaseReadiness(record)} height={6} showPercent={false} variant={statusTone(record)} />
          </div>
          {canManageDelivery ? (
            <div className="delivery-record-actions" onClick={(event) => event.stopPropagation()}>
              <select className="form-select form-select-xs" value={record.status} onChange={(event) => onStatus(record, event.target.value)}>
                {statusOptions(record.kind).map((status) => (
                  <option value={status} key={status}>{statusLabel(record.kind, status)}</option>
                ))}
              </select>
              <button className="btn btn-text btn-sm text-risk" onClick={() => onDelete(record)}>删除</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
