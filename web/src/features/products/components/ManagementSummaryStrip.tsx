export default function ManagementSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string | number; caption?: string }>;
}) {
  return (
    <div className="metric-grid product-metric-strip">
      {items.map((item) => (
        <div key={item.label} className="metric-card">
          <div className="metric-card-label">{item.label}</div>
          <div className="metric-card-value">{item.value}</div>
          {item.caption ? <div className="metric-card-caption">{item.caption}</div> : null}
        </div>
      ))}
    </div>
  );
}
