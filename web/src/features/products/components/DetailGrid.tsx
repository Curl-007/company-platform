export default function DetailGrid({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!entries.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="section-title">{title}</div>
      <div className="detail-grid" style={{ marginTop: 8 }}>
        {entries.map(([key, value]) => (
          <div key={key} className="detail-field">
            <span className="detail-label">{key}</span>
            <span>{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
