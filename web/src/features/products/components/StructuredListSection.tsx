import type { ReactNode } from 'react';

export default function StructuredListSection({
  title,
  description,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title">{title}</div>
          <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onAdd}>新增</button>
      </div>
      {children}
    </div>
  );
}
