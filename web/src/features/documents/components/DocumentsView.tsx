import { useMemo, useState } from 'react';
import { analyzeDocument, deleteDocument, fetchDocuments } from '../api';
import { fetchProjects } from '../../projects/api';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import PageHeader from '../../../components/common/PageHeader';
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
import { shouldAutoAnalyzeDocuments } from './documentMeta';

export default function DocumentsView() {
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

      <DocumentsList
        documents={documents}
        projects={projects}
        projectMap={projectMap}
        typeFilter={typeFilter}
        categoryFilter={categoryFilter}
        projectFilter={projectFilter}
        canManageDocuments={canManageDocuments}
        onTypeFilterChange={setTypeFilter}
        onCategoryFilterChange={setCategoryFilter}
        onProjectFilterChange={setProjectFilter}
        onRowClick={setSelectedDoc}
        onEdit={setEditing}
        onCollaborate={setCollaborating}
        onDelete={handleDelete}
      />

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
