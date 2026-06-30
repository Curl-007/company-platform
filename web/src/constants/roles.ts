import type { PageKey, SessionUser } from '../types';

export type Role = 'admin' | 'pm' | 'pdm' | 'dev' | 'qa';

export const ROLE_LABELS: Record<Role, string> = {
  admin: '管理员',
  pm: '项目经理',
  pdm: '产品经理',
  dev: '开发',
  qa: '测试',
};

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: '管理员（全站权限）' },
  { value: 'pm', label: '项目经理（项目/需求/测试/构建/发布/报表）' },
  { value: 'pdm', label: '产品经理（产品/需求/文档/项目查看）' },
  { value: 'dev', label: '开发（项目/需求/构建/文档）' },
  { value: 'qa', label: '测试（测试/缺陷/文档）' },
];

const ROLE_PAGES: Record<Role, PageKey[]> = {
  admin: [
    'dashboard', 'projects', 'mywork', 'team', 'teamlogs', 'requirements', 'testing', 'builds',
    'releases', 'delivery', 'flow', 'documents', 'reports', 'dynamic', 'ai', 'products',
    'settings',
  ],
  pm: [
    'dashboard', 'projects', 'mywork', 'team', 'teamlogs', 'requirements', 'testing', 'builds',
    'releases', 'delivery', 'flow', 'documents', 'reports', 'dynamic', 'ai', 'products',
  ],
  pdm: [
    'dashboard', 'projects', 'mywork', 'products', 'requirements', 'documents', 'dynamic',
  ],
  dev: [
    'dashboard', 'projects', 'mywork', 'requirements', 'builds', 'delivery', 'documents', 'dynamic',
  ],
  qa: [
    'dashboard', 'mywork', 'testing', 'documents', 'dynamic',
  ],
};

export function resolveRole(role: string | undefined | null): Role {
  if (role && role in ROLE_PAGES) return role as Role;
  return 'dev';
}

export function canAccessPage(role: string | undefined | null, page: PageKey): boolean {
  const currentRole = resolveRole(role);
  return ROLE_PAGES[currentRole].includes(page);
}

export function canAccessPageForUser(user: SessionUser | null | undefined, page: PageKey): boolean {
  if (!user) return false;
  if (page === 'login') return true;
  const pages = user.capabilities?.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    if (pages.includes(page)) return true;
    if (page === 'delivery') return pages.includes('builds') || pages.includes('releases');
    return false;
  }
  return canAccessPage(user.role, page);
}

function hasPermission(user: SessionUser | null | undefined, permission: string): boolean {
  const permissions = user?.capabilities?.permissions ?? user?.permissions ?? [];
  if (permissions.includes('*')) return true;
  if (permissions.includes(permission)) return true;
  const [namespace] = permission.split(':');
  return Boolean(namespace && permissions.includes(`${namespace}:*`));
}

export function canOperate(user: SessionUser | null | undefined, operation: string): boolean {
  if (!user) return false;
  const operations = user.capabilities?.operations;
  if (Array.isArray(operations) && operations.length > 0) return operations.includes(operation);

  if (operation.startsWith('users:') || operation === 'aiProvider:manage') {
    return hasPermission(user, 'admin:*');
  }
  if (operation.startsWith('projects:') || operation === 'projectMembers:manage') {
    return hasPermission(user, 'project:*') || hasPermission(user, 'project:update');
  }
  if (operation === 'products:manage') return hasPermission(user, 'product:*');
  if (operation === 'requirements:manage') return hasPermission(user, 'requirement:*');
  if (operation === 'testing:manage') return hasPermission(user, 'test:*') || hasPermission(user, 'project:*');
  if (operation === 'delivery:manage') return hasPermission(user, 'build:*') || hasPermission(user, 'project:*');
  if (operation === 'documents:manage') return hasPermission(user, 'document:*');
  if (operation === 'ai:analyze') return hasPermission(user, 'ai:*');
  if (operation === 'audit:read') return hasPermission(user, 'audit:read');
  if (operation === 'source:read') return hasPermission(user, 'source:read');
  return false;
}

export function filterPagesByRole(role: string | undefined | null, pages: PageKey[]): PageKey[] {
  const currentRole = resolveRole(role);
  return pages.filter((page) => ROLE_PAGES[currentRole].includes(page));
}

export function filterPagesForUser(user: SessionUser | null | undefined, pages: PageKey[]): PageKey[] {
  return pages.filter((page) => canAccessPageForUser(user, page));
}
