import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export default function StructuredListSection({
  title,
  description,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ marginTop: 20 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title">{title}</div>
          <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onAdd}>{t('common.add')}</button>
      </div>
      {children}
    </div>
  );
}
