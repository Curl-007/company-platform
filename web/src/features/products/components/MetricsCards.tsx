import StatusBadge from '../../../components/common/StatusBadge';
import { MODULE_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { ProductMetric } from '../../../types';

export default function MetricsCards({ title, metrics }: { title: string; metrics?: ProductMetric[] }) {
  if (!metrics?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="section-title">{title}</div>
      <div className="metric-grid" style={{ marginTop: 8 }}>
        {metrics.map((item, index) => (
          <div key={`${item.label}-${index}`} className="metric-card">
            <div className="metric-card-label">{item.label || `指标 ${index + 1}`}</div>
            <div className="metric-card-value">
              {item.value || '-'}
              {item.unit ? <span style={{ fontSize: 13, marginLeft: 4 }}>{item.unit}</span> : null}
            </div>
            {item.status ? (
              <div style={{ marginTop: 8 }}>
                <StatusBadge status={item.status} label={labelOf(MODULE_STATUS_LABELS, item.status)} showDot={false} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
