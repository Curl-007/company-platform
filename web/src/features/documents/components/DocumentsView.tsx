import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      toast.error(t('features.documents.documentsView.noDeletePermission'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.documents.documentsView.deleteConfirmTitle', { name: doc.title }),
      description: t('features.documents.documentsView.deleteConfirmDescription'),
      confirmText: t('features.documents.documentsView.deleteDocument'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteDocument(doc.id);
      toast.success(t('features.documents.documentsView.deletedDocument', { name: doc.title }));
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
      reload();
    } catch (err: unknown) {
      toast.error(err instanceof ApiError ? err.message : t('features.documents.documentsView.deleteFailed'));
    }
  }

  async function handleUploaded(docs: Document[]) {
    setUploading(false);
    reload();
    if (docs.length === 1) toast.success(t('features.documents.documentsView.uploadedDocument', { name: docs[0].title }));
    else toast.success(t('features.documents.documentsView.uploadedCount', { count: docs.length }));

    if (!shouldAutoAnalyzeDocuments()) return;
    if (!canUseAi) {
      toast.info(t('features.documents.documentsView.autoAnalyzeNoPermission'));
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
      toast.success(t('features.documents.documentsView.autoAnalyzeJobsCreated', { count: ok }));
      reload();
    } else {
      toast.error(t('features.documents.documentsView.autoAnalyzeFailed'));
    }
  }

  if (loading || error) {
    return <PageState loading={loading} error={error} onRetry={reload} />;
  }

  return (
    <div className="doc-workbench">
      <section className="doc-signal-strip" aria-label={t('features.documents.documentsView.overviewAria')}>
        <div className="doc-signal">
          <span className="doc-signal-label"><FileText size={13} aria-hidden="true" /> {t('features.documents.documentsView.totalDocuments')}</span>
          <strong>{signals.total}</strong>
          <em>{t('features.documents.documentsView.currentFilterScope')}</em>
        </div>
        <div className="doc-signal">
          <span className="doc-signal-label"><FolderOpen size={13} aria-hidden="true" /> {t('features.documents.documentsView.projectDocuments')}</span>
          <strong>{signals.projectDocs}</strong>
          <em>{t('features.documents.documentsView.linkedToProjects')}</em>
        </div>
        <div className="doc-signal">
          <span className="doc-signal-label"><Sparkles size={13} aria-hidden="true" /> {t('features.documents.documentsView.analyzed')}</span>
          <strong>{signals.analyzed}</strong>
          <em>{t('features.documents.documentsView.aiDone')}</em>
        </div>
        <div className={`doc-signal ${signals.pendingAi > 0 ? 'is-warn' : ''}`}>
          <span className="doc-signal-label"><RefreshCw size={13} aria-hidden="true" /> {t('features.documents.documentsView.pendingAnalysis')}</span>
          <strong>{signals.pendingAi}</strong>
          <em>{t('features.documents.documentsView.uploadingOrProcessing')}</em>
        </div>
        <div className="doc-signal">
          <span className="doc-signal-label"><FileText size={13} aria-hidden="true" /> {t('features.documents.documentsView.formatCount')}</span>
          <strong>{signals.formats}</strong>
          <em>{t('features.documents.documentsView.multiFormatPool')}</em>
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
