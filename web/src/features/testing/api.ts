import { buildQuery, unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type { Defect, TestCase, TestRunInput } from '../../types';

export interface TestCaseFilters {
  keyword?: string;
  status?: string;
  projectId?: string;
  requirementId?: string;
}

interface RawTestCase {
  id: string;
  title?: string;
  name?: string;
  requirementId?: string | null;
  projectId: string;
  status: string;
  owner: string;
  assigneeRole?: string | null;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
  description?: string | null;
  steps?: string[] | string | null;
  expectedResult?: string | null;
}

function normalizeTestCase(item: RawTestCase): TestCase {
  let steps: string[] = [];
  if (Array.isArray(item.steps)) {
    steps = item.steps.filter((entry): entry is string => typeof entry === 'string');
  } else if (typeof item.steps === 'string' && item.steps.trim()) {
    try {
      const parsed = JSON.parse(item.steps);
      if (Array.isArray(parsed)) {
        steps = parsed.filter((entry): entry is string => typeof entry === 'string');
      }
    } catch {
      steps = item.steps
        .split('\n')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return {
    ...item,
    name: item.title ?? item.name ?? '',
    description: item.description ?? '',
    expectedResult: item.expectedResult ?? '',
    steps,
  };
}

export function fetchTestCases(filters: TestCaseFilters = {}): Promise<TestCase[]> {
  return unwrap<RawTestCase[]>(`/api/test-cases${buildQuery(filters as Record<string, string | undefined>)}`)
    .then((items) => items.map(normalizeTestCase));
}

export interface CreateTestCaseInput {
  name: string;
  projectId: string;
  requirementId?: string;
  status?: string;
  owner?: string;
  assigneeRole?: string;
}

export interface UpdateTestCaseInput {
  name?: string;
  owner?: string;
  assigneeRole?: string;
  description?: string;
  steps?: string[];
  expectedResult?: string;
  requirementId?: string;
}

export function createTestCase(input: CreateTestCaseInput): Promise<TestCase> {
  return unwrapPost<RawTestCase>('/api/test-cases', {
    title: input.name,
    projectId: input.projectId,
    requirementId: input.requirementId,
    status: input.status,
    owner: input.owner,
    assigneeRole: input.assigneeRole,
    description: (input as UpdateTestCaseInput).description,
    steps: (input as UpdateTestCaseInput).steps,
    expectedResult: (input as UpdateTestCaseInput).expectedResult,
  }).then(normalizeTestCase);
}

export function updateTestCase(id: string, input: UpdateTestCaseInput): Promise<TestCase> {
  return unwrapPatch<RawTestCase>(`/api/test-cases/${id}`, input).then(normalizeTestCase);
}

export function updateTestCaseStatus(id: string, status: string): Promise<TestCase> {
  return unwrapPatch<RawTestCase>(`/api/test-cases/${id}/status`, { status }).then(normalizeTestCase);
}

export function deleteTestCase(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/test-cases/${id}`);
}

export function createTestRun(input: TestRunInput): Promise<unknown> {
  return unwrapPost<unknown>('/api/test-runs', input);
}

export interface DefectFilters {
  keyword?: string;
  status?: string;
  severity?: string;
  projectId?: string;
}

export function fetchDefects(filters: DefectFilters = {}): Promise<Defect[]> {
  return unwrap<Defect[]>(`/api/defects${buildQuery(filters as Record<string, string | undefined>)}`);
}

export interface CreateDefectInput {
  title: string;
  projectId: string;
  severity?: string;
  status?: string;
  requirementId?: string;
  assignee?: string;
  assigneeRole?: string;
  description?: string;
}

export function createDefect(input: CreateDefectInput): Promise<Defect> {
  return unwrapPost<Defect>('/api/defects', input);
}

export function updateDefectStatus(id: string, status: string): Promise<Defect> {
  return unwrapPatch<Defect>(`/api/defects/${id}/status`, { status });
}

export interface UpdateDefectInput {
  title?: string;
  description?: string;
  severity?: string;
  assignee?: string;
  assigneeRole?: string;
  requirementId?: string;
  status?: string;
}

export function updateDefect(id: string, input: UpdateDefectInput): Promise<Defect> {
  return unwrapPatch<Defect>(`/api/defects/${id}`, input);
}

export type DefectHandoffAction = 'assign_to_dev' | 'assign_to_qa';

export function handoffDefect(
  id: string,
  input: { action: DefectHandoffAction; assignee?: string; assigneeId?: string; version: number },
): Promise<Defect> {
  return unwrapPost<Defect>(`/api/defects/${encodeURIComponent(id)}/handoff`, input);
}

export function deleteDefect(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/defects/${id}`);
}
