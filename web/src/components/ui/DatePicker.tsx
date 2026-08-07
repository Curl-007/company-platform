import React from 'react';
import { CalendarIcon } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { Calendar } from './Calendar';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { Button } from './Button';
import { cn } from './utils';
import { useDateLocale } from '../../i18n/useDateFormatter';

export interface DatePickerProps {
  /** ISO date string (yyyy-MM-dd) or undefined. */
  value?: string;
  /** Called with ISO yyyy-MM-dd when the user picks a date. */
  onChange: (iso: string | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
  ariaLabel?: string;
}

/**
 * A date picker that composes Calendar + Popover, replacing the native
 * <input type="date">. Accepts and emits ISO yyyy-MM-dd strings so it slots
 * into existing form state that already uses that format.
 */
export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      placeholder,
      disabled = false,
      className,
      invalid = false,
      ariaLabel,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const resolvedPlaceholder = placeholder ?? t('common.selectDate');
    const resolvedAriaLabel = ariaLabel ?? t('common.selectDate');
    const dateLocale = useDateLocale();
    const selected = React.useMemo(() => {
      if (!value) return undefined;
      const parsed = parseISO(value);
      return isValid(parsed) ? parsed : undefined;
    }, [value]);

    const label = selected ? format(selected, 'yyyy-MM-dd', { locale: dateLocale }) : resolvedPlaceholder;

    return (
      <Popover>
        <PopoverTrigger
          ref={ref}
          disabled={disabled}
          aria-label={resolvedAriaLabel}
          className={cn(
            'ui-date-picker form-input ui-input inline-flex w-full items-center justify-between gap-2 text-left font-normal',
            !selected && 'text-[var(--muted-foreground)]',
            invalid && 'border-[var(--destructive)]',
            className,
          )}
          data-state={invalid ? 'invalid' : 'default'}
        >
          <span className={cn('truncate', !selected && 'text-[var(--muted-foreground)]')}>
            {label}
          </span>
          <CalendarIcon size={15} className="shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day: Date | undefined) => onChange(day ? format(day, 'yyyy-MM-dd') : undefined)}
            initialFocus
          />
          {selected && (
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                variant="text"
                onClick={() => onChange(undefined)}
                type="button"
              >
                {t('common.clear')}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  },
);
DatePicker.displayName = 'DatePicker';
