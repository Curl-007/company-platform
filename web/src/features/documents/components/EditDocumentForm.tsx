import { useState } from 'react';
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
    if (!title.trim()) return setFormError('标题不能为空。');
    if (!owner.trim()) return setFormError('负责人不能为空。');
    if (category === 'project' && !projectId) return setFormError('项目文档必须选择归属项目。');

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
      setFormError(err instanceof ApiError ? err.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="编辑文档" subtitle={doc.id}>
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
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
        </div>
        <div className="form-row">
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
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>
        {category === 'project' && (
          <div className="form-group">
            <label className="form-label">归属项目</label>
            <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">请选择项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
