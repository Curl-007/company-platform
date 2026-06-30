import { get, post, patch, put, del } from './api';
import { clearAsyncCache } from '../hooks/useAsync';
import type {
  ApiResponse,
  DashboardData,
  Project,
  ProjectMember,
  ProjectDetail,
  Requirement,
  Task,
  Sprint,
  Milestone,
  KanbanColumn,
  BurndownData,
  ProjectFlow,
  FlowOverviewItem,
  Build,
  DeliveryGateResult,
  Release,
  ReleaseApproval,
  ReleaseReport,
  RollbackRecord,
  Document,
  Defect,
  TestCase,
  TestRunInput,
  User,
  Program,
  Portfolio,
  Product,
  AiSummary,
  AiChatInput,
  AiChatMessage,
  AiBusinessAdvice,
  AiBusinessAdviceInput,
  AiProviderConfig,
  AiProviderTestResult,
  UpdateAiProviderInput,
  AiJob,
  ConfirmAiJobInput,
  WorkLog,
  WorkLogAnalysis,
  WorkLogPayload,
  WeeklyWorkSummary,
  TeamWorkSummary,
  CompletionScore,
  AuditLogRecord,
  TeamMemberOverview,
  SourceItem,
  SourceFile,
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

async function unwrapPost<T>(
  path: string,
  body?: unknown,
  options: { invalidateCache?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const res = await post<ApiResponse<T>>(path, body, { timeoutMs: options.timeoutMs });
  if (options.invalidateCache !== false) clearAsyncCache();
  return res.data;
}

async function unwrapPatch<T>(path: string, body?: unknown, options: { invalidateCache?: boolean } = {}): Promise<T> {
  const res = await patch<ApiResponse<T>>(path, body);
  if (options.invalidateCache !== false) clearAsyncCache();
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

export function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  return unwrap<ProjectMember[]>(`/api/projects/${projectId}/members`);
}

export function addProjectMember(projectId: string, input: { userName: string; role: string }): Promise<ProjectMember> {
  return unwrapPost<ProjectMember>(`/api/projects/${projectId}/members`, input);
}

export function deleteProjectMember(projectId: string, memberId: string): Promise<void> {
  return unwrapDel(`/api/projects/${projectId}/members/${memberId}`);
}

export function fetchProjectWbs(id: string): Promise<Task[]> {
  return unwrap<Task[]>(`/api/projects/${id}/wbs`);
}

export interface CreateWbsTaskInput {
  title: string;
  assigneeId?: string;
  requirementId?: string;
  type?: string;
  parentId?: string;
  wbsCode?: string;
  estimatedHours?: number;
  remainingHours?: number;
}

export function createWbsTask(projectId: string, input: CreateWbsTaskInput): Promise<Task> {
  return unwrapPost<Task>(`/api/projects/${projectId}/wbs/tasks`, input);
}

export function fetchProjectKanban(id: string): Promise<KanbanColumn[]> {
  return unwrap<KanbanColumn[]>(`/api/projects/${id}/kanban`);
}

export function fetchProjectSprints(id: string): Promise<Sprint[]> {
  return unwrap<Sprint[]>(`/api/projects/${id}/sprints`);
}

export function fetchSprintBurndown(id: string): Promise<BurndownData> {
  return unwrap<BurndownData>(`/api/sprints/${id}/burndown`);
}

export function fetchProjectFlow(id: string): Promise<ProjectFlow> {
  return unwrap<ProjectFlow>(`/api/projects/${id}/flow`);
}

export function fetchFlowOverview(): Promise<FlowOverviewItem[]> {
  return unwrap<FlowOverviewItem[]>(`/api/flow/overview`);
}

// --- Builds ---

export function fetchBuilds(projectId?: string): Promise<Build[]> {
  const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return unwrap<Build[]>(`/api/builds${q}`);
}

export function fetchDeliveryGates(): Promise<DeliveryGateResult[]> {
  return unwrap<DeliveryGateResult[]>('/api/delivery/gates');
}

export interface CreateBuildInput {
  projectId: string;
  name: string;
  version?: string;
  buildDate?: string;
  linkedStories?: string[];
  linkedBugs?: string[];
  scmHash?: string;
  notes?: string;
}

export function createBuild(input: CreateBuildInput): Promise<Build> {
  return unwrapPost<Build>(`/api/builds`, input);
}

export interface UpdateBuildInput {
  name?: string;
  version?: string;
  buildDate?: string;
  linkedStories?: string[];
  linkedBugs?: string[];
  scmHash?: string;
  notes?: string;
}

export function updateBuild(id: string, input: UpdateBuildInput): Promise<Build> {
  return unwrapPatch<Build>(`/api/builds/${id}`, input);
}

export function updateBuildStatus(id: string, status: string): Promise<Build> {
  return unwrapPatch<Build>(`/api/builds/${id}/status`, { status });
}

export function deleteBuild(id: string): Promise<void> {
  return unwrapDel(`/api/builds/${id}`);
}

// --- Releases ---

export function fetchReleases(productId?: string): Promise<Release[]> {
  const q = productId ? `?productId=${encodeURIComponent(productId)}` : '';
  return unwrap<Release[]>(`/api/releases${q}`);
}

export interface CreateReleaseInput {
  productId?: string;
  name: string;
  version?: string;
  releaseDate?: string;
  buildId?: string;
  releaseType?: string;
  linkedStories?: string[];
  linkedBugs?: string[];
  releaseNotes?: string;
}

export function createRelease(input: CreateReleaseInput): Promise<Release> {
  return unwrapPost<Release>(`/api/releases`, input);
}

export function fetchReleaseApprovals(releaseId: string): Promise<ReleaseApproval[]> {
  return unwrap<ReleaseApproval[]>(`/api/releases/${releaseId}/approvals`);
}

export function createReleaseApproval(
  releaseId: string,
  input: { decision: 'approve' | 'reject'; comment?: string },
): Promise<{ approval: ReleaseApproval; release: Release }> {
  return unwrapPost<{ approval: ReleaseApproval; release: Release }>(`/api/releases/${releaseId}/approvals`, input);
}

export function fetchRollbackRecords(releaseId: string): Promise<RollbackRecord[]> {
  return unwrap<RollbackRecord[]>(`/api/releases/${releaseId}/rollbacks`);
}

export function fetchReleaseReport(releaseId: string): Promise<ReleaseReport> {
  return unwrap<ReleaseReport>(`/api/releases/${releaseId}/report`);
}

export function createRollbackRecord(
  releaseId: string,
  input: { reason: string; impact?: string; plan?: string },
): Promise<{ rollback: RollbackRecord; release: Release }> {
  return unwrapPost<{ rollback: RollbackRecord; release: Release }>(`/api/releases/${releaseId}/rollbacks`, input);
}

export function updateReleaseStatus(id: string, status: string): Promise<Release> {
  return unwrapPatch<Release>(`/api/releases/${id}/status`, { status });
}

export function deleteRelease(id: string): Promise<void> {
  return unwrapDel(`/api/releases/${id}`);
}

// --- Personal dashboard ---

export function fetchPersonalDashboard(): Promise<DashboardData & { myDefects?: Defect[]; myBuilds?: Build[] }> {
  return unwrap(`/api/dashboard/personal`);
}

export interface CreateSprintInput {
  name: string;
  goal?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function createSprint(projectId: string, input: CreateSprintInput): Promise<Sprint> {
  return unwrapPost<Sprint>(`/api/projects/${projectId}/sprints`, input);
}

export function updateProjectStatus(id: string, status: string): Promise<Project> {
  return unwrapPatch<Project>(`/api/projects/${id}/status`, { status });
}

export interface CreateProjectInput {
  name: string;
  owner: string;
  status?: string;
  progress?: number;
  programId?: string;
  productId?: string;
  processMode?: string;
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return unwrapPost<Project>('/api/projects', input);
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
  assignee?: string;
  assigneeRole?: string;
  priority?: string;
  description?: string;
  acceptanceCriteria?: string[];
  productId?: string;
  portfolioId?: string;
  parentId?: string;
}

export function createRequirement(input: CreateRequirementInput): Promise<Requirement> {
  return unwrapPost<Requirement>('/api/requirements', input);
}

export function fetchCompletionScore(id: string): Promise<CompletionScore> {
  return unwrap<CompletionScore>(`/api/requirements/${id}/completion-score`);
}

export interface UpdateRequirementInput {
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

export function updateRequirementStatus(id: string, status: string): Promise<Requirement> {
  return unwrapPatch<Requirement>(`/api/requirements/${id}/status`, { status });
}

// --- Products / Programs / Portfolios ---------------------------------------

export function fetchProducts(): Promise<Product[]> {
  return unwrap<Product[]>('/api/products');
}

export interface CreateProductInput {
  name: string;
  owner: string;
  version?: string;
  stage?: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  systemName?: string;
  systemVersion?: string;
  applicationVersion?: string;
  modules?: Array<{ name?: string; owner?: string; status?: string }>;
  roadmap?: Array<{ title?: string; version?: string; quarter?: string; status?: string }>;
  hardwareInfo?: Record<string, unknown>;
  systemInfo?: Record<string, unknown>;
  applicationInfo?: Record<string, unknown>;
  hardwareMetrics?: Array<{ label: string; value: string; unit?: string; status?: string }>;
  systemMetrics?: Array<{ label: string; value: string; unit?: string; status?: string }>;
  appMetrics?: Array<{ label: string; value: string; unit?: string; status?: string }>;
}

export function createProduct(input: CreateProductInput): Promise<Product> {
  return unwrapPost<Product>('/api/products', input);
}

export function updateProduct(id: string, input: Partial<CreateProductInput>): Promise<Product> {
  return unwrapPatch<Product>(`/api/products/${id}`, input);
}

export function deleteProduct(id: string): Promise<void> {
  return unwrapDel(`/api/products/${id}`);
}

export function fetchPrograms(): Promise<Program[]> {
  return unwrap<Program[]>('/api/programs');
}

export function fetchPortfolios(): Promise<Portfolio[]> {
  return unwrap<Portfolio[]>('/api/portfolios');
}

// --- Testing & Defects ------------------------------------------------------

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
    .then(items => items.map(normalizeTestCase));
}

export interface CreateTestCaseInput {
  name: string;
  projectId: string;
  requirementId?: string;
  status?: string;
  owner?: string;
  assigneeRole?: string;
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

export function updateTestCaseStatus(id: string, status: string): Promise<TestCase> {
  return unwrapPatch<RawTestCase>(`/api/test-cases/${id}/status`, { status }).then(normalizeTestCase);
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
}

export function createDefect(input: CreateDefectInput): Promise<Defect> {
  return unwrapPost<Defect>('/api/defects', input);
}

export function updateDefectStatus(id: string, status: string): Promise<Defect> {
  return unwrapPatch<Defect>(`/api/defects/${id}/status`, { status });
}

// --- Documents & AI ---------------------------------------------------------

export interface DocumentFilters {
  type?: string;
  category?: string;
  projectId?: string;
  ownerRole?: string;
}

export function fetchDocuments(filters: DocumentFilters = {}): Promise<Document[]> {
  return unwrap<Document[]>(`/api/documents${buildQuery(filters as Record<string, string | undefined>)}`);
}

export interface UploadDocumentInput {
  title: string;
  type: string;
  category?: string;
  owner: string;
  ownerRole?: string;
  projectId?: string;
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

export function confirmAiJob(id: string, input: ConfirmAiJobInput = {}): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/confirm`, input);
}

export function rejectAiJob(id: string, input: { reason?: string } = {}): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/reject`, input);
}

export function retryAiJob(id: string): Promise<AiJob> {
  return unwrapPost<AiJob>(`/api/ai/jobs/${id}/retry`, {});
}

// --- AI summary --------------------------------------------------------------

export function fetchAiSummary(scope?: string): Promise<AiSummary> {
  return unwrap<AiSummary>(`/api/ai/summary${buildQuery({ scope })}`);
}

export function sendAiChat(input: AiChatInput): Promise<AiChatMessage> {
  return unwrapPost<AiChatMessage>('/api/ai/chat', input, { invalidateCache: false, timeoutMs: 60000 });
}

export function fetchAiBusinessAdvice(input: AiBusinessAdviceInput): Promise<AiBusinessAdvice> {
  return unwrapPost<AiBusinessAdvice>('/api/ai/business-advice', input, { invalidateCache: false, timeoutMs: 90000 });
}

export function fetchAiProviderConfig(): Promise<AiProviderConfig> {
  return unwrap<AiProviderConfig>('/api/admin/ai-provider');
}

export function updateAiProviderConfig(input: UpdateAiProviderInput): Promise<AiProviderConfig> {
  return unwrapPatch<AiProviderConfig>('/api/admin/ai-provider', input);
}

export function activateAiProviderConfig(id: string): Promise<AiProviderConfig> {
  return unwrapPost<AiProviderConfig>(`/api/admin/ai-provider/${id}/activate`, {});
}

export function updateAiProviderStatus(id: string, enabled: boolean): Promise<AiProviderConfig> {
  return unwrapPatch<AiProviderConfig>(`/api/admin/ai-provider/${id}/status`, { enabled });
}

export function deleteAiProviderConfig(id: string): Promise<AiProviderConfig> {
  return unwrapDel<AiProviderConfig>(`/api/admin/ai-provider/${id}`);
}

export function testAiProviderConfig(): Promise<AiProviderTestResult> {
  return unwrapPost<AiProviderTestResult>('/api/admin/ai-provider/test', {}, { invalidateCache: false });
}

export function analyzeWorkLog(payload: WorkLogPayload): Promise<WorkLogAnalysis> {
  return unwrapPost<WorkLogAnalysis>('/api/ai/logs/analyze', payload, { invalidateCache: false });
}

// --- Work Logs ----------------------------------------------------------------

export function fetchWorkLogs(): Promise<WorkLog[]> {
  return unwrap<WorkLog[]>('/api/work-logs');
}

export function createWorkLog(input: WorkLogPayload): Promise<{ id: string; analysis: WorkLogAnalysis }> {
  return unwrapPost<{ id: string; analysis: WorkLogAnalysis }>('/api/work-logs', input);
}

export function fetchWeeklyWorkSummary(week?: string, author?: string): Promise<WeeklyWorkSummary> {
  return unwrap<WeeklyWorkSummary>(`/api/work-logs/weekly-summary${buildQuery({ week, author })}`);
}

export interface TeamWorkLogFilters {
  projectId?: string;
  project?: string;
  role?: string;
  author?: string;
  date?: string;
}

export function fetchTeamWorkLogs(filters: TeamWorkLogFilters = {}): Promise<WorkLog[]> {
  return unwrap<WorkLog[]>(`/api/work-logs/team${buildQuery(filters as Record<string, string | undefined>)}`);
}

export function fetchTeamWeeklySummary(filters: { projectId?: string; project?: string; week?: string; role?: string } = {}): Promise<TeamWorkSummary> {
  return unwrap<TeamWorkSummary>(`/api/work-logs/team-weekly-summary${buildQuery(filters)}`);
}

// --- Team ------------------------------------------------------------------

export function fetchTeamMembers(): Promise<TeamMemberOverview[]> {
  return unwrap<TeamMemberOverview[]>('/api/team/members');
}

// --- Audit ------------------------------------------------------------------

export interface AuditLogFilters {
  keyword?: string;
  actor?: string;
  action?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  includePageViews?: string;
}

export function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogRecord[]> {
  return unwrap<Array<Record<string, unknown>>>(`/api/audit-logs${buildQuery(filters as Record<string, string | undefined>)}`).then((items) =>
    items.map((item) => ({
      id: String(item.id ?? ''),
      actorId: item.actorId != null ? String(item.actorId) : item.actor_id != null ? String(item.actor_id) : null,
      actorName: String(item.actorName ?? item.actor_name ?? ''),
      action: String(item.action ?? ''),
      resourceType: String(item.resourceType ?? item.resource_type ?? ''),
      resourceId: item.resourceId != null ? String(item.resourceId) : item.resource_id != null ? String(item.resource_id) : null,
      createdAt: String(item.createdAt ?? item.created_at ?? ''),
      before: item.before,
      after: item.after,
    })),
  );
}

export function trackPageView(page: string, pageTitle?: string): Promise<{ page: string; pageTitle: string }> {
  return unwrapPost<{ page: string; pageTitle: string }>('/api/activity/page-view', { page, pageTitle }, { invalidateCache: false });
}

// --- Users ------------------------------------------------------------------

export function fetchUsers(): Promise<User[]> {
  return unwrap<User[]>('/api/users');
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: string;
  status?: string;
  phone?: string;
  position?: string;
  department?: string;
  bio?: string;
}

export function createUser(input: CreateUserInput): Promise<User> {
  return unwrapPost<User>('/api/users', input);
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: string;
  status?: string;
  password?: string;
  phone?: string;
  position?: string;
  department?: string;
  bio?: string;
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return unwrapPatch<User>(`/api/users/${id}`, input);
}

export function deleteUser(id: string): Promise<{ deleted?: boolean; disabled?: boolean; id: string }> {
  return unwrapDel<{ deleted?: boolean; disabled?: boolean; id: string }>(`/api/users/${id}`);
}

// ---------------------------------------------------------------------------
// New helpers for PUT/DELETE
// ---------------------------------------------------------------------------

async function unwrapDel<T>(path: string): Promise<T> {
  const res = await del<ApiResponse<T>>(path);
  clearAsyncCache();
  return res.data;
}

// --- Projects update/delete ------------------------------------------------

export interface UpdateProjectInput {
  name?: string;
  code?: string;
  description?: string;
  owner?: string;
  status?: string;
  progress?: number;
  processMode?: string;
  programId?: string;
  productId?: string;
  milestones?: Milestone[];
  startDate?: string;
  endDate?: string;
  sourcePath?: string;
}

export function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return unwrapPatch<Project>(`/api/projects/${id}`, input);
}

export function fetchProjectSources(id: string, path?: string): Promise<SourceItem[]> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  return unwrap<SourceItem[]>(`/api/projects/${id}/sources${query}`);
}

export function fetchSourceFile(id: string, path: string): Promise<SourceFile> {
  return unwrap<SourceFile>(`/api/projects/${id}/sources?path=${encodeURIComponent(path)}&content=1`);
}

export function deleteProject(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/projects/${id}`);
}

// --- Tasks update/delete ---------------------------------------------------

export interface UpdateTaskInput {
  title?: string;
  owner?: string;
  progress?: number;
  status?: string;
  type?: string;
  estimatedHours?: number;
  actualHours?: number;
  remainingHours?: number;
  dueDate?: string;
}

export function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return unwrapPatch<Task>(`/api/tasks/${id}`, input);
}

export function deleteTask(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/tasks/${id}`);
}

