import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import type { Document, Project } from '../../../types';
import { updateDocument } from '../api';
import { DOC_CATEGORIES, DOC_TYPES, ROLE_DOC_OPTIONS } from './documentMeta';

export default function EditDocumentForm({
  document: doc,
  projects,
  onClose,
  onSaved,
}: {
  document: Document;
  projects: Project[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(doc.title);
  const [type, setType] = useState(doc.type);
  const [category, setCategory] = useState(doc.category ?? 'project');
  const [owner, setOwner] = useState(doc.owner);
  const [ownerRole, setOwnerRole] = useState(doc.ownerRole ?? 'pm');
  const [projectId, setProjectId] = useState(doc.projectId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError(t('features.documents.editDocumentForm.titleRequired'));
    if (!owner.trim()) return setFormError(t('features.documents.editDocumentForm.ownerRequired'));
    if (category === 'project' && !projectId) return setFormError(t('features.documents.editDocumentForm.projectRequired'));

    setSubmitting(true);
    try {
      await updateDocument(doc.id, {
        title: title.trim(),
        type,
        category,
        owner: owner.trim(),
        ownerRole,
        projectId: category === 'project' ? projectId : null,
      });
      onSaved();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : t('features.documents.editDocumentForm.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={t('features.documents.editDocumentForm.panelTitle')} subtitle={doc.id}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">{t('features.documents.editDocumentForm.title')}</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.documents.editDocumentForm.type')}</label>
            <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
              {DOC_TYPES.filter((item) => item.key).map((item) => (
                <option key={item.key} value={item.key}>{t(item.label)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.documents.editDocumentForm.category')}</label>
            <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOC_CATEGORIES.filter((item) => item.key).map((item) => (
                <option key={item.key} value={item.key}>{t(item.label)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.documents.editDocumentForm.ownerRole')}</label>
            <select className="form-select" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)}>
              {ROLE_DOC_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>{t(item.label)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.documents.editDocumentForm.owner')}</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
        {category === 'project' && (
          <div className="form-group">
            <label className="form-label">{t('features.documents.editDocumentForm.project')}</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">{t('features.documents.editDocumentForm.selectProject')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('features.documents.editDocumentForm.saving') : t('common.save')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
