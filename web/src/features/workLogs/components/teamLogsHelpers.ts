import type { TeamWorkSummary, TeamWorkSummaryMember, WorkLog } from '../../../types';
import { USER_ROLE_LABELS, labelOf } from '../../../constants/enums';
import { businessDateKey, businessWeekStart } from '../../../utils/businessDate';

export type QuickFilter = 'all' | 'missing' | 'blocked';

export type RelatedLink = {
  id: string;
  page: string;
  tab?: string;
  label: string;
  kind: 'requirement' | 'defect' | 'test';
};

export function today() {
  return businessDateKey();
}

export function weekStart() {
  return businessWeekStart();
}

export function downloadMarkdown(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(fileName: string, rows: Array<Record<string, string | number | null | undefined>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number | null | undefined) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function goToHash(page: string, id?: string) {
  window.location.hash = id ? `#/${page}?focus=${encodeURIComponent(id)}` : `#/${page}`;
}

export function goToTarget(link: RelatedLink) {
  if (link.tab) {
    window.location.hash = `#/${link.page}?tab=${encodeURIComponent(link.tab)}&focus=${encodeURIComponent(link.id)}`;
    return;
  }
  goToHash(link.page, link.id);
}

export function uniqueLinks(links: RelatedLink[]) {
  const seen = new Set<string>();
  return links.filter((item) => {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractIds(text: string, regex: RegExp) {
  return [...text.matchAll(regex)].map((item) => item[0]);
}

export function buildRelatedLinks(log: WorkLog): RelatedLink[] {
  const requirementLinks = (log.analysis?.linkedRequirements ?? []).map((entry) => ({
    id: entry.id,
    page: 'requirements',
    label: entry.id,
    kind: 'requirement' as const,
  }));
  const rawText = [
    log.content,
    log.blockers,
    log.nextPlan,
    ...(log.analysis?.completedItems ?? []),
    ...(log.analysis?.blockers ?? []),
    ...(log.analysis?.suggestedActions ?? []),
  ]
    .filter(Boolean)
    .join('\n');
  const defectLinks = extractIds(rawText, /\bBUG-\d+\b/gi).map((id) => ({
    id: id.toUpperCase(),
    page: 'testing',
    tab: 'defects',
    label: id.toUpperCase(),
    kind: 'defect' as const,
  }));
  const testLinks = extractIds(rawText, /\b(?:TC|TEST)-\d+\b/gi).map((id) => ({
    id: id.toUpperCase(),
    page: 'testing',
    tab: 'cases',
    label: id.toUpperCase(),
    kind: 'test' as const,
  }));
  return uniqueLinks([...requirementLinks, ...defectLinks, ...testLinks]);
}

export function hasRealBlockers(items: string[]) {
  return items.some((item) => item && item !== 'No explicit blocker was detected.');
}

export function buildMemberLinks(member: TeamWorkSummaryMember): RelatedLink[] {
  const requirementLinks = member.summary.linkedRequirements.map((entry) => ({
    id: entry.id,
    page: 'requirements',
    label: entry.id,
    kind: 'requirement' as const,
  }));
  const text = [
    member.summary.summary,
    ...member.summary.completedItems,
    ...member.summary.blockers,
    ...member.summary.nextPlans,
  ].join('\n');
  const defectLinks = extractIds(text, /\bBUG-\d+\b/gi).map((id) => ({
    id: id.toUpperCase(),
    page: 'testing',
    tab: 'defects',
    label: id.toUpperCase(),
    kind: 'defect' as const,
  }));
  const testLinks = extractIds(text, /\b(?:TC|TEST)-\d+\b/gi).map((id) => ({
    id: id.toUpperCase(),
    page: 'testing',
    tab: 'cases',
    label: id.toUpperCase(),
    kind: 'test' as const,
  }));
  return uniqueLinks([...requirementLinks, ...defectLinks, ...testLinks]);
}

export function buildOverallMarkdown(summary: TeamWorkSummary): string {
  return [
    '# 团队周报',
    '',
    `- 项目：${summary.project || '未指定项目'}`,
    `- 周起始：${summary.weekKey}`,
    `- 已提交人数：${summary.submittedCount}`,
    `- 缺报人数：${summary.missingCount}`,
    '',
    '## AI 整体摘要',
    summary.overall.summary || '暂无摘要。',
    '',
    '## 本周完成',
    ...(summary.overall.completedItems.length ? summary.overall.completedItems.map((item) => `- ${item}`) : ['- 暂无']),
    '',
    '## 本周阻塞',
    ...(summary.overall.blockers.length ? summary.overall.blockers.map((item) => `- ${item}`) : ['- 暂无']),
    '',
    '## 下周计划',
    ...(summary.overall.nextPlans.length ? summary.overall.nextPlans.map((item) => `- ${item}`) : ['- 暂无']),
    '',
    '## 缺报成员',
    ...(summary.missingMembers.length
      ? summary.missingMembers.map((item) => `- ${item.name}（${labelOf(USER_ROLE_LABELS, item.role)}）`)
      : ['- 暂无']),
    '',
    '## 成员周报',
    ...summary.members.flatMap((member) => [
      `### ${member.author}（${labelOf(USER_ROLE_LABELS, member.role)}）`,
      `- 日报篇数：${member.count}`,
      '',
      member.summary.summary || '暂无摘要。',
      '',
      '完成事项：',
      ...(member.summary.completedItems.length ? member.summary.completedItems.map((item) => `- ${item}`) : ['- 暂无']),
      '',
      '阻塞事项：',
      ...(member.summary.blockers.length ? member.summary.blockers.map((item) => `- ${item}`) : ['- 暂无']),
      '',
      '下步计划：',
      ...(member.summary.nextPlans.length ? member.summary.nextPlans.map((item) => `- ${item}`) : ['- 暂无']),
      '',
    ]),
  ].join('\n');
}
