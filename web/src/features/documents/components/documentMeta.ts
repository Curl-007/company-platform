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

/** Keep in sync with api/src/security/uploadPolicy.js */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 10;

export const UPLOAD_FORMAT_GROUPS = [
  {
    key: 'text',
    label: '文本 / 结构化',
    extensions: ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.yaml', '.yml', '.log', '.rtf'],
    extractable: true,
  },
  {
    key: 'document',
    label: '文档',
    extensions: ['.pdf', '.doc', '.docx', '.dot', '.dotx', '.odt', '.wps'],
    extractable: true,
  },
  {
    key: 'sheet',
    label: '表格',
    extensions: ['.xls', '.xlsx', '.xlt', '.xltx', '.ods', '.et'],
    extractable: false,
  },
  {
    key: 'slide',
    label: '演示',
    extensions: ['.ppt', '.pptx', '.pot', '.potx', '.odp', '.dps'],
    extractable: false,
  },
  {
    key: 'image',
    label: '图片',
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff'],
    extractable: false,
  },
] as const;

export const ALLOWED_UPLOAD_EXTENSIONS: string[] = UPLOAD_FORMAT_GROUPS.flatMap((group) => [...group.extensions]);

export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.join(',');

const EXT_MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
  '.log': 'text/plain',
  '.rtf': 'application/rtf',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.dot': 'application/msword',
  '.dotx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.wps': 'application/octet-stream',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlt': 'application/vnd.ms-excel',
  '.xltx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.et': 'application/octet-stream',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pot': 'application/vnd.ms-powerpoint',
  '.potx': 'application/vnd.openxmlformats-officedocument.presentationml.template',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
  '.dps': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

export function extensionOf(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.trim().toLowerCase());
  return match?.[0] ?? '';
}

export function isAllowedUploadFile(fileName: string): boolean {
  const ext = extensionOf(fileName);
  return Boolean(ext) && ALLOWED_UPLOAD_EXTENSIONS.includes(ext);
}

export function resolveUploadMime(file: File): string {
  if (file.type && file.type.trim()) return file.type;
  return EXT_MIME[extensionOf(file.name)] || 'application/octet-stream';
}

export function formatFileSize(bytes?: number | null): string {
  const size = Number(bytes) || 0;
  if (size <= 0) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function formatLabel(fileName: string): string {
  const ext = extensionOf(fileName).replace('.', '').toUpperCase();
  return ext || 'FILE';
}

export function isExtractableFormat(fileName: string): boolean {
  const ext = extensionOf(fileName);
  return UPLOAD_FORMAT_GROUPS.some((group) => group.extractable && (group.extensions as readonly string[]).includes(ext));
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim() || fileName;
}

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
