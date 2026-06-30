import React from 'react';

type FieldTone = 'default' | 'danger';

export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  helpText?: React.ReactNode;
  error?: React.ReactNode;
  tone?: FieldTone;
  className?: string;
  children: React.ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  helpText,
  error,
  tone = 'default',
  className = '',
  children,
}: FormFieldProps) {
  const classes = ['form-group', tone === 'danger' || error ? 'form-group-danger' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <label className="form-label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="form-required">*</span> : null}
      </label>
      {children}
      {error ? <div className="form-error">{error}</div> : null}
      {helpText ? <div className="form-help-text">{helpText}</div> : null}
    </div>
  );
}

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ className = '', invalid = false, ...props }, ref) => (
    <input
      ref={ref}
      className={['form-input', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...props}
    />
  ),
);

TextInput.displayName = 'TextInput';

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className = '', invalid = false, ...props }, ref) => (
    <textarea
      ref={ref}
      className={['form-textarea', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...props}
    />
  ),
);

TextArea.displayName = 'TextArea';

export interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const SelectInput = React.forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ className = '', invalid = false, children, ...props }, ref) => (
    <select
      ref={ref}
      className={['form-select', className].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  ),
);

SelectInput.displayName = 'SelectInput';
