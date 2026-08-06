// Maps the backend 409 `details.dependencies` object (returned by the
// product / requirement / test-case DELETE routes) into a concise Chinese
// summary string for the cascade-confirm dialog.
//
// The backend emits two shapes:
//   - product / test-case: { tasks: { count, sampleIds }, ... }
//   - requirement:         { tasks: 3, defects: 1, ... }
// Both are normalized here so callers can pass either shape.

const LABELS: Record<string, string> = {
  tasks: '任务',
  defects: '缺陷',
  testCases: '测试用例',
  testRuns: '测试执行记录',
  children: '子需求',
  syncTasks: '同步任务',
  projects: '关联项目',
  requirements: '需求',
  releases: '发布',
  productImages: '产品图片',
  images: '图片',
  portfolios: '产品组合',
};

// Accept the loose runtime shape (the value may be a number or { count }) and
// narrow it here so callers can pass the raw 409 body without casting.
function countOf(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'count' in value) {
    const count = (value as { count?: unknown }).count;
    return typeof count === 'number' ? count : Number(count ?? 0);
  }
  return 0;
}

/** Returns a summary like "3 个任务、1 个缺陷", or '' if nothing counts. */
export function summarizeDependencies(dependencies: unknown): string {
  if (!dependencies || typeof dependencies !== 'object') return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(dependencies as Record<string, unknown>)) {
    const count = countOf(value);
    if (count <= 0) continue;
    const label = LABELS[key] ?? key;
    parts.push(`${count} 个${label}`);
  }
  return parts.join('、');
}
