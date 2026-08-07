import { Package, Rocket, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <div className="dl-record-list delivery-record-list">
      {records.length === 0 ? <div className="dl-empty delivery-empty-block">{t('features.delivery.deliveryRecordList.empty')}</div> : null}
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
                  {gate ? (gate.ready ? t('features.delivery.deliveryRecordList.gatePassed') : t('features.delivery.deliveryRecordList.gateBlocked')) : t('features.delivery.deliveryRecordList.readinessEstimate')}
                </span>
              </div>
              <div className="dl-record-meta delivery-record-meta">
                <span>{record.kind === 'build' ? t('features.delivery.deliveryRecordList.project') : t('features.delivery.deliveryRecordList.product')} · {record.ownerLabel}</span>
                <span>{formatDate(record.date)}</span>
                {record.buildId ? <span className="text-mono">{t('features.delivery.deliveryRecordList.build', { id: record.buildId })}</span> : null}
              </div>
              {record.notes ? <p className="dl-record-notes">{record.notes}</p> : null}
            </div>

            <div className="dl-record-side delivery-record-side">
              <div className="dl-mini-metrics delivery-mini-metrics">
                <span>{t('features.delivery.deliveryRecordList.storiesCount', { count: record.linkedStories.length })}</span>
                <span>{t('features.delivery.deliveryRecordList.bugsCount', { count: record.linkedBugs.length })}</span>
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
                  aria-label={t('features.delivery.deliveryRecordList.updateStatusAria', { name: record.title })}
                >
                  {statusOptions(record.kind).map((status) => (
                    <option value={status} key={status}>{statusLabel(record.kind, status)}</option>
                  ))}
                </select>
                <button
                  className="btn btn-text btn-xs dl-danger-btn"
                  onClick={() => onDelete(record)}
                  title={t('common.delete')}
                >
                  <Trash2 size={13} aria-hidden="true" /> {t('common.delete')}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
