import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bug } from 'lucide-react';
import Panel from '../../../components/common/Panel';
import StatusBadge from '../../../components/common/StatusBadge';
import {
  DEFECT_SEVERITY_LABELS,
  DEFECT_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import { canAccessPageForUser, canOperate } from '../../../constants/roles';
import { getSessionUser } from '../../../services/auth';
import { ApiError } from '../../../services/api';
import { useToast } from '../../../components/common/Toast';
import { navigateTo } from '../../team/components/teamMeta';
import { fetchProjectMembers } from '../../projects/api';
import { handoffDefect } from '../../testing/api';
import type { DashboardData, ProjectMember } from '../../../types';
import MyWorkEmptyPanel from './MyWorkEmptyPanel';

type DefectItem = NonNullable<DashboardData['myDefects']>[number];

export default function MyWorkDefectsPanel({
  defects,
  onChanged,
}: {
  defects: DefectItem[];
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const sessionUser = getSessionUser();
  const role = String(sessionUser?.role || '').toLowerCase();
  const canOpenTesting = canAccessPageForUser(sessionUser, 'testing');
  const canManageDefect = canOperate(sessionUser, 'testing:manage') || role === 'dev' || role === 'qa' || role === 'pm' || role === 'admin';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = defects.find((item) => item.id === selectedId) ?? defects[0] ?? null;
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [targetName, setTargetName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defects.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !defects.some((item) => item.id === selectedId)) {
      setSelectedId(defects[0].id);
    }
  }, [defects, selectedId]);

  useEffect(() => {
    let cancelled = false;
    if (!selected?.projectId) {
      setMembers([]);
      return;
    }
    fetchProjectMembers(selected.projectId)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.projectId, selected?.id]);

  const devMembers = useMemo(
    () => members.filter((m) => String(m.role).toLowerCase() === 'dev'),
    [members],
  );
  const qaMembers = useMemo(
    () => members.filter((m) => String(m.role).toLowerCase() === 'qa'),
    [members],
  );

  // QA finds issue → assign DEV to fix; DEV fixed → assign QA to verify
  const canAssignToDev = Boolean(
    selected
    && canManageDefect
    && !['closed', 'rejected'].includes(selected.status)
    && (role === 'qa' || role === 'pm' || role === 'admin' || selected.assignee === sessionUser?.name),
  );
  const canAssignToQa = Boolean(
    selected
    && canManageDefect
    && ['in_fix', 'resolved', 'new', 'confirmed'].includes(selected.status)
    && (role === 'dev' || role === 'pm' || role === 'admin' || selected.assignee === sessionUser?.name),
  );

  useEffect(() => {
    if (!selected) {
      setTargetName('');
      return;
    }
    if (canAssignToDev && role === 'qa') {
      setTargetName(devMembers[0]?.userName || '');
    } else if (canAssignToQa && role === 'dev') {
      setTargetName(qaMembers[0]?.userName || '');
    } else if (canAssignToDev) {
      setTargetName(devMembers[0]?.userName || '');
    } else if (canAssignToQa) {
      setTargetName(qaMembers[0]?.userName || '');
    } else {
      setTargetName('');
    }
  }, [selected?.id, selected?.status, canAssignToDev, canAssignToQa, role, devMembers, qaMembers]);

  function openInTesting(id: string) {
    navigateTo('testing', { tab: 'defects', focus: id });
  }

  async function reassign(toRole: 'dev' | 'qa') {
    if (!selected) return;
    if (!targetName.trim()) {
      toast.error(toRole === 'dev' ? t('features.mywork.myWorkDefectsPanel.selectDevEngineer') : t('features.mywork.myWorkDefectsPanel.selectTestEngineer'));
      return;
    }
    setSubmitting(true);
    try {
      await handoffDefect(selected.id, {
        action: toRole === 'dev' ? 'assign_to_dev' : 'assign_to_qa',
        assignee: targetName.trim(),
        version: Number(selected.version) > 0 ? Number(selected.version) : 1,
      });
      toast.success(toRole === 'dev' ? t('features.mywork.myWorkDefectsPanel.assignedToDev') : t('features.mywork.myWorkDefectsPanel.assignedToQa'));
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.mywork.myWorkDefectsPanel.assignFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const assignOptions = role === 'qa' || (canAssignToDev && !canAssignToQa)
    ? devMembers
    : role === 'dev' || (canAssignToQa && !canAssignToDev)
      ? qaMembers
      : [...devMembers, ...qaMembers];

  if (defects.length === 0) {
    return (
      <MyWorkEmptyPanel
        icon={<Bug size={26} />}
        eyebrow={t('features.mywork.myWorkDefectsPanel.emptyEyebrow')}
        title={t('features.mywork.myWorkDefectsPanel.emptyTitle')}
        description={t('features.mywork.myWorkDefectsPanel.emptyDesc')}
        action={
          canOpenTesting ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => navigateTo('testing', { tab: 'defects' })}
            >
              <Bug size={15} /> {t('features.mywork.myWorkDefectsPanel.viewTesting')}
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="mywork-split">
      <Panel title={t('features.mywork.myWorkDefectsPanel.panelTitle')} subtitle={t('features.mywork.myWorkDefectsPanel.countSubtitle', { count: defects.length })} className="mywork-panel-left">
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
        </div>
      </Panel>

      <Panel
        title={t('features.mywork.myWorkDefectsPanel.detailPanelTitle')}
        className="mywork-panel-center"
        toolbar={
          selected && canOpenTesting ? (
            <button className="btn btn-secondary btn-sm" onClick={() => openInTesting(selected.id)}>
              {t('features.mywork.myWorkDefectsPanel.openFullDetail')}
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
                  {t('features.mywork.myWorkDefectsPanel.projectPrefix', { id: selected.id, projectId: selected.projectId })}
                </div>
              </div>
              <StatusBadge status={selected.status} label={labelOf(DEFECT_STATUS_LABELS, selected.status)} />
            </div>
            <div className="mywork-detail-meta">
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkDefectsPanel.severityLabel')}</span>
                <span className="detail-value">{labelOf(DEFECT_SEVERITY_LABELS, selected.severity)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkDefectsPanel.assigneeLabel')}</span>
                <span className="detail-value">{selected.assignee || t('features.mywork.myWorkDefectsPanel.unassigned')}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkDefectsPanel.reporterLabel')}</span>
                <span className="detail-value">{selected.reporter || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkDefectsPanel.requirementLabel')}</span>
                <span className="detail-value text-mono">{selected.requirementId || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkDefectsPanel.foundInBuildLabel')}</span>
                <span className="detail-value text-mono">{selected.foundInBuild || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">{t('features.mywork.myWorkDefectsPanel.affectedVersionLabel')}</span>
                <span className="detail-value">{selected.affectedVersion || '-'}</span>
              </div>
            </div>
            {selected.description ? (
              <div className="detail-field" style={{ marginTop: 12 }}>
                <span className="detail-label">{t('features.mywork.myWorkDefectsPanel.descriptionLabel')}</span>
                <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selected.description}</div>
              </div>
            ) : (
              <div className="body-text" style={{ marginTop: 12 }}>{t('features.mywork.myWorkDefectsPanel.noDescription')}</div>
            )}

            {(canAssignToDev || canAssignToQa) ? (
              <div className="mywork-handoff" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
                <div className="detail-label" style={{ marginBottom: 8 }}>
                  {role === 'qa' || (canAssignToDev && !canAssignToQa)
                    ? t('features.mywork.myWorkDefectsPanel.handoffToDevTitle')
                    : t('features.mywork.myWorkDefectsPanel.handoffToQaTitle')}
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">{t('features.mywork.myWorkDefectsPanel.assignToLabel')}</label>
                  {assignOptions.length > 0 ? (
                    <select
                      className="form-select"
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      disabled={submitting}
                    >
                      <option value="">{t('features.mywork.myWorkDefectsPanel.selectPlaceholder')}</option>
                      {assignOptions.map((m) => (
                        <option key={m.id} value={m.userName}>
                          {t('features.mywork.myWorkDefectsPanel.memberOption', { name: m.userName, role: m.role })}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="form-input"
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      placeholder={t('features.mywork.myWorkDefectsPanel.assigneePlaceholder')}
                      disabled={submitting}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {canAssignToDev ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={submitting}
                      onClick={() => void reassign('dev')}
                    >
                      {submitting ? t('features.mywork.myWorkDefectsPanel.submitting') : t('features.mywork.myWorkDefectsPanel.assignDev')}
                    </button>
                  ) : null}
                  {canAssignToQa ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={submitting}
                      onClick={() => void reassign('qa')}
                    >
                      {submitting ? t('features.mywork.myWorkDefectsPanel.submitting') : t('features.mywork.myWorkDefectsPanel.assignQa')}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!canOpenTesting ? (
              <div className="text-secondary" style={{ marginTop: 12, fontSize: 12 }}>
                {t('features.mywork.myWorkDefectsPanel.noTestingAccessHint')}
              </div>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
