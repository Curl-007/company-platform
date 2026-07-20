import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type {
  Build,
  DeliveryGateResult,
  Release,
  ReleaseApproval,
  ReleaseReport,
  RollbackRecord,
} from '../../types';

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
  return unwrapPost<Build>('/api/builds', input);
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
  return unwrapPost<Release>('/api/releases', input);
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
