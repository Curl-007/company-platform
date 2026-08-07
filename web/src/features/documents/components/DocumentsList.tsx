import {
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import FilterBar from '../../../components/common/FilterBar';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { DOC_TYPE_LABELS, DOC_AI_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Document, Project } from '../../../types';
import {
  DOC_CATEGORIES,
  DOC_TYPES,
  aiStatusVariant,
  categoryLabel,
  formatFileSize,
  formatLabel,
  roleLabel,
} from './documentMeta';

export default function DocumentsList({
  documents,
  totalCount,
  projects,
  projectMap,
  typeFilter,
  categoryFilter,
  projectFilter,
  keyword,
  canManageDocuments,
  onTypeFilterChange,
  onCategoryFilterChange,
  onProjectFilterChange,
  onKeywordChange,
  onReload,
  onUpload,
  onRowClick,
  onEdit,
  onCollaborate,
  onDelete,
}: {
  documents: Document[];
  totalCount: number;
  projects: Project[];
  projectMap: Map<string, string>;
  typeFilter: string;
  categoryFilter: string;
  projectFilter: string;
  keyword: string;
  canManageDocuments: boolean;
  onTypeFilterChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onProjectFilterChange: (value: string) => void;
  onKeywordChange: (value: string) => void;
  onReload: () => void;
  onUpload: () => void;
  onRowClick: (doc: Document) => void;
  onEdit: (doc: Document) => void;
  onCollaborate: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}) {
  const { t } = useTranslation();
  const columns: DataTableColumn<Document>[] = [
    {
      key: 'title',
      title: t('features.documents.documentsList.document'),
      render: (doc) => (
        <div className="doc-title-cell">
          <div className="doc-title-main">
            <span className="doc-ext-chip">{formatLabel(doc.fileName || doc.title)}</span>
            <strong className="doc-title-text" title={doc.title}>{doc.title}</strong>
          </div>
          <span className="doc-title-meta" title={doc.fileName}>
            {doc.fileName || t('features.documents.documentsList.unnamedFile')}
            {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      title: t('features.documents.documentsList.type'),
      width: 110,
      render: (doc) => <StatusBadge label={labelOf(DOC_TYPE_LABELS, doc.type)} status={doc.type} />,
    },
    {
      key: 'category',
      title: t('features.documents.documentsList.category'),
      width: 96,
      render: (doc) => <span className="doc-meta-text">{categoryLabel(doc.category)}</span>,
    },
    {
      key: 'project',
      title: t('features.documents.documentsList.project'),
      width: 140,
      render: (doc) => (
        <span className="doc-meta-text truncate" title={doc.projectId ? (projectMap.get(doc.projectId) ?? doc.projectId) : t('features.documents.documentsList.none')}>
          {doc.projectId ? (projectMap.get(doc.projectId) ?? doc.projectId) : t('features.documents.documentsList.none')}
        </span>
      ),
    },
    {
      key: 'owner',
      title: t('features.documents.documentsList.owner'),
      width: 120,
      render: (doc) => (
        <div className="doc-owner-cell">
          <span>{doc.owner || t('common.unfilled')}</span>
          <em>{roleLabel(doc.ownerRole)}</em>
        </div>
      ),
    },
    {
      key: 'aiStatus',
      title: t('features.documents.documentsList.aiStatus'),
      width: 100,
      render: (doc) => (
        <StatusBadge
          label={labelOf(DOC_AI_STATUS_LABELS, doc.aiStatus) || t('features.documents.documentsList.notAnalyzed')}
          variant={aiStatusVariant(doc.aiStatus)}
        />
      ),
    },
    {
      key: 'updatedAt',
      title: t('features.documents.documentsList.updatedAt'),
      width: 140,
      render: (doc) => {
        const raw = doc.updatedAt || '';
        const pretty = raw.includes('T') ? raw.replace('T', ' ').slice(0, 16) : raw;
        return <span className="text-secondary text-mono doc-meta-text">{pretty || '-'}</span>;
      },
    },
    {
      key: 'actions',
      title: t('common.actions'),
      width: 150,
      render: (doc) => (
        <div className="doc-row-actions" onClick={(e) => e.stopPropagation()}>
          {canManageDocuments ? (
            <>
              <button className="btn btn-text btn-xs btn-with-icon" onClick={() => onEdit(doc)}>
                <Pencil size={12} aria-hidden="true" /> {t('common.edit')}
              </button>
              <button className="btn btn-text btn-xs btn-with-icon" onClick={() => onCollaborate(doc)}>
                <Users size={12} aria-hidden="true" /> {t('features.documents.documentsList.collaborate')}
              </button>
              <button
                className="btn btn-text btn-xs btn-with-icon doc-danger-btn"
                onClick={() => onDelete(doc)}
              >
                <Trash2 size={12} aria-hidden="true" /> {t('common.delete')}
              </button>
            </>
          ) : <span className="text-secondary">{t('features.documents.documentsList.readOnly')}</span>}
        </div>
      ),
    },
  ];

  return (
    <Panel
      title={t('features.documents.documentsList.panelTitle')}
      subtitle={t('features.documents.documentsList.showingCount', { count: documents.length, total: totalCount })}
      className="documents-list-panel doc-pool-panel"
      toolbar={(
        <div className="doc-pool-toolbar">
          <button className="btn btn-secondary btn-sm btn-with-icon" onClick={onReload}>
            <RefreshCw size={14} aria-hidden="true" /> {t('features.documents.documentsList.refresh')}
          </button>
          {canManageDocuments ? (
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={onUpload}>
              <Plus size={14} aria-hidden="true" /> {t('features.documents.documentsList.uploadDocument')}
            </button>
          ) : null}
        </div>
      )}
    >
      <div className="doc-filter-wrap">
        <FilterBar>
          <div className="input-with-icon filter-search doc-search">
            <Search size={14} className="shrink-0 text-secondary" aria-hidden="true" />
            <input
              className="form-input border-0 bg-transparent shadow-none"
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              placeholder={t('features.documents.documentsList.searchPlaceholder')}
              aria-label={t('features.documents.documentsList.searchAria')}
            />
          </div>
          <select
            className="form-select"
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            aria-label={t('features.documents.documentsList.typeAria')}
          >
            {DOC_TYPES.map((item) => (
              <option key={item.key || 'all-type'} value={item.key}>{t(item.label)}</option>
            ))}
          </select>
          <select
            className="form-select"
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
            aria-label={t('features.documents.documentsList.categoryAria')}
          >
            {DOC_CATEGORIES.map((item) => (
              <option key={item.key || 'all-category'} value={item.key}>{t(item.label)}</option>
            ))}
          </select>
          <select
            className="form-select filter-project"
            value={projectFilter}
            onChange={(e) => onProjectFilterChange(e.target.value)}
            aria-label={t('features.documents.documentsList.projectAria')}
          >
            <option value="">{t('features.documents.documentsList.allProjects')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </FilterBar>
      </div>
      <div className="filter-bar-divider" />
      <DataTable
        className="doc-table"
        columns={columns}
        data={documents}
        rowKey="id"
        onRowClick={onRowClick}
        emptyText={t('features.documents.documentsList.emptyText')}
        pageSize={10}
      />
      {!documents.length ? null : (
        <div className="doc-list-hint">
          <FileText size={13} aria-hidden="true" />
          {t('features.documents.documentsList.multiFormatHint')}
        </div>
      )}
    </Panel>
  );
}
