import { useId, type ReactNode } from 'react';

export default function MyWorkEmptyPanel({
  icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const titleId = useId();

  return (
    <section className="mywork-empty-panel" aria-labelledby={titleId}>
      <div className="mywork-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="mywork-empty-copy">
        <span>{eyebrow}</span>
        <h3 id={titleId}>{title}</h3>
        <p>{description}</p>
      </div>
      {action ? <div className="mywork-empty-actions">{action}</div> : null}
    </section>
  );
}
