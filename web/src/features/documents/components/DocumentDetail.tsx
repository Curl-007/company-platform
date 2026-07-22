import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import { DOC_TYPE_LABELS, DOC_AI_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Document } from '../../../types';
import { categoryLabel, roleLabel } from './documentMeta';

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
