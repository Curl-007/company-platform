import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Circle, Clock, RefreshCw, X } from 'lucide-react';
import { fetchProjectFlow } from '../api';
import {
  bindProjectWorkflowTemplate,
  fetchProjectWorkflowBinding,
  fetchWorkflowTemplates,
} from '../../workflow/api';
import { useAsync } from '../../../hooks/useAsync';
import { getSessionUser } from '../../../services/auth';
import { canOperate } from '../../../constants/roles';
import PageState from '../../../components/common/PageState';
import type { GateState, WorkflowTemplate } from '../../../types';

const FIXED_ID = 'fixed-project-delivery-v1';
const LIGHT_ID = 'lightweight-delivery-v1';

const STATE_META: Record<GateState, { label: string; tone: string }> = {
  done: { label: 'features.projects.flowTab.stateDone', tone: 'success' },
  passed: { label: 'features.projects.flowTab.statePassed', tone: 'success' },
  in_progress: { label: 'features.projects.flowTab.stateInProgress', tone: 'info' },
  blocked: { label: 'features.projects.flowTab.stateBlocked', tone: 'risk' },
  pending: { label: 'features.projects.flowTab.statePending', tone: 'muted' },
};

function stateIcon(state: GateState) {
  switch (state) {
    case 'done':
    case 'passed':
      return <Check size={13} />;
    case 'in_progress':
      return <Clock size={13} />;
    case 'blocked':
      return <AlertTriangle size={13} />;
    default:
      return <Circle size={10} />;
  }
}

