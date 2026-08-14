import { buildQuery, unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type { TimeEntry } from '../../types';

export interface TimeEntryInput {
  projectId: string;
  taskId?: string | null;
  workDate: string;
  hours: number;
  category: 'delivery' | 'support' | 'meeting' | 'training' | 'other';
  workNature?: 'planned' | 'unplanned' | 'unspecified';
  note?: string;
}

export function fetchTimeEntries(filters: { periodStart?: string; periodEnd?: string; projectId?: string } = {}): Promise<TimeEntry[]> {
  return unwrap<TimeEntry[]>(`/api/time-entries${buildQuery(filters)}`);
}

export function createTimeEntry(input: TimeEntryInput, idempotencyKey?: string): Promise<TimeEntry> {
  return unwrapPost<TimeEntry>('/api/time-entries', input, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    invalidation: 'timeEntries',
  });
}

export function updateTimeEntry(id: string, input: Partial<TimeEntryInput>): Promise<TimeEntry> {
  return unwrapPatch<TimeEntry>(`/api/time-entries/${id}`, input, { invalidation: 'timeEntries' });
}

export function deleteTimeEntry(id: string): Promise<{ deleted: boolean; id: string }> {
  return unwrapDel<{ deleted: boolean; id: string }>(`/api/time-entries/${id}`, { invalidation: 'timeEntries' });
}
