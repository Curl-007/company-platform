import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import i18n from '../../../i18n';
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
    reader.onerror = () => reject(new Error(i18n.t('features.documents.uploadDocumentForm.readFileFailed')));
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
  const { t } = useTranslation();
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
          errors.push(t('features.documents.uploadDocumentForm.maxFiles', { count: MAX_UPLOAD_FILES }));
          break;
        }
        if (!isAllowedUploadFile(file.name)) {
          errors.push(t('features.documents.uploadDocumentForm.unsupportedFormat', { name: file.name }));
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          errors.push(t('features.documents.uploadDocumentForm.fileTooLarge', { name: file.name }));
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
    if (!owner.trim()) return setFormError(t('features.documents.uploadDocumentForm.ownerRequired'));
    if (category === 'project' && !projectId) return setFormError(t('features.documents.uploadDocumentForm.projectRequired'));
    if (!queue.length) return setFormError(t('features.documents.uploadDocumentForm.selectFiles'));

    const targets = queue.filter((item) => item.status === 'pending' || item.status === 'error');
    if (!targets.length) return setFormError(t('features.documents.uploadDocumentForm.nothingToUpload'));

    setSubmitting(true);
    const uploadedDocs: Document[] = [];

    try {
      for (const item of targets) {
        if (!item.title.trim()) {
          updateItem(item.id, { status: 'error', error: t('features.documents.uploadDocumentForm.titleRequired') });
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
            error: err instanceof ApiError ? err.message : t('features.documents.uploadDocumentForm.uploadFailed'),
          });
        }
      }

      if (uploadedDocs.length) {
        onUploaded(uploadedDocs);
      } else {
        setFormError(t('features.documents.uploadDocumentForm.uploadAllFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={760} ariaLabel={t('features.documents.uploadDocumentForm.uploadDocumentAria')}>
      <Panel
        className="doc-upload-panel"
        title={t('features.documents.uploadDocumentForm.panelTitle')}
        subtitle={t('features.documents.uploadDocumentForm.subtitle', { formats: t(ALLOWED_COUNT_LABEL), count: MAX_UPLOAD_FILES })}
        toolbar={(
          <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose} aria-label={t('common.close')}>
            <X size={15} aria-hidden="true" />
          </button>
        )}
      >
        <div className="doc-upload-body">
          {formError ? <div className="form-error doc-form-error">{formError}</div> : null}

          <div className="doc-form-grid">
            <div className="form-group">
              <label className="form-label">{t('features.documents.uploadDocumentForm.type')}</label>
              <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                {DOC_TYPES.filter((item) => item.key).map((item) => (
                  <option key={item.key} value={item.key}>{t(item.label)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.documents.uploadDocumentForm.category')}</label>
              <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                {DOC_CATEGORIES.filter((item) => item.key).map((item) => (
                  <option key={item.key} value={item.key}>{t(item.label)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.documents.uploadDocumentForm.ownerRole')}</label>
              <select className="form-select" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}>
                {ROLE_DOC_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>{t(item.label)}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.documents.uploadDocumentForm.owner')}</label>
              <input
                className="form-input"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder={t('features.documents.uploadDocumentForm.ownerPlaceholder')}
              />
            </div>
            {category === 'project' ? (
              <div className="form-group doc-form-span">
                <label className="form-label">{t('features.documents.uploadDocumentForm.project')}</label>
                <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">{t('features.documents.uploadDocumentForm.selectProject')}</option>
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
              <strong>{t('features.documents.uploadDocumentForm.dragDropHint')}</strong>
              <span>{t('features.documents.uploadDocumentForm.multiSelectHint')}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={submitting}
            >
              {t('features.documents.uploadDocumentForm.chooseFiles')}
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

          <div className="doc-format-board" aria-label={t('features.documents.uploadDocumentForm.supportedFormats')}>
            {UPLOAD_FORMAT_GROUPS.map((group) => (
              <div key={group.key} className="doc-format-group">
                <strong>{t(group.label)}</strong>
                <span>{group.extensions.join(' ')}</span>
                <em>{group.extractable ? t('features.documents.uploadDocumentForm.extractable') : t('features.documents.uploadDocumentForm.attachmentOnly')}</em>
              </div>
            ))}
          </div>

          {queue.length ? (
            <div className="doc-queue">
              <div className="doc-queue-head">
                <strong>{t('features.documents.uploadDocumentForm.pendingUpload', { count: queue.length })}</strong>
                <span>{formatFileSize(totalBytes)} · {t('features.documents.uploadDocumentForm.pendingCount', { count: pendingCount })}</span>
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
                          {isExtractableFormat(item.file.name) ? ` · ${t('features.documents.uploadDocumentForm.extractable')}` : ` · ${t('features.documents.uploadDocumentForm.attachmentOnly')}`}
                        </span>
                      </div>
                    </div>
                    <input
                      className="form-input doc-queue-title"
                      value={item.title}
                      disabled={item.status === 'uploading' || item.status === 'done'}
                      onChange={(e) => updateItem(item.id, { title: e.target.value })}
                      aria-label={t('features.documents.uploadDocumentForm.docTitleAria', { name: item.file.name })}
                      placeholder={t('features.documents.uploadDocumentForm.documentTitlePlaceholder')}
                    />
                    <div className="doc-queue-status">
                      {item.status === 'pending' ? t('features.documents.uploadDocumentForm.pending') : null}
                      {item.status === 'uploading' ? t('features.documents.uploadDocumentForm.uploading') : null}
                      {item.status === 'done' ? t('features.documents.uploadDocumentForm.done') : null}
                      {item.status === 'error' ? (item.error || t('features.documents.uploadDocumentForm.failed')) : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-text btn-xs doc-queue-remove"
                      onClick={() => removeItem(item.id)}
                      disabled={item.status === 'uploading' || submitting}
                      aria-label={t('features.documents.uploadDocumentForm.removeAria', { name: item.file.name })}
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
              {t('features.documents.uploadDocumentForm.noFilesSelected')}
            </div>
          )}

          <div className="doc-form-footer">
            <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={handleSubmit} disabled={submitting || !queue.length}>
              <Upload size={14} aria-hidden="true" />
              {submitting
                ? t('features.documents.uploadDocumentForm.uploadButtonSubmitting')
                : queue.length
                  ? t('features.documents.uploadDocumentForm.uploadButtonCount', { count: queue.length })
                  : t('features.documents.uploadDocumentForm.uploadButton')}
            </button>
          </div>
        </div>
      </Panel>
    </Overlay>
  );
}

const ALLOWED_COUNT_LABEL = 'features.documents.uploadDocumentForm.allowedFormats';
