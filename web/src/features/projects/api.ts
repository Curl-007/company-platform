import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type {
  FlowOverviewItem,
  Milestone,
  Project,
  ProjectDetail,
  ProjectFlow,
  ProjectMember,
  ProjectRisk,
  ProjectDecision,
  SourceFile,
  SourceItem,
} from '../../types';

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

export function fetchProjectFlow(id: string): Promise<ProjectFlow> {
  return unwrap<ProjectFlow>(`/api/projects/${id}/flow`);
}

export function fetchFlowOverview(): Promise<FlowOverviewItem[]> {
  return unwrap<FlowOverviewItem[]>('/api/flow/overview');
}

export function updateProjectStatus(id: string, status: string, version: number): Promise<Project> {
  return unwrapPatch<Project>(`/api/projects/${id}/status`, { status, version });
}

export interface CreateProjectInput {
  name: string;
  owner: string;
  objective?: string;
  status?: string;
  progress?: number;
  programId?: string | null;
  productId?: string | null;
  processMode?: string;
}

export function createProject(input: CreateProjectInput, idempotencyKey?: string): Promise<Project> {
  return unwrapPost<Project>('/api/projects', input, {
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  });
}

export interface UpdateProjectInput {
  version: number;
  name?: string;
  objective?: string;
  code?: string;
  description?: string;
  owner?: string;
  status?: string;
  progress?: number;
  processMode?: string;
  programId?: string | null;
  productId?: string | null;
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

export function fetchProjectRisks(projectId: string): Promise<ProjectRisk[]> {
  return unwrap<ProjectRisk[]>(`/api/projects/${projectId}/risks`);
}

export function fetchProjectDecisions(projectId: string): Promise<ProjectDecision[]> {
  return unwrap<ProjectDecision[]>(`/api/projects/${projectId}/decisions`);
}

export interface CreateProjectRiskInput {
  title: string;
  description?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ownerId?: string;
  ownerName?: string;
  mitigationPlan?: string;
  dueDate?: string;
}

export type UpdateProjectRiskInput = Partial<CreateProjectRiskInput> & {
  status?: 'open' | 'monitoring' | 'mitigated' | 'closed';
};

export function createProjectRisk(projectId: string, input: CreateProjectRiskInput): Promise<ProjectRisk> {
  return unwrapPost<ProjectRisk>(`/api/projects/${projectId}/risks`, input);
}

export function updateProjectRisk(projectId: string, riskId: string, input: UpdateProjectRiskInput): Promise<ProjectRisk> {
  return unwrapPatch<ProjectRisk>(`/api/projects/${projectId}/risks/${riskId}`, input);
}

export interface CreateProjectDecisionInput {
  title: string;
  context?: string;
  decision?: string;
  status?: 'proposed' | 'approved' | 'rejected' | 'superseded';
}

export function createProjectDecision(projectId: string, input: CreateProjectDecisionInput): Promise<ProjectDecision> {
  return unwrapPost<ProjectDecision>(`/api/projects/${projectId}/decisions`, input);
}
