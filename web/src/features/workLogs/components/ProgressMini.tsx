export default function ProgressMini({
  percent,
  tone,
}: {
  percent: number;
  tone?: string;
}) {
  const color =
    tone === 'success'
      ? 'var(--color-success)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-risk)';
  return (
    <div className="health-rank-bar-track">
      <div className="health-rank-bar-fill" style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}
