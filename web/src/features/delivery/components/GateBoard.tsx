import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../../../components/common/StatusBadge';
import type { DeliveryGateResult } from '../../../types';
import {
  releaseReadiness,
  statusLabel,
  type DeliveryRecord,
} from '../deliveryPageModel';

export function GateLine({ label, value, passed }: { label: string; value: string; passed: boolean }) {
  return (
    <div className={`dl-gate-line delivery-gate-line ${passed ? 'passed' : 'blocked'}`}>
      <span>
        {passed ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
        {label}
      </span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

export default function GateBoard({
  records,
  gateMap,
  onOpen,
}: {
  records: DeliveryRecord[];
  gateMap: Map<string, DeliveryGateResult>;
  onOpen: (record: DeliveryRecord) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="dl-gate-board delivery-gate-board">
      {records.map((record) => {
        const gate = gateMap.get(`${record.kind}:${record.id}`);
        const score = gate?.score ?? releaseReadiness(record);
        return (
          <button
            className={`dl-gate-card delivery-gate-card ${gate?.ready ? 'ready' : 'blocked'}`}
            key={`${record.kind}-${record.id}`}
            onClick={() => onOpen(record)}
          >
            <div className="dl-gate-head delivery-gate-head">
              <span className="dl-version delivery-version text-mono">
                {record.version ? `v${record.version}` : record.id}
              </span>
              <strong className="dl-gate-title" title={record.title}>{record.title}</strong>
              <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
            </div>

            <div className="dl-gate-summary-row delivery-gate-summary">
              <span>{gate?.summary ?? t('features.delivery.gateBoard.readingGateResult')}</span>
              <strong className="text-mono">{score}%</strong>
            </div>

            <div className="dl-gate-lines">
              {(gate?.gates ?? []).map((line) => (
                <GateLine key={line.id} label={line.label} passed={line.passed} value={line.message} />
              ))}
              {!gate ? <GateLine label={t('features.delivery.gateBoard.gatePrecheck')} passed={false} value={t('features.delivery.gateBoard.precheckUnavailable')} /> : null}
            </div>

            <div className="dl-linked-list delivery-linked-list">
              {record.linkedStories.slice(0, 3).map((item) => <span key={item}>{t('features.delivery.gateBoard.requirement', { id: item })}</span>)}
              {record.linkedBugs.slice(0, 3).map((item) => <span key={item}>{t('features.delivery.gateBoard.defect', { id: item })}</span>)}
              {record.linkedStories.length === 0 && record.linkedBugs.length === 0 ? (
                <span className="is-muted">{t('features.delivery.gateBoard.noLinkedItems')}</span>
              ) : null}
            </div>
          </button>
        );
      })}
      {records.length === 0 ? <div className="dl-empty delivery-empty-block">{t('features.delivery.gateBoard.empty')}</div> : null}
    </div>
  );
}
