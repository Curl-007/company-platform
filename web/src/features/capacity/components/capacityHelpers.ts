import type { UpsertCapacityPlanInput } from '../api';

export function toDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function weekRange(offsetWeeks = 0, weekCount = 1) {
  const start = new Date();
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + weekCount * 7 - 1);
  return { periodStart: toDate(start), periodEnd: toDate(end) };
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
