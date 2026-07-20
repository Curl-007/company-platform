import {
  BUILD_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  labelOf,
} from '../../constants/enums';
import type {
  Build,
  Defect,
  DeliveryGateResult,
  Product,
  Project,
  Release,
  Requirement,
} from '../../types';

export type DeliveryTab = 'overview' | 'builds' | 'releases' | 'gates';
export type DeliveryKind = 'build' | 'release';
export type StageTone = 'done' | 'running' | 'idle' | 'risk';

export interface DeliveryRecord {
  id: string;
  kind: DeliveryKind;
  title: string;
  version?: string | null;
  status: string;
  date?: string | null;
  ownerLabel: string;
  ownerId?: string | null;
  linkedStories: string[];
  linkedBugs: string[];
  notes?: string | null;
  buildId?: string | null;
  source: Build | Release;
}

export const BUILD_STATUS_OPTIONS = ['building', 'testing', 'released', 'failed'];
export const RELEASE_STATUS_OPTIONS = ['draft', 'staging', 'released', 'rollback'];

export function initialDeliveryTab(): DeliveryTab {
  const page = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (page === 'builds') return 'builds';
  if (page === 'releases') return 'releases';
  return 'overview';
}

export function currentDeliveryRoute(): { page: string; focusId: string | null } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [page = '', query = ''] = hash.split('?');
  return {
    page,
    focusId: new URLSearchParams(query).get('focus'),
  };
}

