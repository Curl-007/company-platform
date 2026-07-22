import { useRef, useState } from 'react';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import type { Document, Project } from '../../../types';
import { uploadDocument } from '../api';
import { DOC_CATEGORIES, DOC_TYPES, MAX_UPLOAD_BYTES, ROLE_DOC_OPTIONS } from './documentMeta';

export default function UploadDocumentForm({
  projects,
  defaultRole,
  onClose,
  onUploaded,
}: {
  projects: Project[];
  defaultRole: string;
  onClose: () => void;
  onUploaded: (doc: Document) => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('requirement');
  const [category, setCategory] = useState('project');
  const [owner, setOwner] = useState('');
  const [ownerRole, setOwnerRole] = useState(defaultRole);
  const [projectId, setProjectId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('请输入文档标题。');
    if (!owner.trim()) return setFormError('请输入负责人。');
    if (category === 'project' && !projectId) return setFormError('项目文档必须选择归属项目。');
    if (!file) return setFormError('请选择要上传的文件。');
    if (file.size > MAX_UPLOAD_BYTES) return setFormError('文件过大，请控制在 25MB 以内。');

    setSubmitting(true);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });

      const uploaded = await uploadDocument({
        title: title.trim(),
        type,
        category,
        owner: owner.trim(),
        ownerRole,
        projectId: category === 'project' ? projectId : undefined,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        contentBase64,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploaded(uploaded);
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '上传失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="上传文档" subtitle="按项目、分类和责任角色整理文档">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：一期需求说明书" />
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
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="填写文档负责人" />
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
        <div className="form-group">
          <label className="form-label">文件（不超过 20MB）</label>
          <input
            ref={fileInputRef}
            type="file"
            className="form-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="form-help-text">当前文件：{file.name}，{(file.size / 1024 / 1024).toFixed(2)} MB</div>
          ) : (
            <div className="form-help-text">支持常见文档格式；TXT/Markdown/JSON/CSV/XML/PDF 会尽量抽取正文，正文预览截取前 20000 字符。</div>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '上传中...' : '上传'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
