import React from 'react';
import { cn } from './utils';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Optional inline label rendered next to the checkbox. */
  label?: React.ReactNode;
  /** Pass through to the wrapper for layout (e.g. stacked forms). */
  wrapperClassName?: string;
}

/**
 * Single canonical checkbox. Replaces the raw <input type="checkbox"
 * className="form-checkbox"> pattern scattered across Settings, so there is one
 * place to upgrade the visual treatment later. Uses native accent-color for
 * now (cheapest, accessible by default) and the existing .form-checkbox layout.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, wrapperClassName, id, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn('ui-checkbox', className)}
        data-slot="checkbox"
        {...props}
      />
    );

    if (label === undefined) return input;

    return (
      <label className={cn('form-checkbox ui-checkbox-wrapper', wrapperClassName)} htmlFor={id}>
        {input}
        <span className="ui-checkbox-label">{label}</span>
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';
