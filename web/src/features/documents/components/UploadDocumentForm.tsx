import { useMemo, useRef, useState } from 'react';
import {
  FileText,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import type { Document, Project } from '../../../types';
import { uploadDocument } from '../api';
import {
  DOC_CATEGORIES,
  DOC_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  ROLE_DOC_OPTIONS,
  UPLOAD_ACCEPT,
  UPLOAD_FORMAT_GROUPS,
  formatFileSize,
  formatLabel,
  isAllowedUploadFile,
  isExtractableFormat,
  resolveUploadMime,
  titleFromFileName,
} from './documentMeta';

type QueueItem = {
  id: string;
  file: File;
  title: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export default function UploadDocumentForm({
  projects,
  defaultRole,
  onClose,
  onUploaded,
}: {
  projects: Project[];
  defaultRole: string;
  onClose: () => void;
  onUploaded: (docs: Document[]) => void;
}) {
  const [type, setType] = useState('requirement');
  const [category, setCategory] = useState('project');
  const [owner, setOwner] = useState('');
  const [ownerRole, setOwnerRole] = useState(defaultRole);
  const [projectId, setProjectId] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingCount = queue.filter((item) => item.status === 'pending' || item.status === 'error').length;
  const totalBytes = useMemo(() => queue.reduce((sum, item) => sum + item.file.size, 0), [queue]);

  function addFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    if (!incoming.length) return;

    setFormError(null);
    setQueue((prev) => {
      const next = [...prev];
      const errors: string[] = [];

      for (const file of incoming) {
        if (next.length >= MAX_UPLOAD_FILES) {
          errors.push(`单次最多上传 ${MAX_UPLOAD_FILES} 个文件。`);
          break;
        }
        if (!isAllowedUploadFile(file.name)) {
          errors.push(`不支持的格式：${file.name}`);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          errors.push(`${file.name} 超过 25MB 限制。`);
          continue;
        }
        const duplicated = next.some((item) => item.file.name === file.name && item.file.size === file.size);
        if (duplicated) continue;
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          title: titleFromFileName(file.name),
          status: 'pending',
        });
      }

      if (errors.length) setFormError(errors[0]);
      return next;
    });
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }

  async function handleSubmit() {
    setFormError(null);
    if (!owner.trim()) return setFormError('请输入负责人。');
    if (category === 'project' && !projectId) return setFormError('项目文档必须选择归属项目。');
    if (!queue.length) return setFormError('请选择要上传的文件。');

    const targets = queue.filter((item) => item.status === 'pending' || item.status === 'error');
    if (!targets.length) return setFormError('没有待上传的文件。');

    setSubmitting(true);
    const uploadedDocs: Document[] = [];

    try {
      for (const item of targets) {
        if (!item.title.trim()) {
          updateItem(item.id, { status: 'error', error: '请填写文档标题' });
          continue;
        }
        updateItem(item.id, { status: 'uploading', error: undefined });
        try {
          const contentBase64 = await readFileAsDataUrl(item.file);
          const uploaded = await uploadDocument({
            title: item.title.trim(),
            type,
            category,
            owner: owner.trim(),
            ownerRole,
            projectId: category === 'project' ? projectId : undefined,
            fileName: item.file.name,
            fileSize: item.file.size,
            fileType: resolveUploadMime(item.file),
            contentBase64,
          });
          uploadedDocs.push(uploaded);
          updateItem(item.id, { status: 'done' });
        } catch (err: unknown) {
          updateItem(item.id, {
            status: 'error',
            error: err instanceof ApiError ? err.message : '上传失败',
          });
        }
      }

      if (uploadedDocs.length) {
        onUploaded(uploadedDocs);
      } else {
        setFormError('没有文件上传成功，请检查格式或稍后重试。');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={760} ariaLabel="上传文档">
      <Panel
        className="doc-upload-panel"
        title="上传文档"
        subtitle={`支持 ${ALLOWED_COUNT_LABEL} 等常见格式 · 单文件 ≤ 25MB · 单次最多 ${MAX_UPLOAD_FILES} 个`}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label="关闭">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="doc-upload-body">
          {formError ? <div className="form-error doc-form-error">{formError}</div> : null}

          <div className="doc-form-grid">
            <div className="form-group">
              <label className="form-label">类型</label>
              <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                {DOC_TYPES.filter((item) => item.key).map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">分类</label>
              <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {DOC_CATEGORIES.filter((item) => item.key).map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">负责角色</label>
              <select className="form-select" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}>
                {ROLE_DOC_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">负责人</label>
              <input
                className="form-input"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="填写文档负责人"
              />
            </div>
            {category === 'project' ? (
              <div className="form-group doc-form-span">
                <label className="form-label">归属项目</label>
                <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">请选择项目</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div
            className={`doc-dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <div className="doc-dropzone-icon" aria-hidden="true">
              <Upload size={20} />
            </div>
            <div className="doc-dropzone-copy">
              <strong>拖拽文件到此处，或点击选择</strong>
              <span>可一次选择多个文件；Office / PDF / 文本 / 图片均支持</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              选择文件
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              multiple
              accept={UPLOAD_ACCEPT}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <div className="doc-format-board" aria-label="支持的上传格式">
            {UPLOAD_FORMAT_GROUPS.map((group) => (
              <div key={group.key} className="doc-format-group">
                <strong>{group.label}</strong>
                <span>{group.extensions.join(' ')}</span>
                <em>{group.extractable ? '可抽取正文' : '按附件保存'}</em>
              </div>
            ))}
          </div>

          {queue.length ? (
            <div className="doc-queue">
              <div className="doc-queue-head">
                <strong>待上传 {queue.length} 个</strong>
                <span>{formatFileSize(totalBytes)} · 待处理 {pendingCount}</span>
              </div>
              <div className="doc-queue-list">
                {queue.map((item) => (
                  <div key={item.id} className={`doc-queue-item is-${item.status}`}>
                    <div className="doc-queue-file">
                      <span className="doc-queue-ext">{formatLabel(item.file.name)}</span>
                      <div className="doc-queue-meta">
                        <strong title={item.file.name}>{item.file.name}</strong>
                        <span>
                          {formatFileSize(item.file.size)}
                          {isExtractableFormat(item.file.name) ? ' · 可抽取正文' : ' · 附件保存'}
                        </span>
                      </div>
                    </div>
                    <input
                      className="form-input doc-queue-title"
                      value={item.title}
                      disabled={item.status === 'uploading' || item.status === 'done'}
                      onChange={(e) => updateItem(item.id, { title: e.target.value })}
                      aria-label={`${item.file.name} 文档标题`}
                      placeholder="文档标题"
                    />
                    <div className="doc-queue-status">
                      {item.status === 'pending' ? '待上传' : null}
                      {item.status === 'uploading' ? '上传中…' : null}
                      {item.status === 'done' ? '已完成' : null}
                      {item.status === 'error' ? (item.error || '失败') : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-text btn-xs doc-queue-remove"
                      onClick={() => removeItem(item.id)}
                      disabled={item.status === 'uploading' || submitting}
                      aria-label={`移除 ${item.file.name}`}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="doc-queue-empty">
              <FileText size={16} aria-hidden="true" />
              还没有选择文件。支持 Word / Excel / PPT / PDF / Markdown / 图片等。
            </div>
          )}

          <div className="doc-form-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSubmit} disabled={submitting || !queue.length}>
              <Upload size={14} aria-hidden="true" />
              {submitting ? '上传中...' : `上传${queue.length ? ` ${queue.length} 个文件` : ''}`}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}

const ALLOWED_COUNT_LABEL = 'Word / Excel / PPT / PDF / Markdown / 图片';
