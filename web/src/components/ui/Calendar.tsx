import React from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from './utils';
import { useDateLocale } from '../../i18n/useDateFormatter';

export interface CalendarProps {
  className?: string;
  mode?: 'single';
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  initialFocus?: boolean;
  disabled?: React.ComponentProps<typeof DayPicker>['disabled'];
  defaultMonth?: Date;
  fromDate?: Date;
  toDate?: Date;
}

/**
 * Calendar atom wrapping react-day-picker. Locale follows the active UI
 * language (see useDateLocale) and is themed via the `.ui-calendar` class
 * (global.css). Compose with Popover to build a date input (see DatePicker).
 */
export const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  ({ className, mode = 'single', ...props }, ref) => {
    const dateLocale = useDateLocale();
    return (
      <div ref={ref} className={cn('ui-calendar', className)} data-slot="calendar">
        <DayPicker mode={mode} locale={dateLocale} {...props} />
      </div>
    );
  },
);
Calendar.displayName = 'Calendar';
