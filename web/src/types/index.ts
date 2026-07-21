// ---------------------------------------------------------------------------
// Canonical frontend type model.
//
// These types mirror the shapes returned by the backend API (see
// api/db.js mappers and api/server.js routes). The backend is the source of
// truth; keep these aligned with the server response payloads.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Session / Auth
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
  capabilities?: UserCapabilities;
  phone?: string;
  position?: string;
  department?: string;
  departmentId?: string | null;
  bio?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions?: string[];
  capabilities?: UserCapabilities;
  status?: string;
  phone?: string;
  position?: string;
  department?: string;
  departmentId?: string | null;
  bio?: string;
}

export interface UserCapabilities {
  pages: PageKey[];
  operations: string[];
  permissions: string[];
  role: string;
}

export interface OrganizationUnit {
  id: string;
  name: string;
  parentId?: string | null;
  managerUserId?: string | null;
  responsibilities: string;
  status: 'active' | 'archived' | string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  errorCode: string;
  message: string;
  traceId: string;
  details?: Record<string, unknown>;
}

export interface StatusHistoryEntry {
  id: string;
  resourceType: 'project' | 'requirement' | 'task' | 'sprint' | string;
  resourceId: string;
  projectId?: string | null;
  fromStatus?: string | null;
  toStatus: string;
  reason: string;
  actorId?: string | null;
  actorName: string;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  taskId?: string | null;
  workDate: string;
  hours: number;
  category: 'delivery' | 'support' | 'meeting' | 'training' | 'other' | string;
  workNature: 'planned' | 'unplanned' | 'unspecified' | string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Core entities (match api/db.js mappers)
// ---------------------------------------------------------------------------

export interface Milestone {
  name: string;
  status: string;
  date: string;
}

export interface Project {
  id: string;
  name: string;
  objective?: string | null;
  code?: string | null;
  description?: string | null;
  status: string;
  healthScore: number;
  owner: string;
  programId?: string | null;
  productId?: string | null;
  processMode: string;
  progress: number;
  riskCount: number;
  milestones: Milestone[];
  startDate?: string | null;
  endDate?: string | null;
  sourcePath?: string | null;
  version: number;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  tasks: Task[];
  sprints: Sprint[];
}

export interface ProjectRisk {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  status: 'open' | 'monitoring' | 'mitigated' | 'closed' | string;
  ownerId?: string | null;
  ownerName: string;
  mitigationPlan: string;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export interface ProjectDecision {
  id: string;
  projectId: string;
  title: string;
  context: string;
  decision: string;
  ownerId?: string | null;
  ownerName: string;
  status: 'proposed' | 'approved' | 'rejected' | 'superseded' | string;
  decidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  projectId: string;
  productId?: string | null;
  portfolioId?: string | null;
  parentId?: string | null;
  owner: string;
  assignee?: string | null;
  assigneeRole?: string | null;
  assignmentStatus?: string;
  completion: number;
  linkedTasks: string[];
  acceptanceCriteria: string[];
  version: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  statusText: string;
  projectId: string;
  owner: string;
  dueDate: string;
  requirementId?: string | null;
  progress: number;
  blocker?: string | null;
  type: string;
  parentId?: string | null;
  wbsCode: string;
  kanbanColumn: string;
  sortOrder: number;
  estimatedHours: number;
  actualHours: number;
  remainingHours?: number;
  version: number;
  assigneeRole?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface SprintCommitment {
  id: string;
  sprintId: string;
  projectId: string;
  taskIds: string[];
  taskCount: number;
  estimatedHours: number;
  remainingHours: number;
  committedBy?: string | null;
  committedByName: string;
  committedAt: string;
}

export interface SprintScopeChange {
  id: string;
  sprintId: string;
  projectId: string;
  taskId?: string | null;
  changeType: 'add' | 'remove' | 'reestimate' | string;
  impactHours: number;
  reason: string;
  actorId?: string | null;
  actorName: string;
  createdAt: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: Task[];
}

// ---------------------------------------------------------------------------
// Burndown (GET /api/sprints/:id/burndown)
// ---------------------------------------------------------------------------

export interface BurndownIdealPoint {
  date: string;
  ideal: number;
}

export interface BurndownActualPoint {
  date: string;
  remaining: number;
}

export interface BurndownData {
  sprintId: string;
  startDate: string;
  endDate: string;
  totalEstimate: number;
  ideal: BurndownIdealPoint[];
  actual: BurndownActualPoint[];
  taskCount: number;
}

// ---------------------------------------------------------------------------
// Project flow (GET /api/projects/:id/flow)
// ---------------------------------------------------------------------------

export type GateState = 'done' | 'passed' | 'in_progress' | 'blocked' | 'pending';

export interface GateCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface FlowGate {
  stage: string;
  label: string;
  state: GateState;
  checks: GateCheck[];
  description?: string;
  exitCriteria?: string[];
  evidence?: string[];
}

export interface DefectFunnelData {
  new: number;
  confirmed: number;
  in_fix: number;
  resolved: number;
  closed: number;
  total: number;
}

export interface FlowHours {
  estimated: number;
  consumed: number;
  remaining: number;
}

export interface ProjectWorkflowInfo {
  templateId: string;
  templateName?: string | null;
  templateVersion?: string | null;
  bindingSource?: string | null;
  mode?: 'fixed' | 'configurable' | string;
}

export interface ProjectFlow {
  projectId: string;
  projectName: string;
  status: string;
  healthScore: number;
  workflow?: ProjectWorkflowInfo | null;
  gates: FlowGate[];
  defectFunnel: DefectFunnelData;
  hours: FlowHours;
  counts: { requirements: number; tasks: number; defects: number; testCases: number };
}

// Cross-project flow overview (GET /api/flow/overview)
export interface FlowOverviewItem {
  projectId: string;
  projectName: string;
  status: string;
  healthScore: number;
  currentStage: string;
  workflow?: ProjectWorkflowInfo | null;
  gates: { stage: string; state: GateState; label?: string }[];
}

// Workflow template catalog (GET /api/flow/templates)
export interface WorkflowGateRule {
  id: string;
  op?: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | string;
  threshold?: number | boolean | string;
  required?: boolean;
}

export interface WorkflowStage {
  id: string;
  label: string;
  description?: string;
  evidence?: string[];
  exitCriteria?: string[];
  rules?: WorkflowGateRule[];
}

export interface GateRuleCatalogItem {
  id: string;
  label: string;
  description?: string;
  valueType: 'boolean' | 'ratio' | string;
  defaultOp?: string;
  defaultThreshold?: number | boolean;
}

export interface GateRuleCatalog {
  version: string;
  rules: GateRuleCatalogItem[];
  defaultStageRules?: Record<string, WorkflowGateRule[]>;
}

export interface WorkflowResourceFlow {
  resource: 'project' | 'requirement' | 'task' | 'sprint' | 'aiJob' | string;
  label: string;
  statuses: string[];
  transitions: Record<string, string[]>;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  version: string;
  scope?: 'project' | string;
  mode: 'fixed' | 'configurable' | string;
  status?: 'draft' | 'published' | string;
  description: string;
  processModes: string[];
  stages: WorkflowStage[];
  resources: WorkflowResourceFlow[];
  guardrails: string[];
  builtin?: boolean;
  source?: string;
  createdBy?: string | null;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkflowTemplateCatalog {
  version: string;
  source: string;
  templates: WorkflowTemplate[];
}

export interface WorkflowTemplateInput {
  name: string;
  description?: string;
  processModes?: string[];
  stages: WorkflowStage[];
  guardrails?: string[];
}

export interface ProjectWorkflowBinding {
  projectId: string;
  templateId: string;
  templateVersion: string;
  source: string;
  boundAt?: string | null;
  boundBy?: string | null;
  template?: { id: string; name: string; version: string; status?: string } | null;
}

// ---------------------------------------------------------------------------
// Build (构建)
// ---------------------------------------------------------------------------

export interface Build {
  id: string;
  projectId: string;
  name: string;
  version?: string | null;
  buildDate?: string | null;
  status: string;
  linkedStories: string[];
  linkedBugs: string[];
  scmHash?: string | null;
  creator?: string | null;
  notes?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Release (发布)
// ---------------------------------------------------------------------------

export interface Release {
  id: string;
  productId?: string | null;
  name: string;
  version?: string | null;
  releaseDate?: string | null;
  buildId?: string | null;
  releaseType: string;
  linkedStories: string[];
  linkedBugs: string[];
  releaseNotes?: string | null;
  creator?: string | null;
  creatorId?: string | null;
  status: string;
  createdAt: string;
}

export interface DeliveryGateLine {
  id: string;
  label: string;
  passed: boolean;
  state: 'passed' | 'blocked';
  message: string;
  details?: Record<string, unknown>;
}

export interface DeliveryGateResult {
  kind: 'build' | 'release';
  id: string;
  targetStatus: string;
  ready: boolean;
  score: number;
  summary: string;
  gates: DeliveryGateLine[];
}

export interface ReleaseApproval {
  id: string;
  releaseId: string;
  decision: 'approve' | 'reject';
  comment: string;
  approverId?: string | null;
  approverName: string;
  createdAt: string;
}

export interface RollbackRecord {
  id: string;
  releaseId: string;
  reason: string;
  impact: string;
  plan: string;
  operatorId?: string | null;
  operatorName: string;
  createdAt: string;
}

export interface DeliveryAuditTrailItem {
  id: string;
  action: string;
  actorName: string;
  resourceType: string;
  resourceId: string;
  createdAt: string;
}

export interface ReleaseReport {
  release: Release;
  build?: Build | null;
  gate: DeliveryGateResult;
  requirements: Requirement[];
  defects: Defect[];
  approvals: ReleaseApproval[];
  rollbacks: RollbackRecord[];
  auditTrail: DeliveryAuditTrailItem[];
  metrics: {
    requirementCount: number;
    defectCount: number;
    openDefectCount: number;
    approvalCount: number;
    rollbackCount: number;
    auditCount: number;
    readyScore: number;
  };
  summary: string;
  recommendations: string[];
}

export interface Document {
  id: string;
  title: string;
  type: string;
  category?: string;
  version: string;
  aiStatus: string;
  owner: string;
  ownerRole?: string | null;
  projectId?: string | null;
  updatedAt: string;
  linkedRequirements: string[];
  risks: string[];
  fileName: string;
  fileSize: number;
  fileType: string;
  storedFile?: string | null;
  content?: string;
  collabRevision?: number;
}

export interface Defect {
  id: string;
  title: string;
  description?: string | null;
  severity: string;
  status: string;
  projectId: string;
  requirementId?: string | null;
  assignee?: string | null;
  assigneeRole?: string | null;
  foundInBuild?: string | null;
  affectedVersion?: string | null;
  reporter?: string | null;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string | null;
  steps?: string[];
  expectedResult?: string | null;
  requirementId?: string | null;
  projectId: string;
  status: string;
  owner: string;
  assigneeRole?: string | null;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
}

export interface TestStep {
  stepNumber: number;
  action: string;
  expectedResult: string;
}

export interface SourceItem {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

export interface SourceFile {
  path?: string;
  content: string;
  language: string;
  truncated: boolean;
  lineCount: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileTreeNode[];
  expanded?: boolean;
}

export interface TestRunInput {
  testCaseId: string;
  result: 'passed' | 'failed' | 'blocked';
  notes?: string;
}

export interface Program {
  id: string;
  name: string;
  objective: string;
  owner: string;
  status: string;
  healthScore: number;
  progress: number;
  projectIds: string[];
  risks: string[];
  updatedAt: string;
}

export interface StrategicGoal {
  id: string;
  name: string;
  objective: string;
  owner: string;
  status: 'draft' | 'active' | 'on_hold' | 'achieved' | 'closed' | string;
  periodStart?: string | null;
  periodEnd?: string | null;
  successMetrics: string[];
  programIds: string[];
  portfolioIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Portfolio {
  id: string;
  name: string;
  objective: string;
  owner: string;
  status: string;
  productIds: string[];
  roadmap: RoadmapItem[];
}

export interface RoadmapItem {
  version?: string;
  title?: string;
  quarter?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Product {
  id: string;
  name: string;
  owner: string;
  version: string;
  stage: string;
  description?: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  systemName?: string;
  systemVersion?: string;
  applicationVersion?: string;
  modules: ProductModule[];
  hardwareInfo?: Record<string, unknown>;
  systemInfo?: Record<string, unknown>;
  applicationInfo?: Record<string, unknown>;
  hardwareMetrics?: ProductMetric[];
  systemMetrics?: ProductMetric[];
  appMetrics?: ProductMetric[];
  roadmap: RoadmapItem[];
}

export interface ProductModule {
  name?: string;
  status?: string;
  owner?: string;
  [key: string]: unknown;
}

export interface ProductMetric {
  label: string;
  value: string;
  unit?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export interface AiSummary {
  title: string;
  summary: string;
  risks: string[];
  recommendations: string[];
  scope?: string;
  aiProvider?: AiProviderConfig;
  generatedBy?: string;
  modelUsed?: string;
  modelRoutes?: AiSummaryModelRoute[];
}

export interface AiSummaryModelRoute {
  scene: string;
  modelStrategy: string;
  status: 'active' | 'degraded' | 'unavailable' | 'disabled' | 'unconfigured';
  humanReview: string;
  audit: string;
  provider?: string;
  activeProviderId?: string | null;
  configuredProviderCount?: number;
  providerCount?: number;
  healthStatus?: string;
  lastCheckedAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastErrorCode?: string;
}

export interface AiProviderConfig {
  id?: string | null;
  name?: string;
  provider: string;
  baseUrl: string;
  baseUrlHost: string;
  model: string;
  wireApi: 'chat_completions' | 'responses';
  disableResponseStorage: boolean;
  enabled: boolean;
  configured: boolean;
  apiKeyMasked: string;
  apiKeySource: 'database' | 'environment' | 'none';
  updatedAt?: string | null;
  health?: AiProviderHealth;
  activeId?: string | null;
  providers?: AiProviderListItem[];
}

export interface AiProviderHealth {
  status: 'healthy' | 'degraded' | 'unavailable' | 'unconfigured' | 'unknown' | 'disabled';
  lastAttemptAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  lastLatencyMs?: number | null;
  lastWireApi?: 'chat_completions' | 'responses' | string | null;
  lastErrorMessage?: string;
  lastErrorCode?: string;
  consecutiveFailures?: number;
}

export interface UpdateAiProviderInput {
  id?: string;
  name?: string;
  provider: string;
  baseUrl: string;
  model: string;
  wireApi: 'chat_completions' | 'responses';
  disableResponseStorage: boolean;
  enabled?: boolean;
  apiKey?: string;
  clearApiKey?: boolean;
  createNew?: boolean;
  activate?: boolean;
}

export interface AiProviderListItem {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  baseUrlHost: string;
  model: string;
  wireApi: 'chat_completions' | 'responses';
  disableResponseStorage: boolean;
  enabled: boolean;
  configured: boolean;
  apiKeyMasked: string;
  apiKeySource: 'database' | 'environment' | 'none';
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AiProviderTestResult {
  ok: boolean;
  latencyMs: number;
  sample: string;
  provider: AiProviderConfig;
}

export interface AiChatAttachment {
  name: string;
  mimeType: string;
  size: number;
  kind?: 'image' | 'document';
  contentText?: string;
  contentBase64?: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments?: AiChatAttachment[];
  modelUsed?: string;
  generatedBy?: string;
  fallback?: boolean;
  provider?: AiProviderConfig;
}

export interface AiChatInput {
  messages: Array<Pick<AiChatMessage, 'role' | 'content'>>;
  attachments?: AiChatAttachment[];
  scope?: string;
  currentPage?: string;
}

export interface AiJobRequirementDraft {
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  acceptanceCriteria?: string[];
}

export interface ConfirmAiJobInput {
  projectId?: string;
  requirement?: AiJobRequirementDraft;
}

export interface AiEvidence {
  documentId?: string;
  pageNo?: number;
  quote: string;
}

export interface AiJob {
  jobId: string;
  scene: string;
  status: string;
  progress: number;
  currentStep: string;
  result: Record<string, unknown>;
  evidence: AiEvidence[];
  writtenRequirementId?: string | null;
  errorMessage?: string | null;
  retryCount?: number;
  startedAt?: string | null;
  failedAt?: string | null;
  rejectedAt?: string | null;
  rejectedReason?: string | null;
  createdAt?: string;
  confirmedAt?: string | null;
}

export interface WorkLogAnalysis {
  completedItems: string[];
  blockers: string[];
  linkedRequirements: Array<{
    id: string;
    title: string;
    known: boolean;
    currentCompletion: number | null;
  }>;
  progressChange: { from: number | null; to: number | null; delta: number | null };
  confidence: string;
  suggestedActions: string[];
  modelUsed?: string;
}

export interface CompletionScore {
  requirementId: string;
  score: number;
  taskScore: number;
  testScore: number;
  logScore: number;
  declaredCompletion: number;
  hardRules?: string[];
  recommendation?: string;
  modelUsed?: string;
}

export interface AiBusinessAdvice {
  title: string;
  summary: string;
  risks: string[];
  suggestions: string[];
  nextActions: string[];
  missingInfo: string[];
  modelUsed?: string;
  generatedBy?: string;
  fallback?: boolean;
}

export interface AiBusinessAdviceInput {
  targetType: 'requirement' | 'project' | 'test_case' | 'defect' | 'build' | 'release' | 'document';
  targetId: string;
  question?: string;
  draft?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dashboard (GET /api/dashboard -> buildDashboard())
// ---------------------------------------------------------------------------

export interface DashboardMetrics {
  tasks: Record<string, number> & { total: number };
  projectHealthAverage: number;
  requirementCompletionAverage: number;
  testPassRate: number;
  openRisks: number;
  documentCount: number;
}

export interface RequirementProgress {
  id: string;
  title: string;
  completion: number;
  projectId: string;
  projectName: string;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  focusTasks: Task[];
  riskyProjects: Project[];
  requirementProgress: RequirementProgress[];
  ai: AiSummary;
  myDefects?: Defect[];
  myBuilds?: Build[];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditLogRecord {
  id: string;
  actorId?: string | null;
  actorName: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  before?: unknown;
  after?: unknown;
}

// ---------------------------------------------------------------------------
// Work logs
// ---------------------------------------------------------------------------

export interface WorkLog {
  id: string;
  author: string;
  authorId?: string | null;
  role?: string;
  projectId?: string | null;
  project: string;
  content: string;
  blockers: string;
  nextPlan: string;
  analysis: WorkLogAnalysis;
  logDate?: string;
  sourceDocumentId?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  weekKey?: string;
  weeklySummary?: string;
  createdAt: string;
}

export interface WorkLogPayload {
  projectId?: string;
  project?: string;
  content: string;
  blockers?: string;
  nextPlan?: string;
  logDate?: string;
  sourceDocumentId?: string;
  fileName?: string;
  fileType?: string;
  contentBase64?: string;
}

export interface WeeklyWorkSummary {
  author: string;
  weekKey: string;
  count: number;
  summary: {
    summary: string;
    completedItems: string[];
    blockers: string[];
    nextPlans: string[];
    linkedRequirements: Array<{ id: string; title: string }>;
  };
  markdown: string;
}

export interface TeamWorkSummaryMember {
  author: string;
  role: string;
  count: number;
  summary: {
    summary: string;
    completedItems: string[];
    blockers: string[];
    nextPlans: string[];
    linkedRequirements: Array<{ id: string; title: string }>;
  };
  markdown: string;
}

export interface TeamWorkSummary {
  project: string;
  weekKey: string;
  submittedCount: number;
  missingCount: number;
  members: TeamWorkSummaryMember[];
  missingMembers: Array<{ name: string; role: string }>;
  overall: {
    summary: string;
    completedItems: string[];
    blockers: string[];
    nextPlans: string[];
    linkedRequirements: Array<{ id: string; title: string }>;
  };
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId?: string | null;
  userName: string;
  role: string;
  source: string;
  createdAt: string;
}

export interface TeamMemberProject {
  id: string;
  name: string;
  role: string;
  status: string;
  progress: number;
}

export interface TeamMemberTaskSummary {
  id: string;
  title: string;
  status: string;
  projectId: string;
  progress: number;
  dueDate?: string | null;
}

export interface TeamMemberLogSummary {
  id: string;
  projectId?: string | null;
  project: string;
  content: string;
  blockers: string;
  logDate?: string | null;
  createdAt: string;
}

export interface TeamMemberStats {
  totalTasks: number;
  activeTasks: number;
  doneTasks: number;
  blockedTasks: number;
  requirements: number;
  openDefects: number;
  workLogs: number;
  blockers: number;
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
}

export interface TeamMemberOverview extends User {
  department: string;
  presence: 'online' | 'away' | 'offline';
  skills: string[];
  stats: TeamMemberStats;
  projects: TeamMemberProject[];
  recentTasks: TeamMemberTaskSummary[];
  recentLogs: TeamMemberLogSummary[];
  lastActiveAt?: string | null;
}

// ---------------------------------------------------------------------------
// Capacity planning
// ---------------------------------------------------------------------------

export interface CapacityPlan {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  workingDays: number;
  manualWorkingDays: number;
  useCalendar: boolean;
  calendarWorkingDays?: number | null;
  dailyHours: number;
  meetingHours: number;
  trainingHours: number;
  supportHours: number;
  otherCommitmentHours: number;
  theoreticalHours: number;
  unavailableHours: number;
  effectiveHours: number;
  notes: string;
  updatedBy?: string | null;
  updatedAt: string;
}

export interface WorkCalendarException {
  id: string;
  calendarId: string;
  date: string;
  isWorkingDay: boolean;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkCalendar {
  id: string;
  name: string;
  timezone: string;
  workingWeekdays: number[];
  isDefault: boolean;
  workingDays: number;
  exceptions: WorkCalendarException[];
}

export interface ProjectAllocation {
  id: string;
  projectId: string;
  projectName: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  allocationPercent: number;
  plannedHours: number;
  configuredPlannedHours?: number | null;
  notes: string;
  overloadReason?: string;
  approvalStatus?: 'approved' | 'pending' | string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  updatedBy?: string | null;
  updatedAt: string;
}

export interface CapacityRisk {
  code: 'unconfigured' | 'underallocated' | 'balanced' | 'attention' | 'overloaded';
  label: string;
}

export interface CapacityMemberOverview {
  userId: string;
  userName: string;
  role: string;
  plan: CapacityPlan | null;
  allocations: ProjectAllocation[];
  effectiveHours: number;
  plannedHours: number;
  actualHours: number;
  unplannedActualHours: number;
  classifiedActualHours: number;
  unplannedRatio: number | null;
  currentWipCount: number;
  projectFragmentationCount: number;
  fragmentationRisk: boolean;
  allocationPercent: number;
  loadRatio: number | null;
  risk: CapacityRisk;
}

export interface CapacityOverview {
  period: { periodStart: string; periodEnd: string };
  thresholds: { balancedMin: number; attentionMin: number; overloadedAbove: number };
  calendar: WorkCalendar;
  summary: {
    memberCount: number;
    configuredCount: number;
    overloadedCount: number;
    attentionCount: number;
    pendingOverrideCount: number;
    highFragmentationCount: number;
    totalEffectiveHours: number;
    totalPlannedHours: number;
    totalActualHours: number;
    totalUnplannedActualHours: number;
    totalClassifiedActualHours: number;
  };
  members: CapacityMemberOverview[];
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export type PageKey =
  | 'dashboard'
  | 'projects'
  | 'products'
  | 'team'
  | 'teamlogs'
  | 'capacity'
  | 'requirements'
  | 'testing'
  | 'documents'
  | 'ai'
  | 'reports'
  | 'flow'
  | 'dynamic'
  | 'delivery'
  | 'builds'
  | 'releases'
  | 'mywork'
  | 'settings'
  | 'login';
