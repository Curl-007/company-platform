import React from 'react';
import {
  Activity,
  BarChart3,
  Box,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  GitBranch,
  LayoutDashboard,
  Package,
  Settings,
  TestTube2,
  UserCheck,
  Users,
  Workflow,
} from 'lucide-react';
import type { PageKey, SessionUser } from '../types';
import { lazyWithRetry } from './lazyWithRetry';

const DashboardPage = lazyWithRetry(() => import('../pages/DashboardPage'));
const ProjectsPage = lazyWithRetry(() => import('../pages/ProjectsPage'));
const ProductsPage = lazyWithRetry(() => import('../pages/ProductsPage'));
const TeamPage = lazyWithRetry(() => import('../pages/TeamPage'));
const TeamLogsPage = lazyWithRetry(() => import('../pages/TeamLogsPage'));
const CapacityPage = lazyWithRetry(() => import('../pages/CapacityPage'));
const RequirementsPage = lazyWithRetry(() => import('../pages/RequirementsPage'));
const TestingPage = lazyWithRetry(() => import('../pages/TestingPage'));
const DocumentsPage = lazyWithRetry(() => import('../pages/DocumentsPage'));
const AiPage = lazyWithRetry(() => import('../pages/AiPage'));
const ReportsPage = lazyWithRetry(() => import('../pages/ReportsPage'));
const FlowPage = lazyWithRetry(() => import('../pages/FlowPage'));
const DynamicPage = lazyWithRetry(() => import('../pages/DynamicPage'));
const DeliveryCenterPage = lazyWithRetry(() => import('../pages/DeliveryCenterPage'));
const MyWorkPage = lazyWithRetry(() => import('../pages/MyWorkPage'));
const SettingsPage = lazyWithRetry(() => import('../pages/SettingsPage'));

export interface NavEntry {
  key: PageKey;
  label: string;
  icon: React.FC<{ size?: number }>;
  phase?: 1 | 2 | 3;
}

export interface NavGroup {
  label: string;
  items: NavEntry[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: '日常工作',
    items: [
      { key: 'dashboard', label: '工作台', icon: LayoutDashboard, phase: 1 },
      { key: 'mywork', label: '我的工作', icon: UserCheck, phase: 1 },
      { key: 'team', label: '团队管理', icon: Users, phase: 1 },
      { key: 'teamlogs', label: '团队日报', icon: ClipboardList, phase: 1 },
      { key: 'capacity', label: '团队容量', icon: Gauge, phase: 1 },
      { key: 'dynamic', label: '动态中心', icon: Activity, phase: 1 },
    ],
  },
  {
    label: '项目交付',
    items: [
      { key: 'projects', label: '项目执行', icon: FolderKanban, phase: 1 },
      { key: 'requirements', label: '需求管理', icon: ClipboardList, phase: 1 },
      { key: 'testing', label: '测试质量', icon: TestTube2, phase: 1 },
      { key: 'delivery', label: '交付中心', icon: Package, phase: 1 },
    ],
  },
  {
    label: '知识与智能',
    items: [
      { key: 'documents', label: '文档中心', icon: FileText, phase: 1 },
      { key: 'ai', label: 'AI 分析', icon: GitBranch, phase: 2 },
      { key: 'reports', label: '报表中心', icon: BarChart3, phase: 2 },
    ],
  },
  {
    label: '管理配置',
    items: [
      { key: 'products', label: '产品管理', icon: Box, phase: 3 },
      { key: 'flow', label: '研发流程', icon: Workflow, phase: 3 },
      { key: 'settings', label: '系统设置', icon: Settings, phase: 1 },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export const KNOWN_PAGES: PageKey[] = [
  ...NAV_ITEMS.map((item) => item.key),
  'builds',
  'releases',
  'login',
];

export const PAGE_COMPONENTS: Record<PageKey, React.FC<{ user?: SessionUser | null }>> = {
  dashboard: DashboardPage,
  projects: ProjectsPage,
  products: ProductsPage,
  team: TeamPage,
  teamlogs: TeamLogsPage,
  capacity: CapacityPage,
  requirements: RequirementsPage,
  testing: TestingPage,
  documents: DocumentsPage,
  ai: AiPage,
  reports: ReportsPage,
  flow: FlowPage,
  dynamic: DynamicPage,
  delivery: DeliveryCenterPage,
  builds: DeliveryCenterPage,
  releases: DeliveryCenterPage,
  mywork: MyWorkPage,
  settings: SettingsPage,
  login: () => null,
};
