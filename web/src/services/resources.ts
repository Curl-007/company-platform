import { get, post, patch } from './api';
import type {
  ApiResponse,
  DashboardData,
  Project,
  ProjectDetail,
  Requirement,
  Task,
  Sprint,
  KanbanColumn,
  Document,
  Defect,
  TestCase,
  Program,
  Portfolio,
  Product,
  Organization,
  AiSummary,
  AiJob,
  WorkLogAnalysis,
  WorkLogPayload,
  CompletionScore,
  AuditLogRecord,
} from '../types';

// ---------------------------------------------------------------------------
// Typed endpoint functions for the backend API.
//
// List endpoints return plain arrays because we omit page/pageSize (the server
// only paginates when those query params are present). The `data` envelope is
// unwrapped here so callers work with domain objects directly.
// ---------------------------------------------------------------------------

async function unwrap<T>(path: string): Promise<T> {
  const res = await get<ApiResponse<T>>(path);
  return res.data;
}

async function unwrapPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await post<ApiResponse<T>>(path, body);
  return res.data;
}

async function unwrapPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await patch<ApiResponse<T>>(path, body);
  return res.data;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
  );
  if (entries.length === 0) return '';
  const query = new URLSearchParams(entries).toString();
  return `?${query}`;
}

// --- Dashboard --------------------------------------------------------------

export function fetchDashboard(): Promise<DashboardData> {
  return unwrap<DashboardData>('/api/dashboard');
}

// --- Projects ---------------------------------------------------------------

export function fetchProjects(): Promise<Project[]> {
  return unwrap<Project[]>('/api/projects');
}

export function fetchProject(id: string): Promise<ProjectDetail> {
  return unwrap<ProjectDetail>(`/api/projects/${id}`);
}

export function fetchProjectWbs(id: string): Promise<Task[]> {
  return unwrap<Task[]>(`/api/projects/${id}/wbs`);
}

export function fetchProjectKanban(id: string): Promise<KanbanColumn[]> {
  return unwrap<KanbanColumn[]>(`/api/projects/${id}/kanban`);
}

export function fetchProjectSprints(id: string): Promise<Sprint[]> {
  return unwrap<Sprint[]>(`/api/projects/${id}/sprints`);
}

export function updateProjectStatus(id: string, status: string): Promise<Project> {
  return unwrapPatch<Project>(`/api/projects/${id}/status`, { status });
}

export function updateTaskKanban(
  taskId: string,
  payload: { kanbanColumn: string; sortOrder?: number; comment?: string },
): Promise<Task> {
  return unwrapPatch<Task>(`/api/tasks/${taskId}/kanban-position`, payload);
}

// --- Requirements -----------------------------------------------------------

export interface RequirementFilters {
  keyword?: string;
  status?: string;
  priority?: string;
  projectId?: string;
}

export function fetchRequirements(filters: RequirementFilters = {}): Promise<Requirement[]> {
  return unwrap<Requirement[]>(`/api/requirements${buildQuery(filters as Record<string, string | undefined>)}`);
}

export interface CreateRequirementInput {
  title: string;
  projectId: string;
  owner?: string;
  priority?: string;
  description?: string;
  acceptanceCriteria?: string[];
  productId?: string;
  portfolioId?: string;
}

export function createRequirement(input: CreateRequirementInput): Promise<Requirement> {
  return unwrapPost<Requirement>('/api/requirements', input);
}

export function fetchCompletionScore(id: string): Promise<CompletionScore> {
  return unwrap<CompletionScore>(`/api/requirements/${id}/completion-score`);
}

// --- Products / Programs / Portfolios ---------------------------------------

export function fetchProducts(): Promise<Product[]> {
  return unwrap<Product[]>('/api/products');
}

export function fetchPrograms(): Promise<Program[]> {
  return unwrap<Program[]>('/api/programs');
}

export function fetchPortfolios(): Promise<Portfolio[]> {
  return unwrap<Portfolio[]>('/api/portfolios');
}

// --- Testing & Defects ------------------------------------------------------

export function fetchTests(): Promise<TestCase[]> {
  return unwrap<TestCase[]>('/api/tests');
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
}

export function createDefect(input: CreateDefectInput): Promise<Defect> {
  return unwrapPost<Defect>('/api/defects', input);
}

export function updateDefectStatus(id: string, status: string): Promise<Defect> {
  return unwrapPatch<Defect>(`/api/defects/${id}/status`, { status });
}

// --- Documents & AI ---------------------------------------------------------

export function fetchDocuments(type?: string): Promise<Document[]> {
  return unwrap<Document[]>(`/api/documents${buildQuery({ type })}`);
}

export interface UploadDocumentInput {
  title: string;
  type: string;
  owner: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  contentBase64?: string;
}

export function uploadDocument(input: UploadDocumentInput): Promise<Document> {
  return unwrapPost<Document>('/api/documents', input);
}

export interface AnalyzeDocumentInput {
  documentId: string;
  type?: string;
  projectId?: string;
  portfolioId?: string;
  analysisGoals?: string[];
}

export function analyzeDocument(input: AnalyzeDocumentInput): Promise<AiJob> {
  return unwrapPost<AiJob>('/api/ai/documents/analyze', input);
}

export function fetchAiJob(id: string): Promise<AiJob> {
  return unwrap<AiJob>(`/api/ai/jobs/${id}`);
}

export function confirmAiJob(id: string): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/confirm`, {});
}

// --- Organization & AI summary ----------------------------------------------

export function fetchOrganization(): Promise<Organization> {
  return unwrap<Organization>('/api/org');
}

export function fetchAiSummary(scope?: string): Promise<AiSummary> {
  return unwrap<AiSummary>(`/api/ai/summary${buildQuery({ scope })}`);
}

export function analyzeWorkLog(payload: WorkLogPayload): Promise<WorkLogAnalysis> {
  return unwrapPost<WorkLogAnalysis>('/api/ai/logs/analyze', payload);
}

// --- Audit ------------------------------------------------------------------

export function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  return unwrap<AuditLogRecord[]>('/api/audit-logs');
}
