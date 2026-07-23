import { useState } from 'react';
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
      toast.success(decision === 'approve' ? '发布审批已通过' : '发布审批已驳回');

    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : '审批提交失败';
      setGovernanceError(message);
      toast.error(message);
    } finally {
      setSubmittingGovernance(false);
    }
  }

  async function submitRollback() {
    if (!releaseId) return;
    if (!rollbackReason.trim()) {
      setGovernanceError('请填写回滚原因');
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
      toast.success('回滚记录已创建');
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : '回滚登记失败';
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
        subtitle={`${record.kind === 'build' ? '构建记录' : '发布记录'} · ${record.ownerLabel}`}
        toolbar={<StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} />}
      >
        <div className="delivery-detail-grid">
          <DetailItem label="版本" value={record.version ? `v${record.version}` : '未设置'} />
          <DetailItem label="日期" value={formatDate(record.date)} />
          <DetailItem label={record.kind === 'build' ? '所属项目' : '所属产品'} value={record.ownerLabel} />
          <DetailItem label="就绪度" value={`${readiness}%`} />
        </div>
        <div className="delivery-detail-readiness">
          <div className="delivery-detail-readiness-head">
            <span>发布就绪度</span>
            <strong>{readiness}%</strong>
          </div>
          <ProgressBar percent={readiness} height={8} variant={gate?.ready ? 'success' : statusTone(record)} />
        </div>
        {canUseAi ? (
          <BusinessAdvicePanel
            targetType={record.kind}
            targetId={record.id}
            title={record.kind === 'build' ? 'AI 构建建议' : 'AI 发布建议'}
            description={record.kind === 'build'
              ? '基于后端构建门禁、关联需求、任务、测试和缺陷生成。'
              : '基于后端发布门禁、审批、回滚、发布报告和审计链路生成。'}
            buttonText={record.kind === 'build' ? 'AI 分析构建' : 'AI 分析发布'}
            question={record.kind === 'build'
              ? '请分析该构建是否适合进入发布，并指出阻断门禁、质量风险和下一步动作。'
              : '请分析该发布是否适合正式发布或复盘，并指出审批、回滚、质量和审计风险。'}
            draft={() => ({
              status: record.status,
              readiness,
              gateSummary: gate?.summary,
              failedGates: gate?.gates.filter((item) => !item.passed).map((item) => `${item.label}: ${item.message}`),
            })}
          />
        ) : null}
        <section className={`delivery-detail-gates ${gate?.ready ? 'ready' : 'blocked'}`}>
          <div className="delivery-detail-gates-head">
            <div>
              <h3>准入门禁</h3>
              <p>{gate?.summary ?? '暂未获取到后端预检结果。'}</p>
            </div>
            <StatusBadge status={gate?.ready ? 'passed' : 'blocked'} label={gate?.ready ? '可发布' : '需处理'} showDot={false} />
          </div>
          <div className="delivery-detail-gate-list">
            {gateLines.map((line, index) => (
              <GateLine
                key={line.id || `${line.label || 'gate'}-${index}`}
                label={line.label || '门禁项'}
                passed={Boolean(line.passed)}
                value={line.message || (line.passed ? '通过' : '未通过')}
              />
            ))}
            {!gate || gateLines.length === 0 ? (
              <GateLine label="门禁预检" passed={false} value="后端预检结果暂不可用" />
            ) : null}
          </div>
        </section>
        <div className="delivery-detail-sections">
          <section>
            <h3>关联需求</h3>
            <TagList items={linkedStories} empty="暂无关联需求" />
          </section>
          <section>
            <h3>关联缺陷</h3>
            <TagList items={linkedBugs} empty="暂无关联缺陷" />
          </section>
          <section className="wide">
            <h3>{record.kind === 'build' ? '构建备注' : '发布说明'}</h3>
            <p>{record.notes || '暂无说明。'}</p>
          </section>
        </div>
        {record.kind === 'release' ? (
          <section className="delivery-governance">
            <div className="delivery-governance-head">
              <div>
                <h3>发布治理</h3>
                <p>审批、驳回和回滚都会写入审计链路。</p>
              </div>
              <StatusBadge status={record.status} label={statusLabel(record.kind, record.status)} showDot={false} />
            </div>
            {governanceError ? <div className="form-error">{governanceError}</div> : null}
            <div className="delivery-governance-grid">
              <div className="delivery-governance-box">
                <h4>审批意见</h4>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                  placeholder="补充审批意见、风险提醒或驳回原因"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                {canManageDelivery ? (
                  <div className="delivery-governance-actions">
                    <button className="btn btn-primary btn-sm" disabled={submittingGovernance} onClick={() => void submitApproval('approve')}>通过审批</button>
                    <button className="btn btn-secondary btn-sm" disabled={submittingGovernance} onClick={() => void submitApproval('reject')}>驳回</button>
                  </div>
                ) : null}
                <RecordList
                  loading={approvalsState.loading}
                  empty="暂无审批记录"
                  records={(approvalsState.data ?? []).map((item) => ({
                    id: item.id,
                    title: item.decision === 'approve' ? '审批通过' : '审批驳回',
                    meta: `${item.approverName || '未知'} · ${formatDate(item.createdAt)}`,
                    body: item.comment || '未填写审批意见',
                  }))}
                />
              </div>
              <div className="delivery-governance-box">
                <h4>回滚登记</h4>
                <input
                  className="form-input"
                  value={rollbackReason}
                  onChange={(event) => setRollbackReason(event.target.value)}
                  placeholder="回滚原因"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={rollbackImpact}
                  onChange={(event) => setRollbackImpact(event.target.value)}
                  placeholder="影响范围"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={rollbackPlan}
                  onChange={(event) => setRollbackPlan(event.target.value)}
                  placeholder="回滚方案或验证计划"
                  disabled={!canManageDelivery || submittingGovernance}
                />
                {canManageDelivery ? (
                  <div className="delivery-governance-actions">
                    <button className="btn btn-danger btn-sm" disabled={submittingGovernance} onClick={() => void submitRollback()}>登记回滚</button>
                  </div>
                ) : null}
                <RecordList
                  loading={rollbacksState.loading}
                  empty="暂无回滚记录"
                  records={(rollbacksState.data ?? []).map((item) => ({
                    id: item.id,
                    title: item.reason,
                    meta: `${item.operatorName || '未知'} · ${formatDate(item.createdAt)}`,
                    body: [item.impact, item.plan].filter(Boolean).join(' / ') || '未填写影响范围或方案',
                  }))}
                />
              </div>
            </div>
          </section>
        ) : null}
        {record.kind === 'release' ? (
          <ReleaseReportSection report={reportState.data} loading={reportState.loading} error={reportState.error} />
        ) : null}
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
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(record)}>删除</button>
          </div>
        ) : (
          <div className="delivery-detail-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>关闭</button>
          </div>
        )}
      </Panel>
    </Overlay>
  );
}
