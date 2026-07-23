const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

interface BusinessDateParts {
  year: number;
  month: number;
  day: number;
}

function dateParts(date: Date): BusinessDateParts {
  const values = new Map(
    businessDateFormatter
      .formatToParts(date)
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get('year')!,
    month: values.get('month')!,
    day: values.get('day')!,
  };
}

function formatParts({ year, month, day }: BusinessDateParts): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateKey(dateKey: string): BusinessDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Invalid business date: ${dateKey}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function businessDateKey(date = new Date()): string {
  return formatParts(dateParts(date));
}

export function businessWeekStart(date = new Date()): string {
  const parts = dateParts(date);
  const calendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const daysSinceMonday = (calendarDate.getUTCDay() + 6) % 7;
  calendarDate.setUTCDate(calendarDate.getUTCDate() - daysSinceMonday);
  return formatParts({
    year: calendarDate.getUTCFullYear(),
    month: calendarDate.getUTCMonth() + 1,
    day: calendarDate.getUTCDate(),
  });
}

export function shiftBusinessDate(dateKey: string, days: number): string {
  const parts = parseDateKey(dateKey);
  const calendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  calendarDate.setUTCDate(calendarDate.getUTCDate() + days);
  return formatParts({
    year: calendarDate.getUTCFullYear(),
    month: calendarDate.getUTCMonth() + 1,
    day: calendarDate.getUTCDate(),
  });
}

export function isSameBusinessDay(left: Date, right: Date): boolean {
  return businessDateKey(left) === businessDateKey(right);
}
