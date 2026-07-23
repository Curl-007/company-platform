import type { UpsertCapacityPlanInput } from '../api';
import { businessDateKey, businessWeekStart, shiftBusinessDate } from '../../../utils/businessDate';

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
  { value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' }, { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 0, label: '周日' },
];

export function percentage(value: number | null): string {
  return value === null ? '未配置' : `${Math.round(value * 100)}%`;
}

export type CapacityPlanFormValues = Required<Omit<UpsertCapacityPlanInput, 'periodStart' | 'periodEnd'>>;
