import { useState, useRef } from 'react';
import { fetchDocuments, uploadDocument } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import DataTable, { type DataTableColumn } from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import type { Document } from '../types';

const DOC_TYPES = [
  { key: '', label: '全部' },
  { key: 'requirement', label: '需求文档' },
  { key: 'design', label: '设计文档' },
  { key: 'test', label: '测试文档' },
  { key: 'bid', label: '招标文件' },
];

const DOC_UPLOAD_TYPES = [
  { key: 'requirement', label: '需求文档' },
  { key: 'design', label: '设计文档' },
  { key: 'test', label: '测试文档' },
  { key: 'bid', label: '招标文件' },
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB — keeps base64 payload reasonable

function aiStatusVariant(status: string): 'success' | 'warning' | 'info' | 'neutral' {
  const lower = status.toLowerCase();
  if (/done|completed|passed|success/.test(lower)) return 'success';
  if (/pending|review|processing/.test(lower)) return 'warning';
  if (/running|in.?progress/.test(lower)) return 'info';
  return 'neutral';
}

const docColumns: DataTableColumn<Document>[] = [
  {
    key: 'title',
    title: '文档标题',
    sorter: (a, b) => a.title.localeCompare(b.title),
    render: (doc) => <span className="font-medium">{doc.title}</span>,
  },
  {
    key: 'type',
    title: '类型',
    render: (doc) => <StatusBadge label={doc.type} status={doc.type} />,
  },
  {
    key: 'version',
    title: '版本',
    align: 'center',
    render: (doc) => <span className="text-mono">{doc.version}</span>,
  },
  {
    key: 'aiStatus',
    title: 'AI 分析状态',
    render: (doc) => (
      <StatusBadge
        label={doc.aiStatus || '未分析'}
        variant={aiStatusVariant(doc.aiStatus)}
      />
    ),
  },
  {
    key: 'owner',
    title: '负责人',
    render: (doc) => doc.owner || '—',
  },
  {
    key: 'updatedAt',
    title: '更新时间',
    sorter: (a, b) => a.updatedAt.localeCompare(b.updatedAt),
    render: (doc) => <span className="text-secondary text-mono">{doc.updatedAt}</span>,
  },
];

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

function DocumentDetail({ doc, onClose }: { doc: Document; onClose: () => void }) {
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
              <div className="metric-card-value">{doc.type}</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">版本</div>
              <div className="metric-card-value">{doc.version}</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">负责人</div>
              <div className="metric-card-value">{doc.owner || '—'}</div>
            </div>
            <div className="metric-card">
              <div className="metric-card-label">AI 状态</div>
              <div className="metric-card-value">{doc.aiStatus || '未分析'}</div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="section-title">文件信息</div>
            <div className="body-text" style={{ marginTop: 4 }}>
              文件大小: {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(1)} KB` : '—'}
            </div>
            <div className="body-text">文件类型: {doc.fileType || '—'}</div>
            <div className="body-text">更新时间: {doc.updatedAt}</div>
          </div>

          {doc.linkedRequirements && doc.linkedRequirements.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="section-title">关联需求</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {doc.linkedRequirements.map((req, index) => (
                  <li key={index} className="body-text" style={{ marginBottom: 4 }}>{req}</li>
                ))}
              </ul>
            </div>
          )}

          {doc.risks && doc.risks.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="section-title">风险项</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {doc.risks.map((risk, index) => (
                  <li key={index} className="body-text" style={{ marginBottom: 4 }}>{risk}</li>
                ))}
              </ul>
            </div>
          )}

          {doc.content && (
            <div>
              <div className="section-title">文档内容</div>
              <div className="body-text" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{doc.content}</div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function UploadDocumentForm({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('requirement');
  const [owner, setOwner] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit() {
    setFormError(null);
    if (!title.trim()) return setFormError('请输入文档标题。');
    if (!owner.trim()) return setFormError('请输入负责人。');
    if (!file) return setFormError('请选择要上传的文件。');
    if (file.size > MAX_UPLOAD_BYTES) return setFormError('文件过大，单个文件限制 5MB 以内。');

    setSubmitting(true);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
      await uploadDocument({
        title: title.trim(),
        type,
        owner: owner.trim(),
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream',
        contentBase64,
      });
      onUploaded();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : '上传失败，请重试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title="上传文档" subtitle="选择文件并填写信息后提交">
        {formError && <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div>}
        <div className="form-group">
          <label className="form-label">标题</label>
          <input className="form-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="文档标题" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">类型</label>
            <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
              {DOC_UPLOAD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="负责人姓名" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">文件（≤ 5MB）</label>
          <input
            ref={fileInputRef}
            type="file"
            className="form-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '上传中…' : '上传'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function DocumentsPage() {
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [uploading, setUploading] = useState(false);
  const { data, loading, error, reload } = useAsync<Document[]>(() => fetchDocuments(typeFilter || undefined), [typeFilter]);

  const documents = data ?? [];

  if (loading || error) {
    return (
      <div>
        <PageHeader title="文档中心" description="管理项目需求文档、设计文档、测试文档及 AI 分析状态。" />
        <PageState loading={loading} error={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="文档中心"
        description="管理项目需求文档、设计文档、测试文档及 AI 分析状态。"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setUploading(true)}>上传文档</button>
        }
      />

      <Panel
        title="文档列表"
        subtitle={`共 ${documents.length} 份文档`}
        toolbar={
          <div className="flex items-center gap-1">
            {DOC_TYPES.map((item) => (
              <button
                key={item.key}
                className={`btn btn-sm ${typeFilter === item.key ? 'btn-primary' : 'btn-text'}`}
                onClick={() => setTypeFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      >
        <DataTable
          columns={docColumns}
          data={documents}
          rowKey="id"
          onRowClick={(doc) => setSelectedDoc(doc)}
          emptyText={typeFilter ? '当前筛选条件下暂无文档。' : '暂无文档。'}
        />
      </Panel>

      {selectedDoc && (
        <DocumentDetail doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
      )}

      {uploading && (
        <UploadDocumentForm
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

export default DocumentsPage;
