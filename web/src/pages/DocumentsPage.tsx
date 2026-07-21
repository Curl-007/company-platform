import { useEffect, useMemo, useRef, useState } from 'react';
import { analyzeDocument, deleteDocument, fetchDocuments, updateDocument, uploadDocument } from '../features/documents/api';
import { fetchProjects } from '../features/projects/api';
import { getSessionUser } from '../services/auth';
import { getToken } from '../services/api';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import BusinessAdvicePanel from '../components/common/BusinessAdvicePanel';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import { DOC_TYPE_LABELS, DOC_AI_STATUS_LABELS, labelOf } from '../constants/enums';
import { canOperate } from '../constants/roles';
import type { Document, Project } from '../types';

const DOC_TYPES = [
  { key: '', label: '全部类型' },
  { key: 'requirement', label: '需求文档' },
  { key: 'design', label: '设计文档' },
  { key: 'test', label: '测试文档' },
  { key: 'bid', label: '招标文件' },
  { key: 'report', label: '报告' },
];

const DOC_CATEGORIES = [
  { key: '', label: '全部分类' },
  { key: 'project', label: '项目文档' },
  { key: 'general', label: '通用文档' },
  { key: 'announcement', label: '公司公告' },
];

const ROLE_DOC_OPTIONS = [
  { key: 'pm', label: '项目经理文档' },
  { key: 'pdm', label: '产品经理文档' },
  { key: 'dev', label: '开发文档' },
  { key: 'qa', label: '测试文档' },
];

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function shouldAutoAnalyzeDocuments() {
  try {
    const raw = localStorage.getItem('settings:ai:prefs');
    const prefs = raw ? JSON.parse(raw) : null;
    return Boolean(prefs?.autoAnalyze);
  } catch {
    return false;
  }
}

function aiStatusVariant(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  const lower = status.toLowerCase();
  if (/done|completed|passed|success/.test(lower)) return 'success';
  if (/pending|review|processing/.test(lower)) return 'warning';
  if (/running|in.?progress/.test(lower)) return 'info';
  return 'neutral';
}

function categoryLabel(category?: string | null) {
  if (category === 'general') return '通用文档';
  if (category === 'announcement') return '公司公告';
  return '项目文档';
}

function roleLabel(role?: string | null) {
  return ROLE_DOC_OPTIONS.find((item) => item.key === role)?.label ?? '未设置';
}

