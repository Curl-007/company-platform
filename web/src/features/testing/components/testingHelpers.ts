import i18n from '../../../i18n';
import type { Defect, Project, TestCase } from '../../../types';
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  TEST_CASE_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';

export type TestingTab = 'cases' | 'defects';

export function clearTestingFocusFromHash() {
  const hash = window.location.hash;
  const [pathPart, queryPart] = hash.split('?');
  if (!queryPart) return;
  const params = new URLSearchParams(queryPart);
  if (!params.has('focus')) return;
  params.delete('focus');
  const nextQuery = params.toString();
  window.location.hash = nextQuery ? `${pathPart}?${nextQuery}` : pathPart;
}

export function passRate(testCase: TestCase): number {
  return testCase.totalCases > 0 ? Math.round((testCase.passedCases / testCase.totalCases) * 100) : 0;
}

export function countBy(items: string[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

export function formatCounts(counts: Record<string, number>, labels: Record<string, string>): string {
  const entries = Object.entries(counts);
  return entries.length
    ? entries.map(([key, count]) => `${labelOf(labels, key)} ${count}`).join(i18n.t('features.testing.aiPrompt.countSeparator'))
    : i18n.t('features.testing.aiPrompt.noCounts');
}

export function buildTestingQualityAiPrompt(testCases: TestCase[], defects: Defect[], projects: Project[]): string {
  const projectNameMap = new Map(projects.map((project) => [project.id, project.name]));
  const caseStatusCounts = countBy(testCases.map((item) => item.status));
  const defectStatusCounts = countBy(defects.map((item) => item.status));
  const defectSeverityCounts = countBy(defects.map((item) => item.severity));
  const openDefects = defects.filter((item) => item.status !== 'closed');
  const seriousDefects = defects.filter((item) => ['critical', 'high', 'blocker'].includes(item.severity) && item.status !== 'closed');
  const riskyCases = [...testCases]
    .filter((item) => item.failedCases > 0 || item.blockedCases > 0 || passRate(item) < 80)
    .sort((a, b) => passRate(a) - passRate(b))
    .slice(0, 8)
    .map((item) => i18n.t('features.testing.aiPrompt.riskyCaseItem', {
      id: item.id,
      name: item.name,
      project: projectNameMap.get(item.projectId) ?? item.projectId,
      status: labelOf(TEST_CASE_STATUS_LABELS, item.status),
      rate: passRate(item),
      failed: item.failedCases,
      blocked: item.blockedCases,
    }));
  const keyDefects = [...openDefects]
    .sort((a, b) => {
      const rank: Record<string, number> = { blocker: 5, critical: 4, high: 3, medium: 2, low: 1 };
      return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    })
    .slice(0, 10)
    .map((item) => i18n.t('features.testing.aiPrompt.defectItem', {
      id: item.id,
      title: item.title,
      project: projectNameMap.get(item.projectId) ?? item.projectId,
      severity: labelOf(DEFECT_SEVERITY_LABELS, item.severity),
      status: labelOf(DEFECT_STATUS_LABELS, item.status),
      assignee: item.assignee || i18n.t('features.testing.aiPrompt.unassigned'),
    }));
  const totalRuns = testCases.reduce((sum, item) => sum + item.totalCases, 0);
  const passedRuns = testCases.reduce((sum, item) => sum + item.passedCases, 0);
  const failedRuns = testCases.reduce((sum, item) => sum + item.failedCases, 0);
  const blockedRuns = testCases.reduce((sum, item) => sum + item.blockedCases, 0);
  const overallPassRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;

  return [
    i18n.t('features.testing.aiPrompt.intro'),
    i18n.t('features.testing.aiPrompt.instructions'),
    i18n.t('features.testing.aiPrompt.advisory'),
    '',
    i18n.t('features.testing.aiPrompt.caseTotal', { count: testCases.length }),
    i18n.t('features.testing.aiPrompt.executionTotal', { total: totalRuns, passed: passedRuns, failed: failedRuns, blocked: blockedRuns, rate: overallPassRate }),
    i18n.t('features.testing.aiPrompt.caseStatusDist', { value: formatCounts(caseStatusCounts, TEST_CASE_STATUS_LABELS) }),
    i18n.t('features.testing.aiPrompt.defectTotal', { count: defects.length, open: openDefects.length, severe: seriousDefects.length }),
    i18n.t('features.testing.aiPrompt.defectStatusDist', { value: formatCounts(defectStatusCounts, DEFECT_STATUS_LABELS) }),
    i18n.t('features.testing.aiPrompt.defectSeverityDist', { value: formatCounts(defectSeverityCounts, DEFECT_SEVERITY_LABELS) }),
    '',
    i18n.t('features.testing.aiPrompt.riskyCasesTitle'),
    riskyCases.length ? riskyCases.join('\n') : i18n.t('features.testing.aiPrompt.noRiskyCases'),
    '',
    i18n.t('features.testing.aiPrompt.keyDefectsTitle'),
    keyDefects.length ? keyDefects.join('\n') : i18n.t('features.testing.aiPrompt.noOpenDefects'),
  ].join('\n');
}
