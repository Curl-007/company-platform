export default function ActionSummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'risk' | 'warning' | 'info' | 'success';
}) {
  return (
    <div className={`action-summary-item ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
