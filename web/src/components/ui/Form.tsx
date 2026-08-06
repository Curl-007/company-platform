import React from 'react';
import { Input } from './Input';
import { Select } from './Select';
import { Textarea } from './Textarea';

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

// TextInput / TextArea / SelectInput are thin aliases over the canonical
// Input / Textarea / Select atoms so that every text control in the app shares
// one implementation (with data-slot + ui-* prefix). New code should import
// Input / Textarea / Select directly; these are kept for the existing call
// sites (e.g. Settings) that already use the Form.* names.
export type { InputProps as TextInputProps } from './Input';
export type { SelectProps as SelectInputProps } from './Select';
export type { TextareaProps as TextAreaProps } from './Textarea';

export const TextInput = Input;
TextInput.displayName = 'TextInput';

export const SelectInput = Select;
SelectInput.displayName = 'SelectInput';

export const TextArea = Textarea;
TextArea.displayName = 'TextArea';
