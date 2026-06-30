import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// FilterBar: a consistent wrapper for table/list filters.
//
// - Wraps controls with even spacing and graceful wrapping.
// - Optional `trailing` slot renders actions (e.g. "New" button) on the far
//   right, kept on its own line when there is no room.
// ---------------------------------------------------------------------------

interface FilterBarProps {
  /** Filter controls (search input, selects, etc.) */
  children: ReactNode;
  /** Right-aligned actions (primary buttons) */
  trailing?: ReactNode;
  /** Optional label shown before the controls */
  label?: ReactNode;
}

function FilterBar({ children, trailing, label }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-controls">
        {label && <span className="filter-bar-label">{label}</span>}
        {children}
      </div>
      {trailing && <div className="filter-bar-trailing">{trailing}</div>}
    </div>
  );
}

export default FilterBar;
