import { useTranslation } from 'react-i18next';

export default function SummaryList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: string[];
  emptyText?: string;
}) {
  const { t } = useTranslation();
  const empty = emptyText ?? t('features.workLogs.common.none');
  return (
    <div>
      <div className="section-title">{title}</div>
      {items.length ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, index) => (
            <div key={`${title}-${index}`} className="body-text">- {item}</div>
          ))}
        </div>
      ) : (
        <div className="body-text" style={{ marginTop: 8 }}>{empty}</div>
      )}
    </div>
  );
}