// --- Sprints update/delete -------------------------------------------------

export interface UpdateSprintInput {
  name?: string;
  goal?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export function updateSprint(id: string, input: UpdateSprintInput): Promise<Sprint> {
  return unwrapPatch<Sprint>(`/api/sprints/${id}`, input);
}

export function deleteSprint(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/sprints/${id}`);
}

// --- Milestones ------------------------------------------------------------

export interface MilestoneInput {
  name: string;
  status?: string;
  date?: string;
}

export function addMilestone(projectId: string, input: MilestoneInput): Promise<{ milestones: Milestone[] }> {
  return unwrapPost<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones`, input);
}

export function deleteMilestone(projectId: string, index: number): Promise<{ milestones: Milestone[] }> {
  return unwrapDel<{ milestones: Milestone[] }>(`/api/projects/${projectId}/milestones/${index}`);
}

// --- Requirements delete ---------------------------------------------------

export function deleteRequirement(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/requirements/${id}`);
}

// --- Test cases update/delete ----------------------------------------------

export interface UpdateTestCaseInput {
  name?: string;
  owner?: string;
  assigneeRole?: string;
  description?: string;
  steps?: string[];
  expectedResult?: string;
  requirementId?: string;
}

export function updateTestCase(id: string, input: UpdateTestCaseInput): Promise<TestCase> {
  return unwrapPatch<RawTestCase>(`/api/test-cases/${id}`, input).then(normalizeTestCase);
}

export function deleteTestCase(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/test-cases/${id}`);
}

// --- Test runs --------------------------------------------------------------

export function createTestRun(input: TestRunInput): Promise<unknown> {
  return unwrapPost<unknown>('/api/test-runs', input);
}

// --- Defects update/delete -------------------------------------------------

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

export function deleteDefect(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/defects/${id}`);
}

// --- Documents update/delete -----------------------------------------------

export interface UpdateDocumentInput {
  title?: string;
  type?: string;
  category?: string;
  owner?: string;
  ownerRole?: string;
  projectId?: string | null;
}

export function updateDocument(id: string, input: UpdateDocumentInput): Promise<Document> {
  return unwrapPatch<Document>(`/api/documents/${id}`, input);
}

export function deleteDocument(id: string): Promise<{ deleted: boolean }> {
  return unwrapDel<{ deleted: boolean }>(`/api/documents/${id}`);
}
