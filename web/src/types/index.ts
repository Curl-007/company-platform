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
}

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string };
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
  status: string;
  healthScore: number;
  owner: string;
  programId?: string | null;
  productId?: string | null;
  processMode: string;
  progress: number;
  riskCount: number;
  milestones: Milestone[];
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  tasks: Task[];
  sprints: Sprint[];
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
  owner: string;
  completion: number;
  linkedTasks: string[];
  acceptanceCriteria: string[];
}

export interface Task {
  id: string;
  title: string;
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

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: Task[];
}

export interface Document {
  id: string;
  title: string;
  type: string;
  version: string;
  aiStatus: string;
  owner: string;
  updatedAt: string;
  linkedRequirements: string[];
  risks: string[];
  fileName: string;
  fileSize: number;
  fileType: string;
  storedFile?: string | null;
  content?: string;
}

export interface Defect {
  id: string;
  title: string;
  severity: string;
  status: string;
  projectId: string;
  requirementId?: string | null;
  assignee?: string | null;
}

export interface TestCase {
  id: string;
  name: string;
  requirementId?: string | null;
  projectId: string;
  status: string;
  owner: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  blockedCases: number;
}

export interface Program {
  id: string;
  name: string;
  owner: string;
  status: string;
  healthScore: number;
  progress: number;
  projectIds: string[];
  risks: string[];
  updatedAt: string;
}

export interface Portfolio {
  id: string;
  name: string;
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
  modules: ProductModule[];
  roadmap: RoadmapItem[];
}

export interface ProductModule {
  name?: string;
  status?: string;
  owner?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Organization (GET /api/org)
// ---------------------------------------------------------------------------

export interface Department {
  id: string;
  name: string;
  lead: string;
  members: number;
  load: number;
  responsibilities: string[];
}

export interface Person {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  activeProjects: number;
}

export interface Organization {
  departments: Department[];
  people: Person[];
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
}

export interface CompletionScore {
  requirementId: string;
  score: number;
  taskScore: number;
  testScore: number;
  declaredCompletion: number;
  recommendation?: string;
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
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditLogRecord {
  id: string;
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

export interface WorkLogPayload {
  author?: string;
  project?: string;
  content: string;
  blockers?: string;
  nextPlan?: string;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export type PageKey =
  | 'dashboard'
  | 'projects'
  | 'products'
  | 'requirements'
  | 'testing'
  | 'documents'
  | 'organization'
  | 'ai'
  | 'reports'
  | 'flow'
  | 'settings'
  | 'login';
