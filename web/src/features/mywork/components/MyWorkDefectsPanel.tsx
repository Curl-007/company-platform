import { useEffect, useState } from 'react';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canAccessPageForUser } from '../../../constants/roles';
import { getSessionUser } from '../../../services/auth';
import { navigateTo } from '../../team/components/teamMeta';
import type { DashboardData } from '../../../types';

type DefectItem = NonNullable<DashboardData['myDefects']>[number];

export default function MyWorkDefectsPanel({ defects }: { defects: DefectItem[] }) {
  const sessionUser = getSessionUser();
  const canOpenTesting = canAccessPageForUser(sessionUser, 'testing');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = defects.find((item) => item.id === selectedId) ?? defects[0] ?? null;

  useEffect(() => {
    if (defects.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !defects.some((item) => item.id === selectedId)) {
      setSelectedId(defects[0].id);
    }
  }, [defects, selectedId]);

  function openInTesting(id: string) {
    navigateTo('testing', { tab: 'defects', focus: id });
  }

  return (
    <div className="mywork-split">
      <Panel title="我的缺陷" subtitle={`共 ${defects.length} 条`} className="mywork-panel-left">
        <div className="mywork-queue">
          {defects.map((item) => (
            <div
              key={item.id}
              className={`mywork-queue-item ${selected?.id === item.id ? 'selected' : ''}`}
              onClick={() => setSelectedId(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(item.id);
                }
              }}
            >
              <div className="mywork-queue-item-main">
                <span className="mywork-queue-item-title">{item.title}</span>
                <StatusBadge status={item.status} label={labelOf(DEFECT_STATUS_LABELS, item.status)} showDot={false} />
              </div>
              <div className="mywork-queue-item-meta">
                <span>{item.id}</span>
                <span>{labelOf(DEFECT_SEVERITY_LABELS, item.severity)}</span>
              </div>
            </div>
          ))}
          {defects.length === 0 ? <div className="empty-state-desc">当前没有指派给你的缺陷。</div> : null}
        </div>
      </Panel>

      <Panel
        title="缺陷详情"
        className="mywork-panel-center"
        toolbar={
          selected && canOpenTesting ? (
            <button className="btn btn-secondary btn-sm" onClick={() => openInTesting(selected.id)}>
              打开完整详情
            </button>
          ) : undefined
        }
      >
        {selected ? (
          <div className="mywork-detail">
            <div className="mywork-detail-header">
              <div>
                <h3>{selected.title}</h3>
                <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                  {selected.id} · 项目 {selected.projectId}
                </div>
              </div>
              <StatusBadge status={selected.status} label={labelOf(DEFECT_STATUS_LABELS, selected.status)} />
            </div>
            <div className="mywork-detail-meta">
              <div className="detail-field">
                <span className="detail-label">严重级别</span>
                <span className="detail-value">{labelOf(DEFECT_SEVERITY_LABELS, selected.severity)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">处理人</span>
                <span className="detail-value">{selected.assignee || '未分配'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">报告人</span>
                <span className="detail-value">{selected.reporter || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">关联需求</span>
                <span className="detail-value text-mono">{selected.requirementId || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">发现构建</span>
                <span className="detail-value text-mono">{selected.foundInBuild || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">影响版本</span>
                <span className="detail-value">{selected.affectedVersion || '-'}</span>
              </div>
            </div>
            {selected.description ? (
              <div className="detail-field" style={{ marginTop: 12 }}>
                <span className="detail-label">描述</span>
                <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</div>
              </div>
            ) : (
              <div className="body-text" style={{ marginTop: 12 }}>暂无缺陷描述。</div>
            )}
            {!canOpenTesting ? (
              <div className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>
                当前角色无「测试质量」页面权限时，可在此查看指派给你的缺陷摘要。
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty-state-desc">请选择左侧缺陷查看详情。</div>
        )}
      </Panel>
    </div>
  );
}
