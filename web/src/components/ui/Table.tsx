import React from 'react';
import { cn } from './utils';

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="ui-table-container relative w-full overflow-auto" data-slot="table-container" data-state="default">
      <table ref={ref} className={cn('ui-table w-full caption-bottom text-sm', className)} data-slot="table" {...props} />
    </div>
  ),
);

Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('ui-table-header [&_tr]:border-b', className)} data-slot="table-header" {...props} />,
);

TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('ui-table-body [&_tr:last-child]:border-0', className)} data-slot="table-body" {...props} />,
);

TableBody.displayName = 'TableBody';

export const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tfoot ref={ref} className={cn('ui-table-footer border-t bg-[var(--muted)] font-medium', className)} data-slot="table-footer" {...props} />,
);

TableFooter.displayName = 'TableFooter';

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, selected = false, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('ui-table-row border-b transition-colors hover:bg-[var(--muted)]', className)}
      data-slot="table-row"
      data-state={selected ? 'selected' : 'default'}
      {...props}
    />
  ),
);

TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <th ref={ref} className={cn('ui-table-head h-10 px-3 text-left align-middle font-medium text-[var(--muted-foreground)]', className)} data-slot="table-head" {...props} />,
);

TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => <td ref={ref} className={cn('ui-table-cell p-3 align-middle', className)} data-slot="table-cell" {...props} />,
);

TableCell.displayName = 'TableCell';

export const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => <caption ref={ref} className={cn('ui-table-caption mt-3 text-sm text-[var(--muted-foreground)]', className)} data-slot="table-caption" {...props} />,
);

TableCaption.displayName = 'TableCaption';
