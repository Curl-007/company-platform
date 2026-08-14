import { unwrap, unwrapDel, unwrapPatch, unwrapPost } from '../../services/apiClient';
import type { OrganizationUnit, TeamMemberOverview, User } from '../../types';

export function fetchTeamMembers(): Promise<TeamMemberOverview[]> {
  return unwrap<TeamMemberOverview[]>('/api/team/members');
}

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
  departmentId?: string | null;
  bio?: string;
}

export function createUser(input: CreateUserInput): Promise<User> {
  return unwrapPost<User>('/api/users', input, { invalidation: 'team' });
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
  departmentId?: string | null;
  bio?: string;
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return unwrapPatch<User>(`/api/users/${id}`, input, { invalidation: 'team' });
}

export function deleteUser(id: string): Promise<{ deleted?: boolean; disabled?: boolean; id: string }> {
  return unwrapDel<{ deleted?: boolean; disabled?: boolean; id: string }>(`/api/users/${id}`, { invalidation: 'team' });
}

export interface DepartmentInput {
  name: string;
  parentId?: string | null;
  managerUserId?: string | null;
  responsibilities?: string;
  status?: 'active' | 'archived';
}

export function fetchDepartments(): Promise<OrganizationUnit[]> {
  return unwrap<OrganizationUnit[]>('/api/org/departments');
}

export function createDepartment(input: DepartmentInput): Promise<OrganizationUnit> {
  return unwrapPost<OrganizationUnit>('/api/org/departments', input, { invalidation: 'team' });
}

export function updateDepartment(id: string, input: Partial<DepartmentInput>): Promise<OrganizationUnit> {
  return unwrapPatch<OrganizationUnit>(`/api/org/departments/${id}`, input, { invalidation: 'team' });
}

export function deleteDepartment(id: string): Promise<{ deleted: boolean; id: string }> {
  return unwrapDel<{ deleted: boolean; id: string }>(`/api/org/departments/${id}`, { invalidation: 'team' });
}
