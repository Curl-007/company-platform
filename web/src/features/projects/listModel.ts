import type { Project, SessionUser } from '../../types';

export type ProjectFilter = 'all' | 'mine' | 'risk' | 'active';

export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (b.riskCount !== a.riskCount) return b.riskCount - a.riskCount;
    if (a.healthScore !== b.healthScore) return a.healthScore - b.healthScore;
    if (a.progress !== b.progress) return a.progress - b.progress;
    return a.name.localeCompare(b.name);
  });
}

export function filterProjects(projects: Project[], keyword: string, filter: ProjectFilter, currentUser?: SessionUser | null): Project[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  return projects.filter((project) => {
    if (!project.name.toLowerCase().includes(normalizedKeyword)) return false;
    if (filter === 'mine') return currentUser ? project.owner === currentUser.name : false;
    if (filter === 'risk') return project.riskCount > 0 || project.healthScore < 70;
    if (filter === 'active') return !['done', 'cancelled'].includes(project.status);
    return true;
  });
}
