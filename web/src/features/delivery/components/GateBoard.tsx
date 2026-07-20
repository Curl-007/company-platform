import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import StatusBadge from '../../../components/common/StatusBadge';
import type { DeliveryGateResult } from '../../../types';
import {
  releaseReadiness,
  statusLabel,
  type DeliveryRecord,
} from '../deliveryPageModel';

export function GateLine({ label, value, passed }: { label: string; value: string; passed: boolean }) {
  return (
    <div className={`delivery-gate-line ${passed ? 'passed' : 'blocked'}`}>
      <span>{passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}{label}</span>
      <strong>{value}</strong>
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
  return (
    <div className="delivery-gate-board">
      {records.map((record) => {
        const gate = gateMap.get(`${record.kind}:${record.id}`);
        return (
          <button className={`delivery-gate-card ${gate?.ready ? 'ready' : 'blocked'}`} key={`${record.kind}-${record.id}`} onClick={() => onOpen(record)}>
            <div className="delivery-gate-head">
              <span className="delivery-version">{record.version ? `v${record.version}` : record.id}</span>
              <strong>{record.title}</strong>
              <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
            </div>
            <div className="delivery-gate-summary">
              <span>{gate?.summary ?? '正在读取门禁结果'}</span>
              <strong>{gate?.score ?? releaseReadiness(record)}%</strong>
            </div>
            {(gate?.gates ?? []).map((line) => (
              <GateLine key={line.id} label={line.label} passed={line.passed} value={line.message} />
            ))}
            {!gate ? <GateLine label="门禁预检" passed={false} value="暂未获取到后端预检结果" /> : null}
            <div className="delivery-linked-list">
              {record.linkedStories.slice(0, 3).map((item) => <span key={item}>需求 {item}</span>)}
              {record.linkedBugs.slice(0, 3).map((item) => <span key={item}>缺陷 {item}</span>)}
            </div>
          </button>
        );
      })}
      {records.length === 0 ? <div className="delivery-empty-block">暂无门禁记录。</div> : null}
    </div>
  );
}
