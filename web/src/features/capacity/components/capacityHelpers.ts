import type { UpsertCapacityPlanInput } from '../api';
import { businessDateKey, businessWeekStart, shiftBusinessDate } from '../../../utils/businessDate';
import i18n from '../../../i18n';

export function toDate(value: Date): string {
  return businessDateKey(value);
}

export function weekRange(offsetWeeks = 0, weekCount = 1) {
  const periodStart = shiftBusinessDate(businessWeekStart(), offsetWeeks * 7);
  const periodEnd = shiftBusinessDate(periodStart, weekCount * 7 - 1);
  return { periodStart, periodEnd };
}

export function currentWeek() {
  return weekRange();
}

export const RISK_VARIANT: Record<string, 'success' | 'warning' | 'risk' | 'neutral'> = {
  balanced: 'success',
  attention: 'warning',
  overloaded: 'risk',
  underallocated: 'neutral',
  unconfigured: 'neutral',
};

export const WEEKDAYS = [
  { value: 1, label: 'features.capacity.capacityHelpers.weekdays.monday' },
  { value: 2, label: 'features.capacity.capacityHelpers.weekdays.tuesday' },
  { value: 3, label: 'features.capacity.capacityHelpers.weekdays.wednesday' },
  { value: 4, label: 'features.capacity.capacityHelpers.weekdays.thursday' },
  { value: 5, label: 'features.capacity.capacityHelpers.weekdays.friday' },
  { value: 6, label: 'features.capacity.capacityHelpers.weekdays.saturday' },
  { value: 0, label: 'features.capacity.capacityHelpers.weekdays.sunday' },
];

export function percentage(value: number | null): string {
  return value === null ? i18n.t('features.capacity.capacityHelpers.unconfigured') : `${Math.round(value * 100)}%`;
}

export type CapacityPlanFormValues = Required<Omit<UpsertCapacityPlanInput, 'periodStart' | 'periodEnd'>>;
