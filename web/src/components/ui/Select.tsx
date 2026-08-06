import React from 'react';
import { cn } from './utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid = false, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn('form-select ui-select', className)}
      aria-invalid={invalid || undefined}
      data-slot="select"
      data-state={invalid ? 'invalid' : 'default'}
      {...props}
    >
      {children}
    </select>
  ),
);

Select.displayName = 'Select';
