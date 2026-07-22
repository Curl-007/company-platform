export const DOC_TYPES = [
  { key: '', label: '全部类型' },
  { key: 'requirement', label: '需求文档' },
  { key: 'design', label: '设计文档' },
  { key: 'test', label: '测试文档' },
  { key: 'bid', label: '招标文件' },
  { key: 'report', label: '报告' },
];

export const DOC_CATEGORIES = [
  { key: '', label: '全部分类' },
  { key: 'project', label: '项目文档' },
  { key: 'general', label: '通用文档' },
  { key: 'announcement', label: '公司公告' },
];

export const ROLE_DOC_OPTIONS = [
  { key: 'pm', label: '项目经理文档' },
  { key: 'pdm', label: '产品经理文档' },
  { key: 'dev', label: '开发文档' },
  { key: 'qa', label: '测试文档' },
];

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function shouldAutoAnalyzeDocuments() {
  try {
    const raw = localStorage.getItem('settings:ai:prefs');
    const prefs = raw ? JSON.parse(raw) : null;
    return Boolean(prefs?.autoAnalyze);
  } catch {
    return false;
  }
}

export function aiStatusVariant(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  const lower = status.toLowerCase();
  if (/done|completed|passed|success/.test(lower)) return 'success';
  if (/pending|review|processing/.test(lower)) return 'warning';
  if (/running|in.?progress/.test(lower)) return 'info';
  return 'neutral';
}

export function categoryLabel(category?: string | null) {
  if (category === 'general') return '通用文档';
  if (category === 'announcement') return '公司公告';
  return '项目文档';
}

export function roleLabel(role?: string | null) {
  return ROLE_DOC_OPTIONS.find((item) => item.key === role)?.label ?? '未设置';
}
