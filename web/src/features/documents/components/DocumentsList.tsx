import {
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
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
  const columns: DataTableColumn<Document>[] = [
    {
      key: 'title',
      title: '文档',
      render: (doc) => (
        <div className="doc-title-cell">
          <div className="doc-title-main">
            <span className="doc-ext-chip">{formatLabel(doc.fileName || doc.title)}</span>
            <strong className="doc-title-text" title={doc.title}>{doc.title}</strong>
          </div>
          <span className="doc-title-meta" title={doc.fileName}>
            {doc.fileName || '未命名文件'}
            {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      title: '类型',
      width: 110,
      render: (doc) => <StatusBadge label={labelOf(DOC_TYPE_LABELS, doc.type)} status={doc.type} />,
    },
    {
      key: 'category',
      title: '分类',
      width: 96,
      render: (doc) => <span className="doc-meta-text">{categoryLabel(doc.category)}</span>,
    },
    {
      key: 'project',
      title: '项目',
      width: 140,
      render: (doc) => (
        <span className="doc-meta-text truncate" title={doc.projectId ? (projectMap.get(doc.projectId) ?? doc.projectId) : '无'}>
          {doc.projectId ? (projectMap.get(doc.projectId) ?? doc.projectId) : '无'}
        </span>
      ),
    },
    {
      key: 'owner',
      title: '负责人',
      width: 120,
      render: (doc) => (
        <div className="doc-owner-cell">
          <span>{doc.owner || '未填写'}</span>
          <em>{roleLabel(doc.ownerRole)}</em>
        </div>
      ),
    },
    {
      key: 'aiStatus',
      title: 'AI 状态',
      width: 100,
      render: (doc) => (
        <StatusBadge
          label={labelOf(DOC_AI_STATUS_LABELS, doc.aiStatus) || '未分析'}
          variant={aiStatusVariant(doc.aiStatus)}
        />
      ),
    },
    {
      key: 'updatedAt',
      title: '更新时间',
      width: 140,
      render: (doc) => {
        const raw = doc.updatedAt || '';
        const pretty = raw.includes('T') ? raw.replace('T', ' ').slice(0, 16) : raw;
        return <span className="text-secondary text-mono doc-meta-text">{pretty || '-'}</span>;
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 150,
      render: (doc) => (
        <div className="doc-row-actions" onClick={(e) => e.stopPropagation()}>
          {canManageDocuments ? (
            <>
              <button className="btn btn-text btn-xs btn-with-icon" onClick={() => onEdit(doc)}>
                <Pencil size={12} aria-hidden="true" /> 编辑
              </button>
              <button className="btn btn-text btn-xs btn-with-icon" onClick={() => onCollaborate(doc)}>
                <Users size={12} aria-hidden="true" /> 协同
              </button>
              <button
                className="btn btn-text btn-xs btn-with-icon doc-danger-btn"
                onClick={() => onDelete(doc)}
              >
                <Trash2 size={12} aria-hidden="true" /> 删除
              </button>
            </>
          ) : <span className="text-secondary">只读</span>}
        </div>
      ),
    },
  ];

  return (
    <Panel
      title="文档列表"
      subtitle={`显示 ${documents.length} / ${totalCount} 份`}
      className="documents-list-panel doc-pool-panel"
      toolbar={(
        <div className="doc-pool-toolbar">
          <button className="btn btn-secondary btn-sm btn-with-icon" onClick={onReload}>
            <RefreshCw size={14} aria-hidden="true" /> 刷新
          </button>
          {canManageDocuments ? (
            <button className="btn btn-primary btn-sm btn-with-icon" onClick={onUpload}>
              <Plus size={14} aria-hidden="true" /> 上传文档
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
              placeholder="搜索标题 / 文件名 / 负责人 / 格式"
              aria-label="搜索文档"
            />
          </div>
          <select
            className="form-select"
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            aria-label="文档类型"
          >
            {DOC_TYPES.map((item) => (
              <option key={item.key || 'all-type'} value={item.key}>{item.label}</option>
            ))}
          </select>
          <select
            className="form-select"
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
            aria-label="文档分类"
          >
            {DOC_CATEGORIES.map((item) => (
              <option key={item.key || 'all-category'} value={item.key}>{item.label}</option>
            ))}
          </select>
          <select
            className="form-select filter-project"
            value={projectFilter}
            onChange={(e) => onProjectFilterChange(e.target.value)}
            aria-label="所属项目"
          >
            <option value="">全部项目</option>
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
        emptyText="当前筛选条件下暂无文档。可上传 Word / Excel / PPT / PDF / Markdown / 图片等格式。"
        pageSize={10}
      />
      {!documents.length ? null : (
        <div className="doc-list-hint">
          <FileText size={13} aria-hidden="true" />
          支持多格式上传；文本类可抽取正文供 AI 分析，Office/图片按附件保存。
        </div>
      )}
    </Panel>
  );
}
