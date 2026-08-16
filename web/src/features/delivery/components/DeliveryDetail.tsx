import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createReleaseApproval,
  createRollbackRecord,
  fetchReleaseApprovals,
  fetchReleaseReport,
  fetchRollbackRecords,
} from '../api';
import {
  formatDate,
  releaseReadiness,
  statusLabel,
  statusOptions,
  statusTone,
  type DeliveryRecord,
} from '../deliveryPageModel';
import { GateLine } from './GateBoard';
import { DetailItem, RecordList, ReleaseReportSection, TagList } from './DeliveryDetailParts';
import { ApiError } from '../../../services/api';
import { useAsync } from '../../../hooks/useAsync';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import StatusBadge from '../../../components/common/StatusBadge';
import BusinessAdvicePanel from '../../../components/common/BusinessAdvicePanel';
import SortableSectionLayout, { SortableSection } from '../../../components/common/SortableSectionLayout';
import { useToast } from '../../../components/common/Toast';
import type { DeliveryGateResult, ReleaseApproval, ReleaseReport, RollbackRecord } from '../../../types';

export default function DeliveryDetail({
  record,
  gate,
  statusError,
  onClose,
  onStatus,
  onDelete,
  onChanged,
  canManageDelivery,
  canUseAi,
}: {
  record: DeliveryRecord;
  gate?: DeliveryGateResult;
  statusError?: string | null;
  onClose: () => void;
  onStatus: (record: DeliveryRecord, status: string) => void;
  onDelete: (record: DeliveryRecord) => void;
  onChanged: () => void;
  canManageDelivery: boolean;
  canUseAi: boolean;
}) {
  const { t } = useTranslation();
  const readiness = Number(gate?.score ?? releaseReadiness(record)) || 0;
  const toast = useToast();
  const releaseId = record.kind === 'release' ? record.id : '';
  const gateLines = Array.isArray(gate?.gates) ? gate.gates : [];
  const linkedStories = Array.isArray(record.linkedStories) ? record.linkedStories : [];
  const linkedBugs = Array.isArray(record.linkedBugs) ? record.linkedBugs : [];
  const approvalsState = useAsync<ReleaseApproval[]>(
    () => (releaseId ? fetchReleaseApprovals(releaseId) : Promise.resolve([])),
    [releaseId],
    { cacheKey: 'delivery:release-approvals' },
  );
  const rollbacksState = useAsync<RollbackRecord[]>(
    () => (releaseId ? fetchRollbackRecords(releaseId) : Promise.resolve([])),
    [releaseId],
    { cacheKey: 'delivery:rollback-records' },
  );
  const reportState = useAsync<ReleaseReport | null>(
    () => (releaseId ? fetchReleaseReport(releaseId).catch(() => null) : Promise.resolve(null)),
    [releaseId],
    { cacheKey: 'delivery:release-report' },
  );
  const [approvalComment, setApprovalComment] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackImpact, setRollbackImpact] = useState('');
  const [rollbackPlan, setRollbackPlan] = useState('');
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [submittingGovernance, setSubmittingGovernance] = useState(false);

  async function submitApproval(decision: 'approve' | 'reject') {
    if (!releaseId) return;
    setSubmittingGovernance(true);
    setGovernanceError(null);
    try {
      await createReleaseApproval(releaseId, { decision, comment: approvalComment.trim() || undefined });
      setApprovalComment('');
      approvalsState.reload();
      reportState.reload();
      onChanged();
      toast.success(decision === 'approve' ? t('features.delivery.deliveryDetail.approvalPassed') : t('features.delivery.deliveryDetail.approvalRejected'));

    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : t('features.delivery.deliveryDetail.approvalSubmitFailed');
      setGovernanceError(message);
      toast.error(message);
    } finally {
      setSubmittingGovernance(false);
    }
  }

  async function submitRollback() {
    if (!releaseId) return;
    if (!rollbackReason.trim()) {
      setGovernanceError(t('features.delivery.deliveryDetail.rollbackReasonRequired'));
      return;
    }
    setSubmittingGovernance(true);
    setGovernanceError(null);
    try {
      await createRollbackRecord(releaseId, {
        reason: rollbackReason.trim(),
        impact: rollbackImpact.trim() || undefined,
        plan: rollbackPlan.trim() || undefined,
      });
      setRollbackReason('');
      setRollbackImpact('');
      setRollbackPlan('');
      rollbacksState.reload();
      reportState.reload();
      onChanged();
      toast.success(t('features.delivery.deliveryDetail.rollbackCreated'));
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : t('features.delivery.deliveryDetail.rollbackSubmitFailed');
      setGovernanceError(message);
      toast.error(message);
    } finally {
      setSubmittingGovernance(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={860}>
      <Panel
        className="delivery-detail-panel"
        title={record.title}
        subtitle={`${record.kind === 'build' ? t('features.delivery.deliveryDetail.buildRecord') : t('features.delivery.deliveryDetail.releaseRecord')} · ${record.ownerLabel}`}
        toolbar={<StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} />}
      >
        <SortableSectionLayout surface={`delivery.${record.kind}-detail`} className="delivery-detail-sortable">
          <SortableSection id="metrics" label={t('features.delivery.deliveryDetail.versionLabel')} className="wide">
            <div className="delivery-detail-grid">
              <DetailItem label={t('features.delivery.deliveryDetail.versionLabel')} value={record.version ? `v${record.version}` : t('enums.unset')} />
              <DetailItem label={t('features.delivery.deliveryDetail.dateLabel')} value={formatDate(record.date)} />
              <DetailItem label={record.kind === 'build' ? t('features.delivery.deliveryDetail.projectLabel') : t('features.delivery.deliveryDetail.productLabel')} value={record.ownerLabel} />
              <DetailItem label={t('features.delivery.deliveryDetail.readinessLabel')} value={`${readiness}%`} />
            </div>
          </SortableSection>
          <SortableSection id="readiness" label={t('features.delivery.deliveryDetail.readinessTitle')} className="wide">
            <div className="delivery-detail-readiness">
              <div className="delivery-detail-readiness-head">
                <span>{t('features.delivery.deliveryDetail.readinessTitle')}</span>
                <strong>{readiness}%</strong>
              </div>
              <ProgressBar percent={readiness} height={8} variant={gate?.ready ? 'success' : statusTone(record)} />
            </div>
          </SortableSection>
          {canUseAi ? (
            <SortableSection id="ai-advice" label={record.kind === 'build' ? t('features.delivery.deliveryDetail.aiBuildAdvice') : t('features.delivery.deliveryDetail.aiReleaseAdvice')} className="wide">
              <BusinessAdvicePanel
                targetType={record.kind}
                targetId={record.id}
                title={record.kind === 'build' ? t('features.delivery.deliveryDetail.aiBuildAdvice') : t('features.delivery.deliveryDetail.aiReleaseAdvice')}
                description={record.kind === 'build'
                  ? t('features.delivery.deliveryDetail.aiBuildDesc')
                  : t('features.delivery.deliveryDetail.aiReleaseDesc')}
                buttonText={record.kind === 'build' ? t('features.delivery.deliveryDetail.aiAnalyzeBuild') : t('features.delivery.deliveryDetail.aiAnalyzeRelease')}
                question={record.kind === 'build'
                  ? t('features.delivery.deliveryDetail.aiBuildQuestion')
                  : t('features.delivery.deliveryDetail.aiReleaseQuestion')}
                draft={() => ({
                  status: record.status,
                  readiness,
                  gateSummary: gate?.summary,
                  failedGates: gate?.gates.filter((item) => !item.passed).map((item) => `${item.label}: ${item.message}`),
                })}
              />
            </SortableSection>
          ) : null}
          <SortableSection id="gates" label={t('features.delivery.deliveryDetail.gatesTitle')} className="wide">
            <section className={`delivery-detail-gates ${gate?.ready ? 'ready' : 'blocked'}`}>
              <div className="delivery-detail-gates-head">
                <div>
                  <h3>{t('features.delivery.deliveryDetail.gatesTitle')}</h3>
                  <p>{gate?.summary ?? t('features.delivery.deliveryDetail.noGateSummary')}</p>
                </div>
                <StatusBadge status={gate?.ready ? 'passed' : 'blocked'} label={gate?.ready ? t('features.delivery.deliveryDetail.releasable') : t('features.delivery.deliveryDetail.needsAction')} showDot={false} />
              </div>
              <div className="delivery-detail-gate-list">
                {gateLines.map((line, index) => (
                  <GateLine
                    key={line.id || `${line.label || 'gate'}-${index}`}
                    label={line.label || t('features.delivery.deliveryDetail.gateItem')}
                    passed={Boolean(line.passed)}
                    value={line.message || (line.passed ? t('features.delivery.deliveryDetail.passed') : t('features.delivery.deliveryDetail.notPassed'))}
                  />
                ))}
                {!gate || gateLines.length === 0 ? (
                  <GateLine label={t('features.delivery.deliveryDetail.gatePrecheck')} passed={false} value={t('features.delivery.deliveryDetail.precheckUnavailable')} />
                ) : null}
              </div>
            </section>
          </SortableSection>
          <SortableSection id="linked-stories" label={t('features.delivery.deliveryDetail.linkedStoriesTitle')}>
            <section className="delivery-detail-related-card">
              <h3>{t('features.delivery.deliveryDetail.linkedStoriesTitle')}</h3>
              <TagList items={linkedStories} empty={t('features.delivery.deliveryDetail.noLinkedStories')} />
            </section>
          </SortableSection>
          <SortableSection id="linked-bugs" label={t('features.delivery.deliveryDetail.linkedBugsTitle')}>
            <section className="delivery-detail-related-card">
              <h3>{t('features.delivery.deliveryDetail.linkedBugsTitle')}</h3>
              <TagList items={linkedBugs} empty={t('features.delivery.deliveryDetail.noLinkedBugs')} />
            </section>
          </SortableSection>
          <SortableSection id="notes" label={record.kind === 'build' ? t('features.delivery.deliveryDetail.buildNotes') : t('features.delivery.deliveryDetail.releaseNotes')} className="wide">
            <section className="delivery-detail-related-card">
              <h3>{record.kind === 'build' ? t('features.delivery.deliveryDetail.buildNotes') : t('features.delivery.deliveryDetail.releaseNotes')}</h3>
              <p>{record.notes || t('features.delivery.deliveryDetail.noNotes')}</p>
            </section>
          </SortableSection>
          {record.kind === 'release' ? (
            <SortableSection id="governance" label={t('features.delivery.deliveryDetail.governanceTitle')} className="wide">
              <section className="delivery-governance">
                <div className="delivery-governance-head">
                  <div>
                    <h3>{t('features.delivery.deliveryDetail.governanceTitle')}</h3>
                    <p>{t('features.delivery.deliveryDetail.governanceDesc')}</p>
                  </div>
                  <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
                </div>
                {governanceError ? <div className="form-error">{governanceError}</div> : null}
                <div className="delivery-governance-grid">
                  <div className="delivery-governance-box">
                    <h4>{t('features.delivery.deliveryDetail.approvalTitle')}</h4>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={approvalComment}
                      onChange={(event) => setApprovalComment(event.target.value)}
                      placeholder={t('features.delivery.deliveryDetail.approvalPlaceholder')}
                      disabled={!canManageDelivery || submittingGovernance}
                    />
                    {canManageDelivery ? (
                      <div className="delivery-governance-actions">
                        <button className="btn btn-primary btn-sm" disabled={submittingGovernance} onClick={() => void submitApproval('approve')}>{t('features.delivery.deliveryDetail.approve')}</button>
                        <button className="btn btn-secondary btn-sm" disabled={submittingGovernance} onClick={() => void submitApproval('reject')}>{t('features.delivery.deliveryDetail.reject')}</button>
                      </div>
                    ) : null}
                    <RecordList
                      loading={approvalsState.loading}
                      empty={t('features.delivery.deliveryDetail.noApprovals')}
                      records={(approvalsState.data ?? []).map((item) => ({
                        id: item.id,
                        title: item.decision === 'approve' ? t('features.delivery.deliveryDetail.approved') : t('features.delivery.deliveryDetail.rejected'),
                        meta: `${item.approverName || t('features.delivery.deliveryDetail.unknown')} · ${formatDate(item.createdAt)}`,
                        body: item.comment || t('features.delivery.deliveryDetail.noApprovalComment'),
                      }))}
                    />
                  </div>
                  <div className="delivery-governance-box">
                    <h4>{t('features.delivery.deliveryDetail.rollbackTitle')}</h4>
                    <input
                      className="form-input"
                      value={rollbackReason}
                      onChange={(event) => setRollbackReason(event.target.value)}
                      placeholder={t('features.delivery.deliveryDetail.rollbackReasonPlaceholder')}
                      disabled={!canManageDelivery || submittingGovernance}
                    />
                    <textarea
                      className="form-textarea"
                      rows={2}
                      value={rollbackImpact}
                      onChange={(event) => setRollbackImpact(event.target.value)}
                      placeholder={t('features.delivery.deliveryDetail.impactPlaceholder')}
                      disabled={!canManageDelivery || submittingGovernance}
                    />
                    <textarea
                      className="form-textarea"
                      rows={2}
                      value={rollbackPlan}
                      onChange={(event) => setRollbackPlan(event.target.value)}
                      placeholder={t('features.delivery.deliveryDetail.planPlaceholder')}
                      disabled={!canManageDelivery || submittingGovernance}
                    />
                    {canManageDelivery ? (
                      <div className="delivery-governance-actions">
                        <button className="btn btn-danger btn-sm" disabled={submittingGovernance} onClick={() => void submitRollback()}>{t('features.delivery.deliveryDetail.registerRollback')}</button>
                      </div>
                    ) : null}
                    <RecordList
                      loading={rollbacksState.loading}
                      empty={t('features.delivery.deliveryDetail.noRollbacks')}
                      records={(rollbacksState.data ?? []).map((item) => ({
                        id: item.id,
                        title: item.reason,
                        meta: `${item.operatorName || t('features.delivery.deliveryDetail.unknown')} · ${formatDate(item.createdAt)}`,
                        body: [item.impact, item.plan].filter(Boolean).join(' / ') || t('features.delivery.deliveryDetail.noImpactOrPlan'),
                      }))}
                    />
                  </div>
                </div>
              </section>
            </SortableSection>
          ) : null}
          {record.kind === 'release' && (reportState.loading || reportState.error || reportState.data) ? (
            <SortableSection id="release-report" label={t('features.delivery.deliveryDetailParts.reportTitle')} className="wide">
              <ReleaseReportSection report={reportState.data} loading={reportState.loading} error={reportState.error} />
            </SortableSection>
          ) : null}
        </SortableSectionLayout>
        {statusError ? <div className="form-error">{statusError}</div> : null}
        {canManageDelivery ? (
          <div className="delivery-detail-actions">
            <select
              className="form-select"
              value={statusOptions(record.kind).includes(record.status) ? record.status : statusOptions(record.kind)[0]}
              onChange={(event) => {
                const next = event.target.value;
                if (!next || next === record.status) return;
                onStatus(record, next);
              }}
            >
              {statusOptions(record.kind).map((status) => (
                <option value={status} key={status}>{statusLabel(record.kind, status)}</option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{t('common.close')}</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(record)}>{t('common.delete')}</button>
          </div>
        ) : (
          <div className="delivery-detail-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{t('common.close')}</button>
          </div>
        )}
      </Panel>
    </Overlay>
  );
}
