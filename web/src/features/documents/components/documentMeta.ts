import i18n from '../../../i18n';

export const DOC_TYPES = [
  { key: '', label: 'features.documents.documentMeta.docTypes.allTypes' },
  { key: 'requirement', label: 'features.documents.documentMeta.docTypes.requirement' },
  { key: 'design', label: 'features.documents.documentMeta.docTypes.design' },
  { key: 'test', label: 'features.documents.documentMeta.docTypes.test' },
  { key: 'bid', label: 'features.documents.documentMeta.docTypes.bid' },
  { key: 'report', label: 'features.documents.documentMeta.docTypes.report' },
];

export const DOC_CATEGORIES = [
  { key: '', label: 'features.documents.documentMeta.docCategories.allCategories' },
  { key: 'project', label: 'features.documents.documentMeta.docCategories.project' },
  { key: 'general', label: 'features.documents.documentMeta.docCategories.general' },
  { key: 'announcement', label: 'features.documents.documentMeta.docCategories.announcement' },
];

export const ROLE_DOC_OPTIONS = [
  { key: 'pm', label: 'features.documents.documentMeta.roleOptions.pm' },
  { key: 'pdm', label: 'features.documents.documentMeta.roleOptions.pdm' },
  { key: 'dev', label: 'features.documents.documentMeta.roleOptions.dev' },
  { key: 'qa', label: 'features.documents.documentMeta.roleOptions.qa' },
];

/** Keep in sync with api/src/security/uploadPolicy.js */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 10;

export const UPLOAD_FORMAT_GROUPS = [
  {
    key: 'text',
    label: 'features.documents.documentMeta.uploadFormatGroups.text',
    extensions: ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.html', '.htm', '.yaml', '.yml', '.log', '.rtf'],
    extractable: true,
  },
  {
    key: 'document',
    label: 'features.documents.documentMeta.uploadFormatGroups.document',
    extensions: ['.pdf', '.doc', '.docx', '.dot', '.dotx', '.odt', '.wps'],
    extractable: true,
  },
  {
    key: 'sheet',
    label: 'features.documents.documentMeta.uploadFormatGroups.sheet',
    extensions: ['.xls', '.xlsx', '.xlt', '.xltx', '.ods', '.et'],
    extractable: false,
  },
  {
    key: 'slide',
    label: 'features.documents.documentMeta.uploadFormatGroups.slide',
    extensions: ['.ppt', '.pptx', '.pot', '.potx', '.odp', '.dps'],
    extractable: false,
  },
  {
    key: 'image',
    label: 'features.documents.documentMeta.uploadFormatGroups.image',
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
  if (category === 'general') return i18n.t('features.documents.documentMeta.docCategories.general');
  if (category === 'announcement') return i18n.t('features.documents.documentMeta.docCategories.announcement');
  return i18n.t('features.documents.documentMeta.docCategories.project');
}

export function roleLabel(role?: string | null) {
  const item = ROLE_DOC_OPTIONS.find((entry) => entry.key === role);
  return item ? i18n.t(item.label) : i18n.t('enums.unset');
}
