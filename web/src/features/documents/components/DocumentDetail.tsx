import { FileText, X } from 'lucide-react';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import StatusBadge from '../../../components/common/StatusBadge';
import { DOC_TYPE_LABELS, DOC_AI_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Document } from '../../../types';
import {
  aiStatusVariant,
  categoryLabel,
  formatFileSize,
  formatLabel,
  isExtractableFormat,
  roleLabel,
} from './documentMeta';

export default function DocumentDetail({
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
  const updated = doc.updatedAt?.includes('T')
    ? doc.updatedAt.replace('T', ' ').slice(0, 16)
    : (doc.updatedAt || '-');

  return (
    <>
      <div className="detail-drawer-scrim" onClick={onClose} />
      <div className="detail-drawer doc-detail-drawer">
        <div className="panel doc-detail-panel">
          <div className="panel-header">
            <div className="panel-header-left min-w-0">
              <div className="min-w-0">
                <div className="panel-title truncate" title={doc.title}>{doc.title}</div>
                <div className="panel-subtitle truncate" title={doc.fileName}>{doc.fileName}</div>
              </div>
            </div>
            <div className="panel-toolbar">
              <button className="btn btn-text btn-sm btn-with-icon" onClick={onClose}>
                <X size={15} aria-hidden="true" /> 关闭
              </button>
            </div>
          </div>
          <div className="panel-body doc-detail-body">
            <section className="doc-detail-summary">
              <div className="doc-detail-badges">
                <span className="doc-ext-chip">{formatLabel(doc.fileName || doc.title)}</span>
                <StatusBadge label={labelOf(DOC_TYPE_LABELS, doc.type)} status={doc.type} />
                <StatusBadge
                  label={labelOf(DOC_AI_STATUS_LABELS, doc.aiStatus) || '未分析'}
                  variant={aiStatusVariant(doc.aiStatus)}
                />
                <span className="doc-detail-chip">{categoryLabel(doc.category)}</span>
              </div>
              <div className="doc-detail-metrics">
                <div className="doc-detail-metric">
                  <span>负责人</span>
                  <strong>{doc.owner || '未填写'}</strong>
                </div>
                <div className="doc-detail-metric">
                  <span>责任角色</span>
                  <strong>{roleLabel(doc.ownerRole)}</strong>
                </div>
                <div className="doc-detail-metric">
                  <span>归属项目</span>
                  <strong title={projectName}>{projectName}</strong>
                </div>
                <div className="doc-detail-metric">
                  <span>更新时间</span>
                  <strong className="text-mono">{updated}</strong>
                </div>
              </div>
            </section>

            {canUseAi ? (
              <BusinessAdvicePanel
                targetType="document"
                targetId={doc.id}
                title="AI 文档分析"
                description="基于文档正文、项目归属、关联需求、风险项和分析 Job 生成。"
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

            <section className="doc-detail-block">
              <div className="section-title">文件信息</div>
              <div className="doc-file-grid">
                <div>
                  <span>大小</span>
                  <strong>{doc.fileSize ? formatFileSize(doc.fileSize) : '未知'}</strong>
                </div>
                <div>
                  <span>MIME</span>
                  <strong title={doc.fileType || '未知'}>{doc.fileType || '未知'}</strong>
                </div>
                <div>
                  <span>正文抽取</span>
                  <strong>{isExtractableFormat(doc.fileName || '') ? '支持 / 已尝试' : '附件保存'}</strong>
                </div>
                <div>
                  <span>版本</span>
                  <strong>{doc.version || '-'}</strong>
                </div>
              </div>
            </section>

            {doc.linkedRequirements?.length ? (
              <section className="doc-detail-block">
                <div className="section-title">关联需求</div>
                <ul className="doc-detail-list">
                  {doc.linkedRequirements.map((requirement, index) => (
                    <li key={`${requirement}-${index}`}>{requirement}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {doc.risks?.length ? (
              <section className="doc-detail-block">
                <div className="section-title">风险项</div>
                <ul className="doc-detail-list">
                  {doc.risks.map((risk, index) => (
                    <li key={`${risk}-${index}`}>{risk}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="doc-detail-block">
              <div className="section-title">文档内容</div>
              {doc.content ? (
                <pre className="doc-content-preview">{doc.content}</pre>
              ) : (
                <div className="doc-content-empty">
                  <FileText size={16} aria-hidden="true" />
                  暂无抽取正文。Office/图片等格式会按附件保存；可上传 TXT/Markdown/PDF/DOCX 以提升 AI 分析质量。
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
