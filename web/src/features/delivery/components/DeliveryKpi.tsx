export default function DeliveryKpi({
  icon,
  label,
  value,
  meta,
  tone = 'info',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  meta: string;
  tone?: 'info' | 'success' | 'risk';
}) {
  return (
    <div className={`delivery-kpi-card ${tone}`}>
      <div className="delivery-kpi-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{meta}</p>
      </div>
    </div>
  );
}