function DocumentDetail({
  doc,
  projectMap,
  canUseAi,
  onClose,
}: {
  doc: Document;
  projectMap: Map<string, string>;
  canUseAi: boolean;
  onClose: () => void;
}) {
  const projectName = doc.projectId ? (projectMap.get(doc.projectId) ?? doc.projectId) : '无';

  return (
    <>
      <div className="detail-drawer-scrim" onClick={onClose} />
      <div className="detail-drawer">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <div>
                <div className="panel-title">{doc.title}</div>
                <div className="panel-subtitle">{doc.fileName}</div>
              </div>
            </div>
            <div className="panel-toolbar">
              <button className="btn btn-text btn-sm" onClick={onClose}>关闭</button>
            </div>
          </div>
          <div className="panel-body">
            <div className="metric-grid" style={{ marginBottom: 16 }}>
              <div className="metric-card">
                <div className="metric-card-label">类型</div>
                <div className="metric-card-value">{labelOf(DOC_TYPE_LABELS, doc.type)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card-label">分类</div>
                <div className="metric-card-value">{categoryLabel(doc.category)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card-label">负责角色</div>
                <div className="metric-card-value">{roleLabel(doc.ownerRole)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card-label">AI 状态</div>
                <div className="metric-card-value">{labelOf(DOC_AI_STATUS_LABELS, doc.aiStatus) || '未分析'}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div className="section-title">归属信息</div>
              <div className="body-text" style={{ marginTop: 4 }}>负责人：{doc.owner || '未填写'}</div>
              <div className="body-text">归属项目：{projectName}</div>
              <div className="body-text">更新时间：{doc.updatedAt}</div>
            </div>

            {canUseAi ? (
              <BusinessAdvicePanel
                targetType="document"
                targetId={doc.id}
                title="AI 文档分析"
                description="基于后端文档正文、项目归属、关联需求、风险项和分析 Job 生成。"
                buttonText="AI 总结文档"
                question="请总结这份文档对需求、任务、测试、交付的影响，并给出下一步动作。"
                draft={() => ({
                  title: doc.title,
                  type: doc.type,
                  category: doc.category,
                  owner: doc.owner,
                  projectName,
                  linkedRequirements: doc.linkedRequirements,
                })}
              />
            ) : null}

            <div style={{ marginBottom: 16 }}>
              <div className="section-title">文件信息</div>
              <div className="body-text" style={{ marginTop: 4 }}>
                文件大小：{doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : '未知'}
              </div>
              <div className="body-text">文件类型：{doc.fileType || '未知'}</div>
            </div>

            {doc.linkedRequirements?.length ? (
              <div style={{ marginBottom: 16 }}>
                <div className="section-title">关联需求</div>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {doc.linkedRequirements.map((requirement, index) => (
                    <li key={index} className="body-text" style={{ marginBottom: 4 }}>{requirement}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {doc.risks?.length ? (
              <div style={{ marginBottom: 16 }}>
                <div className="section-title">风险项</div>
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  {doc.risks.map((risk, index) => (
                    <li key={index} className="body-text" style={{ marginBottom: 4 }}>{risk}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {doc.content ? (
              <div>
                <div className="section-title">文档内容</div>
                <div className="body-text" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{doc.content}</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

type CollabStatus = 'connecting' | 'connected' | 'saving' | 'saved' | 'conflict' | 'error' | 'closed';

interface CollabPeer {
  id?: string;
  name?: string;
}

interface CollabMessage {
  type?: string;
  documentId?: string;
  content?: string;
  revision?: number;
  code?: string;
  message?: string;
  peers?: CollabPeer[];
  count?: number;
}

function collabStatusText(status: CollabStatus) {
  if (status === 'connecting') return '正在连接协同通道';
  if (status === 'connected') return '已连接';
  if (status === 'saving') return '保存中';
  if (status === 'saved') return '已保存';
  if (status === 'conflict') return '存在版本冲突';
  if (status === 'error') return '连接异常';
  return '已关闭';
}

function formatPresence(peers: CollabPeer[]) {
  if (!peers.length) return '仅自己在线';
  if (peers.length === 1) return `在线 1 人 · ${peers[0]?.name || peers[0]?.id || '用户'}`;
  const names = peers.slice(0, 3).map((peer) => peer.name || peer.id || '用户').join('、');
  const extra = peers.length > 3 ? ` 等 ${peers.length} 人` : '';
  return `在线 ${peers.length} 人 · ${names}${extra}`;
}

function buildCollaborationUrl(documentId: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ documentId });
  return `${protocol}//${window.location.host}/ws/collab?${params.toString()}`;
}

function DocumentCollaborationEditor({
  document: doc,
  onClose,
  onSaved,
}: {
  document: Document;
  onClose: () => void;
  onSaved: (content: string, revision: number) => void;
}) {
  const socketRef = useRef<WebSocket | null>(null);
  const dirtyRef = useRef(false);
  const contentRef = useRef(doc.content ?? '');
  const revisionRef = useRef(Number(doc.collabRevision) || 0);
  const [content, setContent] = useState(doc.content ?? '');
  const [revision, setRevision] = useState(Number(doc.collabRevision) || 0);
  const [status, setStatus] = useState<CollabStatus>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setStatus('error');
      setMessage('登录态已失效，请重新登录后再编辑。');
      return;
    }

    const socket = new WebSocket(buildCollaborationUrl(doc.id), ['pm.jwt', token]);
    socketRef.current = socket;
    setStatus('connecting');
    setMessage(null);
    setPeers([]);
    setLastSavedAt(null);

    socket.onopen = () => {
      setStatus('connected');
    };
    socket.onmessage = (event) => {
      let payload: CollabMessage;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (Array.isArray(payload.peers)) {
        setPeers(payload.peers);
      }
      if (payload.type === 'presence') {
        setPeers(Array.isArray(payload.peers) ? payload.peers : []);
        return;
      }
      if (payload.type === 'snapshot') {
        const nextContent = payload.content ?? '';
        const nextRevision = Number(payload.revision) || 0;
        contentRef.current = nextContent;
        revisionRef.current = nextRevision;
        setContent(nextContent);
        setRevision(nextRevision);
        dirtyRef.current = false;
        setStatus('connected');
        setMessage(null);
        return;
      }
      if (payload.type === 'saved') {
        const nextRevision = Number(payload.revision) || revisionRef.current + 1;
        revisionRef.current = nextRevision;
        setRevision(nextRevision);
        dirtyRef.current = false;
        setStatus('saved');
        setLastSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setMessage('正文已保存，其他在线编辑者会收到更新。');
        onSaved(contentRef.current, nextRevision);
        return;
      }
      if (payload.type === 'update') {
        const nextRevision = Number(payload.revision) || revisionRef.current;
        if (dirtyRef.current) {
          setMessage('其他人刚刚更新了正文。请先保存，若版本冲突会自动切换到服务器最新内容。');
          return;
        }
        const nextContent = payload.content ?? '';
        contentRef.current = nextContent;
        revisionRef.current = nextRevision;
        setContent(nextContent);
        setRevision(nextRevision);
        setStatus('connected');
        setMessage('已同步其他编辑者的最新正文。');
        onSaved(nextContent, nextRevision);
        return;
      }
      if (payload.type === 'conflict') {
        const latest = payload.content ?? '';
        const nextRevision = Number(payload.revision) || revisionRef.current;
        contentRef.current = latest;
        revisionRef.current = nextRevision;
        setContent(latest);
        setRevision(nextRevision);
        dirtyRef.current = false;
        setStatus('conflict');
        setMessage('保存时发现版本冲突，已切换为服务器最新正文，请确认后再次编辑。');
        onSaved(latest, nextRevision);
        return;
      }
      if (payload.type === 'error') {
        setStatus('error');
        setMessage(payload.message || payload.code || '协同编辑发生错误。');
      }
    };
    socket.onerror = () => {
      setStatus('error');
      setMessage('协同通道连接失败，请确认后端服务仍在运行。');
    };
    socket.onclose = () => {
      setStatus((current) => current === 'error' ? current : 'closed');
      setPeers([]);
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [doc.id]);

  function updateContent(value: string) {
    dirtyRef.current = true;
    contentRef.current = value;
    setStatus((current) => current === 'saved' ? 'connected' : current);
    setContent(value);
  }

  function save() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setStatus('error');
      setMessage('协同通道未连接，暂时不能保存。');
      return;
    }
    setStatus('saving');
    setMessage(null);
    socket.send(JSON.stringify({ type: 'update', content: contentRef.current, baseRevision: revisionRef.current }));
  }

  return (
    <Overlay onClose={onClose}>
      <Panel
        title="协同编辑正文"
        subtitle={`${doc.title} · revision ${revision}${lastSavedAt ? ` · 上次保存 ${lastSavedAt}` : ''}`}
        toolbar={(
          <div className="collab-toolbar">
            <span className="collab-presence">{formatPresence(peers)}</span>
            <StatusBadge label={collabStatusText(status)} variant={status === 'error' || status === 'conflict' ? 'warning' : status === 'saved' ? 'success' : 'info'} />
          </div>
        )}
      >
        {message ? <div className={status === 'error' || status === 'conflict' ? 'form-error' : 'form-help-text'} style={{ marginBottom: 10 }}>{message}</div> : null}
        <div className="form-group">
          <label className="form-label">文档正文</label>
          <textarea
            className="form-textarea"
            rows={16}
            value={content}
            onChange={(event) => updateContent(event.target.value)}
            placeholder="在这里编辑文档正文；保存后会广播给同一文档的在线编辑者。"
          />
          <div className="form-help-text">
            保存使用服务器 revision 做冲突检测；顶部会显示当前在线人数与最近保存时间。若别人先保存，会提示冲突并刷新为最新内容。
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={status === 'connecting' || status === 'saving' || status === 'error' || status === 'closed'}>
            {status === 'saving' ? '保存中...' : '保存并广播'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function EditDocumentForm({
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

function UploadDocumentForm({
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

function DocumentsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageDocuments = canOperate(sessionUser, 'documents:manage');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [editing, setEditing] = useState<Document | null>(null);
  const [collaborating, setCollaborating] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const { data: projectsData } = useAsync<Project[]>(fetchProjects, []);
  const { data, loading, error, reload } = useAsync<Document[]>(
    () => fetchDocuments({
      type: typeFilter || undefined,
      category: categoryFilter || undefined,
      projectId: projectFilter || undefined,
    }),
    [typeFilter, categoryFilter, projectFilter],
  );

  const projects = projectsData ?? [];
  const documents = data ?? [];
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

  async function handleDelete(doc: Document) {
    if (!canManageDocuments) {
      toast.error('当前账号无权删除文档。');
      return;
    }
    const confirmed = await confirm({
      title: `删除文档“${doc.title}”？`,
      description: '删除后该文档及其分析记录入口将从文档中心移除。',
      confirmText: '删除文档',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDocument(doc.id);
      toast.success(`已删除文档“${doc.title}”`);
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  async function handleUploaded(doc: Document) {
    setUploading(false);
    reload();
    toast.success(`已上传文档“${doc.title}”`);

    if (!shouldAutoAnalyzeDocuments()) return;
    if (!canOperate(sessionUser, 'ai:analyze')) {
      toast.info('已开启自动分析，但当前账号没有 AI 分析权限。');
      return;
    }

    try {
      const job = await analyzeDocument({
        documentId: doc.id,
        type: doc.type,
        projectId: doc.projectId || undefined,
      });
      toast.success(`已自动创建 AI 分析任务：${job.jobId}`);
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '文档已上传，但自动 AI 分析启动失败');
    }
  }

  const columns: DataTableColumn<Document>[] = [
    {
      key: 'title',
      title: '文档标题',
      render: (doc) => <span className="font-medium">{doc.title}</span>,
    },
    {
      key: 'type',
      title: '类型',
      render: (doc) => <StatusBadge label={labelOf(DOC_TYPE_LABELS, doc.type)} status={doc.type} />,
    },
    {
      key: 'category',
      title: '分类',
      render: (doc) => <span>{categoryLabel(doc.category)}</span>,
    },
    {
      key: 'project',
      title: '项目',
      render: (doc) => doc.projectId ? (projectMap.get(doc.projectId) ?? doc.projectId) : '无',
    },
    {
      key: 'ownerRole',
      title: '责任角色',
      render: (doc) => <span>{roleLabel(doc.ownerRole)}</span>,
    },
    {
      key: 'aiStatus',
      title: 'AI 状态',
      render: (doc) => (
        <StatusBadge
          label={labelOf(DOC_AI_STATUS_LABELS, doc.aiStatus) || '未分析'}
          variant={aiStatusVariant(doc.aiStatus)}
        />
      ),
    },
    {
      key: 'owner',
      title: '负责人',
      render: (doc) => doc.owner || '未填写',
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      render: (doc) => <span className="text-secondary text-mono">{doc.updatedAt}</span>,
    },
    {
      key: 'actions',
      title: '操作',
      width: 120,
      render: (doc) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canManageDocuments ? (
            <>
              <button className="btn btn-text btn-xs" onClick={() => setEditing(doc)}>编辑</button>
              <button className="btn btn-text btn-xs" onClick={() => setCollaborating(doc)}>协同</button>
              <button
                className="btn btn-text btn-xs"
                style={{ color: 'var(--color-red, #dc2626)' }}
                onClick={() => handleDelete(doc)}
              >
                删除
              </button>
            </>
          ) : <span className="text-secondary">只读</span>}
        </div>
      ),
    },
  ];

  if (loading || error) {
    return (
      <div>
        <PageHeader title="文档中心" description="按项目、文档分类和责任角色统一整理文档。" />
        <PageState loading={loading} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="文档中心"
        description="项目经理、产品经理、开发和测试各自维护对应项目与职责范围内的文档。"
        actions={canManageDocuments ? (
          <button className="btn btn-primary btn-sm" onClick={() => setUploading(true)}>上传文档</button>
        ) : undefined}
      />

      <Panel
        title="文档列表"
        subtitle={`共 ${documents.length} 份文档`}
        toolbar={
          <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
            <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ minWidth: 132 }}>
              {DOC_TYPES.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <select className="form-select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ minWidth: 132 }}>
              {DOC_CATEGORIES.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <select className="form-select" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="">全部项目</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
        }
      >
        <DataTable
          columns={columns}
          data={documents}
          rowKey="id"
          onRowClick={(doc) => setSelectedDoc(doc)}
          emptyText="当前筛选条件下暂无文档。"
        />
      </Panel>

      {selectedDoc && (
        <DocumentDetail
          doc={selectedDoc}
          projectMap={projectMap}
          canUseAi={canOperate(sessionUser, 'ai:analyze')}
          onClose={() => setSelectedDoc(null)}
        />
      )}

      {uploading && canManageDocuments && (
        <UploadDocumentForm
          projects={projects}
          defaultRole={sessionUser?.role ?? 'pm'}
          onClose={() => setUploading(false)}
          onUploaded={handleUploaded}
        />
      )}

      {editing && canManageDocuments && (
        <EditDocumentForm
          document={editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {collaborating && canManageDocuments && (
        <DocumentCollaborationEditor
          document={collaborating}
          onClose={() => setCollaborating(null)}
          onSaved={(content, revision) => {
            setCollaborating((current) => current && current.id === collaborating.id ? { ...current, content, collabRevision: revision } : current);
            setSelectedDoc((current) => current && current.id === collaborating.id ? { ...current, content, collabRevision: revision } : current);
            reload();
          }}
        />
      )}
    </div>
  );
}

export default DocumentsPage;
