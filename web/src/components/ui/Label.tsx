import React from 'react';
import { cn } from './utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required = false, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('form-label ui-label', className)}
      aria-required={required || undefined}
      data-slot="label"
      data-state={required ? 'required' : 'default'}
      {...props}
    >
      {children}
      {required ? <span className="form-required" aria-hidden="true">*</span> : null}
    </label>
  ),
);

Label.displayName = 'Label';
