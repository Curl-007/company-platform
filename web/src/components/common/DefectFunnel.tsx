import { useTranslation } from 'react-i18next';
import type { DefectFunnelData } from '../../types';

// ---------------------------------------------------------------------------
// DefectFunnel: horizontal status funnel showing defect closure flow.
//
// Visualizes the defect lifecycle (new → confirmed → in_fix → resolved →
// closed) as a stacked bar with per-stage counts and a closure rate. Makes
// the "closure loop" visible, a ZenTao-style concept.
// ---------------------------------------------------------------------------

interface DefectFunnelProps {
  data: DefectFunnelData;
}

const STAGES = [
  { key: 'new', label: 'enums.defectStatus.new', color: 'var(--color-risk, #dc2626)' },
  { key: 'confirmed', label: 'enums.defectStatus.confirmed', color: 'var(--color-warning, #d97706)' },
  { key: 'in_fix', label: 'enums.defectStatus.in_fix', color: 'var(--color-info, #3B82F6)' },
  { key: 'resolved', label: 'enums.defectStatus.resolved', color: 'var(--color-success, #16a34a)' },
  { key: 'closed', label: 'enums.defectStatus.closed', color: 'var(--text-tertiary, #A1A1AA)' },
] as const;

export default function DefectFunnel({ data }: DefectFunnelProps) {
  const { t } = useTranslation();
  const total = data.total || 1; // avoid divide-by-zero on empty
  const closureRate = data.total > 0 ? Math.round((data.closed / data.total) * 100) : 0;

  return (
    <div className="defect-funnel">
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span className="text-secondary" style={{ fontSize: 13 }}>
          {t('common.defectTotal', { count: data.total, rate: closureRate })}
        </span>
      </div>
      {/* Stacked bar */}
      <div className="funnel-bar">
        {STAGES.map((s) => {
          const val = data[s.key];
          const pct = (val / total) * 100;
          if (val === 0) return null;
          return (
            <div
              key={s.key}
              className="funnel-segment"
              style={{ width: `${pct}%`, background: s.color }}
              title={`${t(s.label)}: ${val}`}
            />
          );
        })}
      </div>
      {/* Legend with counts */}
      <div className="funnel-legend">
        {STAGES.map((s) => {
          const val = data[s.key];
          return (
            <div key={s.key} className="funnel-legend-item">
              <span className="funnel-legend-dot" style={{ background: s.color }} />
              <span className="text-secondary" style={{ fontSize: 12 }}>{t(s.label)}</span>
              <span className="font-medium text-mono" style={{ fontSize: 13 }}>{val}</span>
            </div>
          );
        })}
      </div>
      {data.total === 0 && (
        <p className="text-secondary" style={{ fontSize: 13, margin: '8px 0 0' }}>{t('common.noDefectRecords')}</p>
      )}
    </div>
  );
}