export function splitIds(value: string): string[] {
  return value
    .split(/[,，\n\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value?: string | null): string {
  if (!value) return '未设置';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('zh-CN');
}

export function statusLabel(kind: DeliveryKind, status: string): string {
  return kind === 'build' ? labelOf(BUILD_STATUS_LABELS, status) : labelOf(RELEASE_STATUS_LABELS, status);
}

export function statusOptions(kind: DeliveryKind): string[] {
  return kind === 'build' ? BUILD_STATUS_OPTIONS : RELEASE_STATUS_OPTIONS;
}

export function statusTone(record: DeliveryRecord): 'success' | 'warning' | 'risk' | 'info' {
  if (record.status === 'released') return 'success';
  if (record.status === 'failed' || record.status === 'rollback') return 'risk';
  if (record.status === 'testing' || record.status === 'staging') return 'info';
  return 'warning';
}

export function releaseReadiness(record: DeliveryRecord): number {
  let score = 20;
  if (record.version) score += 20;
  if (record.date) score += 15;
  if (record.linkedStories.length > 0) score += 20;
  if (record.linkedBugs.length === 0) score += 15;
  if (record.notes) score += 10;
  if (record.status === 'released') score = 100;
  if (record.status === 'failed' || record.status === 'rollback') score = Math.min(score, 45);
  return Math.min(100, score);
}

export function buildRecords(
  builds: Build[],
  releases: Release[],
  projects: Project[],
  products: Product[],
): DeliveryRecord[] {
  const projectMap = new Map(projects.map((item) => [item.id, item.name]));
  const productMap = new Map(products.map((item) => [item.id, item.name]));
  return [
    ...builds.map((build): DeliveryRecord => ({
      id: build.id,
      kind: 'build',
      title: build.name,
      version: build.version,
      status: build.status,
      date: build.buildDate,
      ownerId: build.projectId,
      ownerLabel: projectMap.get(build.projectId) ?? build.projectId,
      linkedStories: build.linkedStories ?? [],
      linkedBugs: build.linkedBugs ?? [],
      notes: build.notes,
      source: build,
    })),
    ...releases.map((release): DeliveryRecord => ({
      id: release.id,
      kind: 'release',
      title: release.name,
      version: release.version,
      status: release.status,
      date: release.releaseDate,
      ownerId: release.productId,
      ownerLabel: release.productId ? productMap.get(release.productId) ?? release.productId : '未关联产品',
      linkedStories: release.linkedStories ?? [],
      linkedBugs: release.linkedBugs ?? [],
      notes: release.releaseNotes,
      buildId: release.buildId,
      source: release,
    })),
  ].sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

export function buildDeliveryAiPrompt(
  records: DeliveryRecord[],
  gates: DeliveryGateResult[],
  requirements: Requirement[],
  defects: Defect[],
): string {
  const blockedGates = gates.filter((item) => !item.ready);
  const openDefects = defects.filter((item) => item.status !== 'closed');
  const seriousOpenDefects = openDefects.filter((item) => ['blocker', 'critical', 'high'].includes(item.severity));
  const unfinishedRequirements = requirements.filter((item) => !['done', 'closed', 'accepted', 'completed'].includes(item.status));
  const candidates = records.filter((item) => item.kind === 'build' && item.status === 'released');
  const releases = records.filter((item) => item.kind === 'release');
  const latestRecords = records.slice(0, 10).map((item) => {
    const gate = gates.find((gateItem) => gateItem.kind === item.kind && gateItem.id === item.id);
    return `${item.kind === 'build' ? '构建' : '发布'} ${item.id} ${item.title} / ${item.version || '无版本'} / ${statusLabel(item.kind, item.status)} / 就绪 ${gate?.score ?? releaseReadiness(item)}% / 门禁 ${gate ? (gate.ready ? '通过' : '阻断') : '未知'} / 需求 ${item.linkedStories.length} / 缺陷 ${item.linkedBugs.length}`;
  });
  const blockedGateLines = blockedGates.slice(0, 8).map((item) => {
    const record = records.find((recordItem) => recordItem.kind === item.kind && recordItem.id === item.id);
    const failed = item.gates.filter((gate) => !gate.passed).map((gate) => `${gate.label}: ${gate.message}`).join('；');
    return `${item.kind === 'build' ? '构建' : '发布'} ${item.id} ${record?.title || ''} / ${item.score}% / ${item.summary} / ${failed || '未给出阻断项'}`;
  });
  const defectLines = seriousOpenDefects.slice(0, 8).map((item) => `${item.id} ${item.title} / ${item.severity} / ${item.status} / ${item.assignee || '未分配'}`);
  const requirementLines = unfinishedRequirements.slice(0, 8).map((item) => `${item.id} ${item.title} / ${item.status} / ${item.priority} / ${item.completion ?? 0}%`);

  return [
    '请作为交付经理 AI 助手，基于下面构建、发布、门禁、需求和缺陷快照，给出发布准备度分析。',
    '请控制在 900 字以内，输出：1. 当前能否发布 2. 主要阻塞/风险 3. 候选版本处理建议 4. 发布治理动作 5. 需要补齐的数据。',
    '建议必须具体到版本、构建、发布、门禁、缺陷或需求，不要泛泛而谈。',
    '',
    `交付记录总数：${records.length}，构建候选：${candidates.length}，发布单：${releases.length}`,
    `门禁结果：${gates.length} 条，阻断：${blockedGates.length} 条`,
    `未完成需求：${unfinishedRequirements.length}，未关闭缺陷：${openDefects.length}，高严重未关闭缺陷：${seriousOpenDefects.length}`,
    '',
    '最近交付记录：',
    latestRecords.length ? latestRecords.join('\n') : '暂无交付记录',
    '',
    '阻断门禁：',
    blockedGateLines.length ? blockedGateLines.join('\n') : '暂无阻断门禁',
    '',
    '高严重未关闭缺陷：',
    defectLines.length ? defectLines.join('\n') : '暂无高严重未关闭缺陷',
    '',
    '未完成需求：',
    requirementLines.length ? requirementLines.join('\n') : '暂无未完成需求',
  ].join('\n');
}

export function buildPipelineStages(
  records: DeliveryRecord[],
  releaseBuildIds: Set<string | null | undefined>,
): Array<{ id: string; label: string; tone: StageTone; records: DeliveryRecord[] }> {
  return [
    { id: 'building', label: '构建中', tone: 'running', records: records.filter((item) => item.kind === 'build' && item.status === 'building') },
    { id: 'testing', label: '测试验证', tone: 'running', records: records.filter((item) => item.status === 'testing' || item.status === 'staging') },
    {
      id: 'candidate',
      label: '候选发布',
      tone: 'idle',
      records: records.filter((item) => (item.kind === 'build' && item.status === 'released' && !releaseBuildIds.has(item.id)) || (item.kind === 'release' && item.status === 'draft')),
    },
    { id: 'released', label: '已发布', tone: 'done', records: records.filter((item) => item.kind === 'release' && item.status === 'released') },
    { id: 'risk', label: '失败/回滚', tone: 'risk', records: records.filter((item) => item.status === 'failed' || item.status === 'rollback') },
  ];
}
