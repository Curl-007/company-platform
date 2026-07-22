export default function SummaryList({
  title,
  items,
  emptyText = '暂无',
}: {
  title: string;
  items: string[];
  emptyText?: string;
}) {
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
        <div className="body-text" style={{ marginTop: 8 }}>{emptyText}</div>
      )}
    </div>
  );
}
