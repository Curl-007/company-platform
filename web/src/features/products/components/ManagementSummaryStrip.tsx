type SignalTone = '' | 'is-success' | 'is-warn' | 'is-risk' | 'is-info';

interface ManagementSignal {
  label: string;
  value: string | number;
  caption?: string;
  tone?: SignalTone;
}

// Generic compact KPI signal strip for the Programs / Portfolios tabs.
// Shares the .product-signal-strip visual defined once in reports-workbench.css
// (same look as ProductSummaryStrip / reports / flow).
export default function ManagementSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string | number; caption?: string }>;
}) {
  const signals: ManagementSignal[] = items.map((item) => ({
    label: item.label,
    value: item.value,
    caption: item.caption ?? '',
    tone: '',
  }));

  return (
    <section className="product-signal-strip" aria-label="管理概况">
      {signals.map((item) => (
        <div key={item.label} className={`product-signal ${item.tone}`.trim()}>
          <span className="product-signal-label">{item.label}</span>
          <strong>{item.value}</strong>
          <em>{item.caption}</em>
        </div>
      ))}
    </section>
  );
}
