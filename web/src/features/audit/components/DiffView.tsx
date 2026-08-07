import { useTranslation } from 'react-i18next';
import type { AuditLogRecord } from '../../../types';
import { buildChangeSummary } from './dynamicMeta';

export default function DiffView({ record }: { record: AuditLogRecord }) {
  const { t } = useTranslation();
  const changes = buildChangeSummary(record);

  if (!changes.length) {
    return <div className="body-text">{t('features.audit.diffView.noChanges')}</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {changes.map((change) => (
        <div key={`${change.label}-${change.before}-${change.after}`} className="detail-field" style={{ alignItems: 'flex-start' }}>
          <span className="detail-label" style={{ minWidth: 120 }}>{change.label}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'var(--text-secondary, #64748b)', textDecoration: 'line-through' }}>{change.before}</div>
            <div style={{ color: 'var(--color-success, #16a34a)', marginTop: 4 }}>{change.after}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
