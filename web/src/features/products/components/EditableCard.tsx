import type { ReactNode } from 'react';

export default function EditableCard({
  children,
  onDelete,
  disableDelete,
  deleteLabel,
}: {
  children: ReactNode;
  onDelete: () => void;
  disableDelete?: boolean;
  deleteLabel: string;
}) {
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-body">
        {children}
        <div className="flex items-center" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-text btn-sm" onClick={onDelete} disabled={disableDelete}>{deleteLabel}</button>
        </div>
      </div>
    </div>
  );
}
