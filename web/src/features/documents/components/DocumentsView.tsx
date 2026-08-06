import { useMemo, useState } from 'react';
import {
  FileText,
  FolderOpen,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { analyzeDocument, deleteDocument, fetchDocuments } from '../api';
import { fetchProjects } from '../../projects/api';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import PageState from '../../../components/common/PageState';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
import type { Document, Project } from '../../../types';
import DocumentCollaborationEditor from './DocumentCollaborationEditor';
import DocumentDetail from './DocumentDetail';
import DocumentsList from './DocumentsList';
import EditDocumentForm from './EditDocumentForm';
import UploadDocumentForm from './UploadDocumentForm';
import {
  extensionOf,
  formatLabel,
  shouldAutoAnalyzeDocuments,
} from './documentMeta';

export default function DocumentsView() {
  const toast = useToast();
  const confirm = useConfirm();
  const sessionUser = getSessionUser();
  const canManageDocuments = canOperate(sessionUser, 'documents:manage');
  const canUseAi = canOperate(sessionUser, 'ai:analyze');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [editing, setEditing] = useState<Document | null>(null);
  const [collaborating, setCollaborating] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const { data: projectsData } = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const { data, loading, error, reload } = useAsync<Document[]>(
    () => fetchDocuments({
      type: typeFilter || undefined,
      category: categoryFilter || undefined,
      projectId: projectFilter || undefined,
    }),
    [typeFilter, categoryFilter, projectFilter],
    { cacheKey: 'documents:list' },
  );

  const projects = projectsData ?? [];
  const documents = data ?? [];
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

  const signals = useMemo(() => {
    const total = documents.length;
    const projectDocs = documents.filter((item) => item.category === 'project' || item.projectId).length;
    const analyzed = documents.filter((item) => /done|completed|success|passed/i.test(item.aiStatus || '')).length;
    const pendingAi = documents.filter((item) => /pending|processing|running|uploaded/i.test(item.aiStatus || '')).length;
    const formats = new Set(
      documents
        .map((item) => extensionOf(item.fileName || ''))
        .filter(Boolean),
    );
    return { total, projectDocs, analyzed, pendingAi, formats: formats.size };
  }, [documents]);

  const visibleDocuments = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((item) => {
      const hay = [
        item.title,
        item.fileName,
        item.owner,
        item.type,
        item.category,
        item.projectId ? projectMap.get(item.projectId) : '',
        formatLabel(item.fileName || ''),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [documents, keyword, projectMap]);

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
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  async function handleUploaded(docs: Document[]) {
    setUploading(false);
    reload();
    if (docs.length === 1) toast.success(`已上传文档“${docs[0].title}”`);
    else toast.success(`已上传 ${docs.length} 份文档`);

    if (!shouldAutoAnalyzeDocuments()) return;
    if (!canUseAi) {
      toast.info('已开启自动分析，但当前账号没有 AI 分析权限。');
      return;
    }

    let ok = 0;
    for (const doc of docs) {
      try {
        await analyzeDocument({
          documentId: doc.id,
          type: doc.type,
          projectId: doc.projectId || undefined,
        });
        ok += 1;
      } catch {
        // keep going for remaining docs
      }
    }
    if (ok > 0) {
      toast.success(`已自动创建 ${ok} 个 AI 分析任务`);
      reload();
    } else {
      toast.error('文档已上传，但自动 AI 分析启动失败');
    }
  }

  if (loading || error) {
    return <PageState loading={loading} error={error} onRetry={reload} />;
  }

  return (
    <div className="doc-workbench">
      <section className="doc-signal-strip" aria-label="文档中心概况">
        <div className="doc-signal">
          <span className="doc-signal-label"><FileText size={13} aria-hidden="true" /> 文档总数</span>
          <strong>{signals.total}</strong>
          <em>当前筛选范围</em>
        </div>
        <div className="doc-signal">
          <span className="doc-signal-label"><FolderOpen size={13} aria-hidden="true" /> 项目文档</span>
          <strong>{signals.projectDocs}</strong>
          <em>已关联项目</em>
        </div>
        <div className="doc-signal">
          <span className="doc-signal-label"><Sparkles size={13} aria-hidden="true" /> 已分析</span>
          <strong>{signals.analyzed}</strong>
          <em>AI 完成</em>
        </div>
        <div className={`doc-signal ${signals.pendingAi > 0 ? 'is-warn' : ''}`}>
          <span className="doc-signal-label"><RefreshCw size={13} aria-hidden="true" /> 待分析</span>
          <strong>{signals.pendingAi}</strong>
          <em>上传 / 处理中</em>
        </div>
        <div className="doc-signal">
          <span className="doc-signal-label"><FileText size={13} aria-hidden="true" /> 格式种类</span>
          <strong>{signals.formats}</strong>
          <em>多格式附件池</em>
        </div>
      </section>

      <DocumentsList
        documents={visibleDocuments}
        totalCount={documents.length}
        projects={projects}
        projectMap={projectMap}
        typeFilter={typeFilter}
        categoryFilter={categoryFilter}
        projectFilter={projectFilter}
        keyword={keyword}
        canManageDocuments={canManageDocuments}
        onTypeFilterChange={setTypeFilter}
        onCategoryFilterChange={setCategoryFilter}
        onProjectFilterChange={setProjectFilter}
        onKeywordChange={setKeyword}
        onReload={reload}
        onUpload={() => setUploading(true)}
        onRowClick={setSelectedDoc}
        onEdit={setEditing}
        onCollaborate={setCollaborating}
        onDelete={handleDelete}
      />

      {selectedDoc && (
        <DocumentDetail
          doc={selectedDoc}
          projectMap={projectMap}
          canUseAi={canUseAi}
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
