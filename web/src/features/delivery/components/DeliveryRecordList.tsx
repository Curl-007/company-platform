import { Package, Rocket, Trash2 } from 'lucide-react';
import ProgressBar from '../../../components/common/ProgressBar';
import StatusBadge from '../../../components/common/StatusBadge';
import type { DeliveryGateResult } from '../../../types';
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
  gateMap,
  onOpen,
  onStatus,
  onDelete,
  canManageDelivery,
}: {
  records: DeliveryRecord[];
  gateMap?: Map<string, DeliveryGateResult>;
  onOpen: (record: DeliveryRecord) => void;
  onStatus: (record: DeliveryRecord, status: string) => void;
  onDelete: (record: DeliveryRecord) => void;
  canManageDelivery: boolean;
}) {
  return (
    <div className="dl-record-list delivery-record-list">
      {records.length === 0 ? <div className="dl-empty delivery-empty-block">暂无匹配的交付记录。</div> : null}
      {records.map((record) => {
        const gate = gateMap?.get(`${record.kind}:${record.id}`);
        const readiness = gate?.score ?? releaseReadiness(record);
        const gateReady = gate ? gate.ready : readiness >= 80;
        return (
          <div
            key={`${record.kind}-${record.id}`}
            className={`dl-record-card delivery-record-card ${record.kind}`}
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
            <div className={`dl-record-icon delivery-record-icon ${record.kind}`}>
              {record.kind === 'build' ? <Package size={16} aria-hidden="true" /> : <Rocket size={16} aria-hidden="true" />}
            </div>

            <div className="dl-record-main delivery-record-main">
              <div className="dl-record-title delivery-record-title">
                <span className="dl-version delivery-version text-mono">
                  {record.version ? `v${record.version}` : record.id}
                </span>
                <strong className="dl-record-name" title={record.title}>{record.title}</strong>
                <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
                <span className={`dl-gate-chip ${gateReady ? 'is-ready' : 'is-blocked'}`}>
                  {gate ? (gate.ready ? '门禁通过' : '门禁阻断') : '就绪预估'}
                </span>
              </div>
              <div className="dl-record-meta delivery-record-meta">
                <span>{record.kind === 'build' ? '项目' : '产品'} · {record.ownerLabel}</span>
                <span>{formatDate(record.date)}</span>
                {record.buildId ? <span className="text-mono">构建 {record.buildId}</span> : null}
              </div>
              {record.notes ? <p className="dl-record-notes">{record.notes}</p> : null}
            </div>

            <div className="dl-record-side delivery-record-side">
              <div className="dl-mini-metrics delivery-mini-metrics">
                <span>{record.linkedStories.length} 需求</span>
                <span>{record.linkedBugs.length} 缺陷</span>
                <strong className="text-mono">{readiness}%</strong>
              </div>
              <ProgressBar percent={readiness} height={6} showPercent={false} variant={statusTone(record)} />
              {gate?.summary ? <em className="dl-gate-summary">{gate.summary}</em> : null}
            </div>

            {canManageDelivery ? (
              <div className="dl-record-actions delivery-record-actions" onClick={(event) => event.stopPropagation()}>
                <select
                  className="form-select form-select-xs dl-inline-select"
                  value={record.status}
                  onChange={(event) => onStatus(record, event.target.value)}
                  aria-label={`更新 ${record.title} 状态`}
                >
                  {statusOptions(record.kind).map((status) => (
                    <option value={status} key={status}>{statusLabel(record.kind, status)}</option>
                  ))}
                </select>
                <button
                  className="btn btn-text btn-xs dl-danger-btn"
                  onClick={() => onDelete(record)}
                  title="删除"
                >
                  <Trash2 size={13} aria-hidden="true" /> 删除
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
