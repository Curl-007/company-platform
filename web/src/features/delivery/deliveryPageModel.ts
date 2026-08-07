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
import { businessDateKey } from '../../utils/businessDate';
import i18n, { getInterfaceLocale } from '../../i18n';

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
  return businessDateKey();
}

export function formatDate(value?: string | null): string {
  if (!value) return i18n.t('enums.unset');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(getInterfaceLocale());
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
      ownerLabel: release.productId ? productMap.get(release.productId) ?? release.productId : i18n.t('features.delivery.deliveryPageModel.noLinkedProduct'),
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
    return i18n.t('features.delivery.deliveryPageModel.recordLine', {
      kind: item.kind === 'build'
        ? i18n.t('features.delivery.deliveryPageModel.build')
        : i18n.t('features.delivery.deliveryPageModel.release'),
      id: item.id,
      title: item.title,
      version: item.version || i18n.t('features.delivery.deliveryPageModel.noVersion'),
      status: statusLabel(item.kind, item.status),
      score: gate?.score ?? releaseReadiness(item),
      gate: gate ? (gate.ready
        ? i18n.t('features.delivery.deliveryPageModel.gatePassed')
        : i18n.t('features.delivery.deliveryPageModel.gateBlocked'))
        : i18n.t('features.delivery.deliveryPageModel.gateUnknown'),
      stories: item.linkedStories.length,
      bugs: item.linkedBugs.length,
    });
  });
  const blockedGateLines = blockedGates.slice(0, 8).map((item) => {
    const record = records.find((recordItem) => recordItem.kind === item.kind && recordItem.id === item.id);
    const failed = item.gates.filter((gate) => !gate.passed).map((gate) => `${gate.label}: ${gate.message}`).join('；');
    return i18n.t('features.delivery.deliveryPageModel.blockedGateLine', {
      kind: item.kind === 'build'
        ? i18n.t('features.delivery.deliveryPageModel.build')
        : i18n.t('features.delivery.deliveryPageModel.release'),
      id: item.id,
      title: record?.title || '',
      score: item.score,
      summary: item.summary,
      failed: failed || i18n.t('features.delivery.deliveryPageModel.noBlockedGateItem'),
    });
  });
  const defectLines = seriousOpenDefects.slice(0, 8).map((item) => i18n.t('features.delivery.deliveryPageModel.defectLine', {
    id: item.id,
    title: item.title,
    severity: item.severity,
    status: item.status,
    assignee: item.assignee || i18n.t('features.delivery.deliveryPageModel.unassigned'),
  }));
  const requirementLines = unfinishedRequirements.slice(0, 8).map((item) => i18n.t('features.delivery.deliveryPageModel.requirementLine', {
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    completion: item.completion ?? 0,
  }));

  return [
    i18n.t('features.delivery.deliveryPageModel.aiPromptIntro'),
    i18n.t('features.delivery.deliveryPageModel.aiPromptInstructions'),
    i18n.t('features.delivery.deliveryPageModel.aiPromptAdvisory'),
    '',
    i18n.t('features.delivery.deliveryPageModel.deliveryTotalLine', { count: records.length, candidates: candidates.length, releases: releases.length }),
    i18n.t('features.delivery.deliveryPageModel.gateTotalLine', { count: gates.length, blocked: blockedGates.length }),
    i18n.t('features.delivery.deliveryPageModel.requirementDefectLine', { requirements: unfinishedRequirements.length, openDefects: openDefects.length, serious: seriousOpenDefects.length }),
    '',
    i18n.t('features.delivery.deliveryPageModel.recentRecordsTitle'),
    latestRecords.length ? latestRecords.join('\n') : i18n.t('features.delivery.deliveryPageModel.noRecords'),
    '',
    i18n.t('features.delivery.deliveryPageModel.blockedGatesTitle'),
    blockedGateLines.length ? blockedGateLines.join('\n') : i18n.t('features.delivery.deliveryPageModel.noBlockedGates'),
    '',
    i18n.t('features.delivery.deliveryPageModel.seriousDefectsTitle'),
    defectLines.length ? defectLines.join('\n') : i18n.t('features.delivery.deliveryPageModel.noSeriousDefects'),
    '',
    i18n.t('features.delivery.deliveryPageModel.unfinishedRequirementsTitle'),
    requirementLines.length ? requirementLines.join('\n') : i18n.t('features.delivery.deliveryPageModel.noUnfinishedRequirements'),
  ].join('\n');
}

export function buildPipelineStages(
  records: DeliveryRecord[],
  releaseBuildIds: Set<string | null | undefined>,
): Array<{ id: string; label: string; tone: StageTone; records: DeliveryRecord[] }> {
  return [
    { id: 'building', label: i18n.t('features.delivery.deliveryPageModel.stageBuilding'), tone: 'running', records: records.filter((item) => item.kind === 'build' && item.status === 'building') },
    { id: 'testing', label: i18n.t('features.delivery.deliveryPageModel.stageTesting'), tone: 'running', records: records.filter((item) => item.status === 'testing' || item.status === 'staging') },
    {
      id: 'candidate',
      label: i18n.t('features.delivery.deliveryPageModel.stageCandidate'),
      tone: 'idle',
      records: records.filter((item) => (item.kind === 'build' && item.status === 'released' && !releaseBuildIds.has(item.id)) || (item.kind === 'release' && item.status === 'draft')),
    },
    { id: 'released', label: i18n.t('features.delivery.deliveryPageModel.stageReleased'), tone: 'done', records: records.filter((item) => item.kind === 'release' && item.status === 'released') },
  ];
}
