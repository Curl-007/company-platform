import StatusBadge from '../../../components/common/StatusBadge';

export default function ManagementListItem({
  active,
  title,
  subtitle,
  status,
  statusLabel,
  meta,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button className={`management-list-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="management-list-index">{title.slice(0, 1)}</span>
      <span className="management-list-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="management-list-side">
        <StatusBadge status={status} label={statusLabel} showDot={false} />
        <small>{meta}</small>
      </span>
    </button>
  );
}
