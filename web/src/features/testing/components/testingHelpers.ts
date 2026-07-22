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
  return entries.length ? entries.map(([key, count]) => `${labelOf(labels, key)} ${count}`).join('、') : '无';
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
    .map((item) => `${item.id} ${item.name} / ${projectNameMap.get(item.projectId) ?? item.projectId} / ${labelOf(TEST_CASE_STATUS_LABELS, item.status)} / 通过率 ${passRate(item)}% / 失败 ${item.failedCases} / 阻塞 ${item.blockedCases}`);
  const keyDefects = [...openDefects]
    .sort((a, b) => {
      const rank: Record<string, number> = { blocker: 5, critical: 4, high: 3, medium: 2, low: 1 };
      return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    })
    .slice(0, 10)
    .map((item) => `${item.id} ${item.title} / ${projectNameMap.get(item.projectId) ?? item.projectId} / ${labelOf(DEFECT_SEVERITY_LABELS, item.severity)} / ${labelOf(DEFECT_STATUS_LABELS, item.status)} / ${item.assignee || '未分配'}`);
  const totalRuns = testCases.reduce((sum, item) => sum + item.totalCases, 0);
  const passedRuns = testCases.reduce((sum, item) => sum + item.passedCases, 0);
  const failedRuns = testCases.reduce((sum, item) => sum + item.failedCases, 0);
  const blockedRuns = testCases.reduce((sum, item) => sum + item.blockedCases, 0);
  const overallPassRate = totalRuns > 0 ? Math.round((passedRuns / totalRuns) * 100) : 0;

  return [
    '请作为项目测试质量 AI 助手，基于下面的测试用例和缺陷快照给出质量分析。',
    '请控制在 900 字以内，输出：1. 当前质量判断 2. 主要风险 3. 回归/验证重点 4. 缺陷闭环建议 5. 需要补齐的数据。',
    '建议必须可执行，尽量指出具体用例、缺陷、项目和责任协作点。',
    '',
    `测试用例总数：${testCases.length}`,
    `执行总数：${totalRuns}，通过：${passedRuns}，失败：${failedRuns}，阻塞：${blockedRuns}，整体通过率：${overallPassRate}%`,
    `用例状态分布：${formatCounts(caseStatusCounts, TEST_CASE_STATUS_LABELS)}`,
    `缺陷总数：${defects.length}，未关闭缺陷：${openDefects.length}，高严重未关闭：${seriousDefects.length}`,
    `缺陷状态分布：${formatCounts(defectStatusCounts, DEFECT_STATUS_LABELS)}`,
    `缺陷严重级别分布：${formatCounts(defectSeverityCounts, DEFECT_SEVERITY_LABELS)}`,
    '',
    '高风险测试用例：',
    riskyCases.length ? riskyCases.join('\n') : '暂无失败、阻塞或低通过率用例',
    '',
    '重点未关闭缺陷：',
    keyDefects.length ? keyDefects.join('\n') : '暂无未关闭缺陷',
  ].join('\n');
}
