import { useEffect, useState } from 'react';
import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import StatusBadge from '../../../components/common/StatusBadge';
import PageState from '../../../components/common/PageState';
import {
  PRIORITY_LABELS,
  REQUIREMENT_STATUS_LABELS,
  USER_ROLE_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canAccessPageForUser } from '../../../constants/roles';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { fetchRequirement } from '../../requirements/api';
import { navigateTo } from '../../team/components/teamMeta';
import type { DashboardData, Requirement } from '../../../types';

type RequirementProgressItem = DashboardData['requirementProgress'][number];

export default function MyWorkRequirementsPanel({ items }: { items: RequirementProgressItem[] }) {
  const sessionUser = getSessionUser();
  const canOpenRequirements = canAccessPageForUser(sessionUser, 'requirements');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedSummary = items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  useEffect(() => {
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const detailAsync = useAsync<Requirement | null>(
    () => (selectedSummary ? fetchRequirement(selectedSummary.id) : Promise.resolve(null)),
    [selectedSummary?.id],
  );
  const detail = detailAsync.data;

  function openInRequirements(id: string) {
    navigateTo('requirements', { focus: id });
  }

  return (
    <div className="mywork-split">
      <Panel title="我的需求" subtitle={`共 ${items.length} 条`} className="mywork-panel-left">
        <div className="mywork-queue">
          {items.map((item) => (
            <div
              key={item.id}
              className={`mywork-queue-item ${selectedSummary?.id === item.id ? 'selected' : ''}`}
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
                <span className="text-mono" style={{ fontSize: 12 }}>{item.completion ?? 0}%</span>
              </div>
              <div className="mywork-queue-item-meta">
                <span>{item.id}</span>
                <span>{item.projectName || item.projectId}</span>
              </div>
            </div>
          ))}
          {items.length === 0 ? <div className="empty-state-desc">当前没有指派给你的需求。</div> : null}
        </div>
      </Panel>

      <Panel
        title="需求详情"
        className="mywork-panel-center"
        toolbar={
          selectedSummary && canOpenRequirements ? (
            <button className="btn btn-secondary btn-sm" onClick={() => openInRequirements(selectedSummary.id)}>
              打开完整详情
            </button>
          ) : undefined
        }
      >
        {!selectedSummary ? (
          <div className="empty-state-desc">请选择左侧需求查看详情。</div>
        ) : detailAsync.loading || detailAsync.error ? (
          <PageState loading={detailAsync.loading} error={detailAsync.error} onRetry={() => { void detailAsync.reload(); }} />
        ) : detail ? (
          <div className="mywork-detail">
            <div className="mywork-detail-header">
              <div>
                <h3>{detail.title}</h3>
                <div className="text-secondary" style={{ fontSize: 13, marginTop: 4 }}>
                  {detail.id} · {selectedSummary.projectName || detail.projectId}
                </div>
              </div>
              <StatusBadge status={detail.status} label={labelOf(REQUIREMENT_STATUS_LABELS, detail.status)} />
            </div>
            <div className="mywork-detail-meta">
              <div className="detail-field">
                <span className="detail-label">优先级</span>
                <span className="detail-value">{labelOf(PRIORITY_LABELS, detail.priority)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">负责人</span>
                <span className="detail-value">{detail.owner || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">执行人</span>
                <span className="detail-value">
                  {detail.assignee
                    ? `${detail.assignee}${detail.assigneeRole ? ` · ${labelOf(USER_ROLE_LABELS, detail.assigneeRole)}` : ''}`
                    : '未分配'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">分配状态</span>
                <span className="detail-value">{detail.assignmentStatus || '-'}</span>
              </div>
            </div>
            <div className="detail-field mywork-detail-progress">
              <span className="detail-label">完成度</span>
              <ProgressBar percent={detail.completion ?? selectedSummary.completion ?? 0} />
            </div>
            {detail.description ? (
              <div className="detail-field" style={{ marginTop: 12 }}>
                <span className="detail-label">描述</span>
                <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</div>
              </div>
            ) : null}
            {Array.isArray(detail.acceptanceCriteria) && detail.acceptanceCriteria.length > 0 ? (
              <div className="detail-field" style={{ marginTop: 12 }}>
                <span className="detail-label">验收标准</span>
                <ul className="detail-value" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {detail.acceptanceCriteria.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!canOpenRequirements ? (
              <div className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>
                当前角色无「需求管理」页面权限时，可在此查看指派给你的需求摘要。
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty-state-desc">未能加载需求详情。</div>
        )}
      </Panel>
    </div>
  );
}
