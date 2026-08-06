import { buildQuery, unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type { CompletionScore, Requirement } from '../../types';

export interface RequirementFilters {
  keyword?: string;
  status?: string;
  priority?: string;
  projectId?: string;
}

export function fetchRequirements(filters: RequirementFilters = {}): Promise<Requirement[]> {
  return unwrap<Requirement[]>(`/api/requirements${buildQuery(filters as Record<string, string | undefined>)}`);
}

export function fetchRequirement(id: string): Promise<Requirement> {
  return unwrap<Requirement>(`/api/requirements/${encodeURIComponent(id)}`);
}

export interface CreateRequirementInput {
  title: string;
  projectId: string;
  owner?: string;
  assignee?: string;
  assigneeRole?: string;
  priority?: string;
  description?: string;
  acceptanceCriteria?: string[];
  productId?: string;
  portfolioId?: string;
  parentId?: string;
}

export function createRequirement(input: CreateRequirementInput, idempotencyKey?: string): Promise<Requirement> {
  return unwrapPost<Requirement>('/api/requirements', input, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export function fetchCompletionScore(id: string): Promise<CompletionScore> {
  return unwrap<CompletionScore>(`/api/requirements/${id}/completion-score`);
}

export interface UpdateRequirementInput {
  version: number;
  title?: string;
  description?: string;
  priority?: string;
  acceptanceCriteria?: string[];
  parentId?: string | null;
  assignee?: string | null;
  assigneeRole?: string | null;
  assignmentStatus?: string;
  completion?: number;
}

export function updateRequirement(id: string, input: UpdateRequirementInput): Promise<Requirement> {
  return unwrapPatch<Requirement>(`/api/requirements/${id}`, input);
}

export function fetchRequirementChildren(id: string): Promise<Requirement[]> {
  return unwrap<Requirement[]>(`/api/requirements/${id}/children`);
}

export function updateRequirementStatus(id: string, status: string, version: number): Promise<Requirement> {
  return unwrapPatch<Requirement>(`/api/requirements/${id}/status`, { status, version });
}

export function deleteRequirement(id: string, cascade?: boolean): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/requirements/${id}${cascade ? '?cascade=true' : ''}`);
}
