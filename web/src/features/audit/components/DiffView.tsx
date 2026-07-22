import type { AuditLogRecord } from '../../../types';
import { buildChangeSummary } from './dynamicMeta';

export default function DiffView({ record }: { record: AuditLogRecord }) {
  const changes = buildChangeSummary(record);

  if (!changes.length) {
    return <div className="body-text">这次操作没有需要展开的字段变化，通常是登录、进入页面或简单新增删除。</div>;
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
