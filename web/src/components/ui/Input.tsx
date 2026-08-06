import React from 'react';
import { cn } from './utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={cn('form-input ui-input', className)}
      aria-invalid={invalid || undefined}
      data-slot="input"
      data-state={invalid ? 'invalid' : 'default'}
      {...props}
    />
  ),
);

Input.displayName = 'Input';
