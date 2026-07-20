import { buildQuery, unwrap, unwrapDel, unwrapPatch, unwrapPost, unwrapPut } from '../../services/apiClient';
import type { CapacityMemberOverview, CapacityOverview, CapacityPlan, ProjectAllocation, WorkCalendar, WorkCalendarException } from '../../types';

export interface CapacityPeriod {
  periodStart?: string;
  periodEnd?: string;
}

export interface WorkloadThresholds {
  balancedMin: number;
  attentionMin: number;
  overloadedAbove: number;
}

export interface UpsertCapacityPlanInput extends CapacityPeriod {
  workingDays?: number;
  useCalendar?: boolean;
  dailyHours?: number;
  meetingHours?: number;
  trainingHours?: number;
  supportHours?: number;
  otherCommitmentHours?: number;
  notes?: string;
}

export interface UpsertProjectAllocationInput extends CapacityPeriod {
  projectId: string;
  userId: string;
  allocationPercent?: number;
  plannedHours?: number;
  notes?: string;
  overloadReason?: string;
}

export interface UpdateWorkCalendarInput extends CapacityPeriod {
  name?: string;
  timezone?: string;
  workingWeekdays?: number[];
}

export interface UpsertWorkCalendarExceptionInput {
  date: string;
  isWorkingDay: boolean;
  name?: string;
}

export function fetchCapacityOverview(period: CapacityPeriod = {}): Promise<CapacityOverview> {
  return unwrap<CapacityOverview>(`/api/capacity/overview${buildQuery(period as Record<string, string | undefined>)}`);
}

export function fetchWorkloadThresholds(): Promise<WorkloadThresholds> {
  return unwrap<WorkloadThresholds>('/api/capacity/settings/workload-thresholds');
}

export function updateWorkloadThresholds(input: WorkloadThresholds): Promise<WorkloadThresholds> {
  return unwrapPut<WorkloadThresholds>('/api/capacity/settings/workload-thresholds', input);
}

export function fetchMyCapacity(period: CapacityPeriod = {}): Promise<CapacityMemberOverview | null> {
  return unwrap<CapacityMemberOverview | null>(`/api/capacity/me${buildQuery(period as Record<string, string | undefined>)}`);
}

export function upsertCapacityPlan(userId: string, input: UpsertCapacityPlanInput): Promise<CapacityPlan> {
  return unwrapPut<CapacityPlan>(`/api/capacity/plans/${userId}`, input);
}

export function upsertProjectAllocation(input: UpsertProjectAllocationInput): Promise<ProjectAllocation> {
  return unwrapPut<ProjectAllocation>('/api/capacity/allocations', input);
}

export function deleteProjectAllocation(id: string): Promise<{ deleted: boolean; id: string }> {
  return unwrapDel<{ deleted: boolean; id: string }>(`/api/capacity/allocations/${id}`);
}

export function approveProjectAllocation(id: string): Promise<ProjectAllocation> {
  return unwrapPatch<ProjectAllocation>(`/api/capacity/allocations/${id}/approval`, {});
}

export function fetchWorkCalendar(period: CapacityPeriod = {}): Promise<WorkCalendar & { period: Required<CapacityPeriod> }> {
  return unwrap<WorkCalendar & { period: Required<CapacityPeriod> }>(`/api/capacity/calendar${buildQuery(period as Record<string, string | undefined>)}`);
}

export function updateWorkCalendar(input: UpdateWorkCalendarInput): Promise<WorkCalendar & { period: Required<CapacityPeriod> }> {
  return unwrapPut<WorkCalendar & { period: Required<CapacityPeriod> }>('/api/capacity/calendar', input);
}

export function upsertWorkCalendarException(input: UpsertWorkCalendarExceptionInput): Promise<WorkCalendarException> {
  return unwrapPost<WorkCalendarException>('/api/capacity/calendar/exceptions', input);
}

export function deleteWorkCalendarException(id: string): Promise<{ deleted: boolean; id: string }> {
  return unwrapDel<{ deleted: boolean; id: string }>(`/api/capacity/calendar/exceptions/${id}`);
}
