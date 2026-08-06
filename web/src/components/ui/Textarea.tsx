import React from 'react';
import { cn } from './utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn('form-textarea ui-textarea', className)}
      aria-invalid={invalid || undefined}
      data-slot="textarea"
      data-state={invalid ? 'invalid' : 'default'}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
