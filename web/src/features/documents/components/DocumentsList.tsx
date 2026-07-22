import DataTable, { type DataTableColumn } from '../../../components/common/DataTable';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import { DOC_TYPE_LABELS, DOC_AI_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Document, Project } from '../../../types';
import {
  DOC_CATEGORIES,
  DOC_TYPES,
  aiStatusVariant,
  categoryLabel,
  roleLabel,
} from './documentMeta';

export default function DocumentsList({
  documents,
  projects,
  projectMap,
  typeFilter,
  categoryFilter,
  projectFilter,
  canManageDocuments,
  onTypeFilterChange,
  onCategoryFilterChange,
  onProjectFilterChange,
  onRowClick,
  onEdit,
  onCollaborate,
  onDelete,
}: {
  documents: Document[];
  projects: Project[];
  projectMap: Map<string, string>;
  typeFilter: string;
  categoryFilter: string;
  projectFilter: string;
  canManageDocuments: boolean;
  onTypeFilterChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onProjectFilterChange: (value: string) => void;
  onRowClick: (doc: Document) => void;
  onEdit: (doc: Document) => void;
  onCollaborate: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}) {
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
              <button className="btn btn-text btn-xs" onClick={() => onEdit(doc)}>编辑</button>
              <button className="btn btn-text btn-xs" onClick={() => onCollaborate(doc)}>协同</button>
              <button
                className="btn btn-text btn-xs"
                style={{ color: 'var(--color-red, #dc2626)' }}
                onClick={() => onDelete(doc)}
              >
                删除
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
      subtitle={`共 ${documents.length} 份文档`}
      toolbar={
        <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
          <select className="form-select" value={typeFilter} onChange={(e) => onTypeFilterChange(e.target.value)} style={{ minWidth: 132 }}>
            {DOC_TYPES.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <select className="form-select" value={categoryFilter} onChange={(e) => onCategoryFilterChange(e.target.value)} style={{ minWidth: 132 }}>
            {DOC_CATEGORIES.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <select className="form-select" value={projectFilter} onChange={(e) => onProjectFilterChange(e.target.value)} style={{ minWidth: 160 }}>
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
        onRowClick={onRowClick}
        emptyText="当前筛选条件下暂无文档。"
      />
    </Panel>
  );
}