export default function FlowTab({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const sessionUser = getSessionUser();
  const canManage = canOperate(sessionUser, 'projects:update')
    || canOperate(sessionUser, 'admin:*')
    || sessionUser?.role === 'admin'
    || sessionUser?.role === 'pm';

  const { data, loading, error, reload } = useAsync(
    () => fetchProjectFlow(projectId),
    [projectId],
    { cacheKey: 'project:flow' },
  );
  const {
    data: binding,
    loading: bindingLoading,
    error: bindingError,
    reload: reloadBinding,
  } = useAsync(() => fetchProjectWorkflowBinding(projectId), [projectId], { cacheKey: 'project:workflow-binding' });
  const {
    data: catalog,
    loading: catalogLoading,
    error: catalogError,
    reload: reloadCatalog,
  } = useAsync(() => fetchWorkflowTemplates(false), [], { cacheKey: 'workflow:templates' });

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const templates = useMemo(
    () => (catalog?.templates || []).filter((item) => item.id === FIXED_ID || item.id === LIGHT_ID),
    [catalog],
  );
  const effectiveSelected = selectedTemplateId || binding?.templateId || data?.workflow?.templateId || FIXED_ID;
  const currentTemplateId = binding?.templateId || data?.workflow?.templateId || FIXED_ID;
  const selectedTemplate = templates.find((item) => item.id === effectiveSelected);
  const dirty = effectiveSelected !== currentTemplateId;

  const gates = data?.gates ?? [];
  const resolvedActive = activeStage
    ?? gates.find((gate) => gate.state === 'in_progress' || gate.state === 'blocked')?.stage
    ?? gates[0]?.stage
    ?? null;
  const activeGate = gates.find((gate) => gate.stage === resolvedActive) ?? null;

  async function handleBind() {
    if (!effectiveSelected || !dirty) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      await bindProjectWorkflowTemplate(projectId, effectiveSelected);
      setSaveOk(t('features.projects.flowTab.templateSwitched'));
      await Promise.all([reload(), reloadBinding(), reloadCatalog()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('features.projects.flowTab.switchFailed'));
    } finally {
      setSaving(false);
    }
  }

  function handleRefresh() {
    reload();
    reloadBinding();
    reloadCatalog();
  }

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  const passedGates = gates.filter((gate) => gate.state === 'passed' || gate.state === 'done').length;
  const blockedGates = gates.filter((gate) => gate.state === 'blocked').length;
  const failedChecks = activeGate?.checks.filter((check) => !check.passed) ?? [];
  const defectTotal = data.defectFunnel?.total ?? 0;
  const defectClosed = data.defectFunnel?.closed ?? 0;
  const defectRate = defectTotal > 0 ? Math.round((defectClosed / defectTotal) * 100) : 0;

  return (
    <div className="pd-flow-workbench">
      <div className="pd-flow-workbench-head">
        <div className="pd-flow-workbench-title">
          <strong>{data.workflow?.templateName || t('features.projects.flowTab.fixedDelivery')}</strong>
          <span>
            {t('features.projects.flowTab.stagesPassed', { passed: passedGates, total: gates.length })}
            {blockedGates > 0 ? t('features.projects.flowTab.blockedGates', { count: blockedGates }) : t('features.projects.flowTab.noBlocked')}
          </span>
        </div>
        <div className="pd-flow-workbench-actions">
          <div className="pd-flow-template-switch" role="group" aria-label={t('features.projects.flowTab.templateAria')}>
            {templates.map((template: WorkflowTemplate) => {
              const active = effectiveSelected === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  className={`pd-flow-template-chip ${active ? 'is-active' : ''}`}
                  disabled={!canManage || saving || bindingLoading || catalogLoading}
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setSaveOk(null);
                    setSaveError(null);
                  }}
                  title={template.description || template.name}
                >
                  {template.name}
                  <em>{template.stages?.length || 0}</em>
                </button>
              );
            })}
          </div>
          {canManage ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={saving || !dirty}
              onClick={() => void handleBind()}
            >
              {saving ? t('features.projects.flowTab.switching') : dirty ? t('features.projects.flowTab.applyTemplate') : t('features.projects.flowTab.applied')}
            </button>
          ) : null}
          <button className="btn btn-secondary btn-sm btn-with-icon" onClick={handleRefresh}>
            <RefreshCw size={14} aria-hidden="true" />
            {t('features.projects.flowTab.refresh')}
          </button>
        </div>
      </div>

      {(bindingError || catalogError || saveError || saveOk || (selectedTemplate && dirty)) ? (
        <div className="pd-flow-workbench-note">
          {bindingError || catalogError ? <span className="is-risk">{bindingError || catalogError}</span> : null}
          {saveError ? <span className="is-risk">{saveError}</span> : null}
          {saveOk ? <span className="is-success">{saveOk}</span> : null}
          {selectedTemplate && dirty ? (
            <span>{t('features.projects.flowTab.willSwitch', { name: selectedTemplate.name, desc: selectedTemplate.description || t('features.projects.flowTab.noDescription') })}</span>
          ) : null}
        </div>
      ) : null}

      <div className="pd-flow-stage-rail" role="tablist" aria-label={t('features.projects.flowTab.stagesAria')}>
        {gates.map((gate, index) => {
          const meta = STATE_META[gate.state];
          const active = gate.stage === resolvedActive;
          return (
            <button
              key={gate.stage}
              type="button"
              role="tab"
              aria-selected={active}
              className={`pd-flow-stage ${active ? 'is-active' : ''} tone-${meta.tone}`}
              onClick={() => setActiveStage(gate.stage)}
            >
              <span className="pd-flow-stage-index">{index + 1}</span>
              <span className="pd-flow-stage-icon">{stateIcon(gate.state)}</span>
              <span className="pd-flow-stage-copy">
                <strong>{gate.label}</strong>
                <em>{t(meta.label)}</em>
              </span>
            </button>
          );
        })}
      </div>

      <div className="pd-flow-main">
        <section className="pd-flow-checks-panel">
          {activeGate ? (
            <>
              <div className="pd-flow-checks-head">
                <div>
                  <strong>{t('features.projects.flowTab.stageChecks', { stage: activeGate.label })}</strong>
                  <span className={`pd-flow-checks-state tone-${STATE_META[activeGate.state].tone}`}>
                    {t(STATE_META[activeGate.state].label)}
                  </span>
                </div>
                <span>
                  {t('features.projects.flowTab.checksPassed', {
                    passed: activeGate.checks.filter((item) => item.passed).length,
                    total: activeGate.checks.length,
                  })}
                </span>
              </div>

              {activeGate.checks.length === 0 ? (
                <div className="pd-flow-empty">{t('features.projects.flowTab.noChecks')}</div>
              ) : (
                <div className="pd-flow-check-list">
                  {activeGate.checks.map((check) => (
                    <div
                      key={check.name}
                      className={`pd-flow-check ${check.passed ? 'is-pass' : 'is-fail'}`}
                    >
                      <span className="pd-flow-check-icon" aria-hidden="true">
                        {check.passed ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <div className="min-w-0">
                        <strong>{check.name}</strong>
                        {check.detail ? <p>{check.detail}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {failedChecks.length > 0 ? (
                <div className="pd-flow-block-hint">
                  <AlertTriangle size={14} aria-hidden="true" />
                  {t('features.projects.flowTab.failedChecksHint', { count: failedChecks.length })}
                </div>
              ) : (
                <div className="pd-flow-pass-hint">
                  <Check size={14} aria-hidden="true" />
                  {t('features.projects.flowTab.passedHint')}
                </div>
              )}
            </>
          ) : (
            <div className="pd-flow-empty">{t('features.projects.flowTab.noStages')}</div>
          )}
        </section>

        <aside className="pd-flow-side">
          <div className="pd-flow-side-card">
            <div className="pd-flow-side-title">{t('features.projects.flowTab.hoursTitle')}</div>
            <div className="pd-flow-hours">
              <div>
                <span>{t('features.projects.flowTab.estimated')}</span>
                <strong>{data.hours.estimated}<small>h</small></strong>
              </div>
              <div>
                <span>{t('features.projects.flowTab.consumed')}</span>
                <strong>{data.hours.consumed}<small>h</small></strong>
              </div>
              <div>
                <span>{t('features.projects.flowTab.remaining')}</span>
                <strong>{data.hours.remaining}<small>h</small></strong>
              </div>
            </div>
          </div>

          <div className="pd-flow-side-card">
            <div className="pd-flow-side-title">
              {t('features.projects.flowTab.defectFunnel')}
              <span>{defectRate}%</span>
            </div>
            <div className="pd-flow-defect-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(defectRate, defectTotal ? 4 : 0)}%` }} />
            </div>
            <div className="pd-flow-defect-meta">
              <span>{t('features.projects.flowTab.defectTotal', { count: defectTotal })}</span>
              <span>{t('features.projects.flowTab.defectClosed', { count: defectClosed })}</span>
              <span>{t('features.projects.flowTab.defectOpen', { count: Math.max(defectTotal - defectClosed, 0) })}</span>
            </div>
          </div>

          <div className="pd-flow-side-card">
            <div className="pd-flow-side-title">{t('features.projects.flowTab.stageOverview')}</div>
            <div className="pd-flow-mini-list">
              {gates.map((gate) => (
                <button
                  key={gate.stage}
                  type="button"
                  className={`pd-flow-mini-item ${gate.stage === resolvedActive ? 'is-active' : ''}`}
                  onClick={() => setActiveStage(gate.stage)}
                >
                  <span className={`pd-flow-mini-dot tone-${STATE_META[gate.state].tone}`} />
                  <strong>{gate.label}</strong>
                  <em>{t(STATE_META[gate.state].label)}</em>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
