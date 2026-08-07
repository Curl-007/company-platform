import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchFlowOverview } from '../../projects/api';
import { fetchWorkflowTemplates } from '../../workflow/api';
import { useAsync } from '../../../hooks/useAsync';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import type { FlowOverviewItem, GateState, WorkflowTemplate } from '../../../types';
import ProjectFlowDetail from './ProjectFlowDetail';

const STATE_DOT: Record<GateState, string> = {
  done: 'var(--color-success, #16a34a)',
  passed: 'var(--color-success, #16a34a)',
  in_progress: 'var(--color-info, #2563eb)',
  blocked: 'var(--color-risk, #dc2626)',
  pending: 'var(--color-border, #cbd5e1)',
};

type SignalTone = '' | 'is-success' | 'is-warn' | 'is-risk' | 'is-info';

interface FlowSignal {
  label: string;
  value: number;
  caption: string;
  tone: SignalTone;
}

export default function FlowView() {
  const { t } = useTranslation();
  const { data: overview, loading, error, reload } = useAsync<FlowOverviewItem[]>(
    fetchFlowOverview,
    [],
    { cacheKey: 'flow:overview' },
  );
  const {
    data: templateCatalog,
    loading: templateLoading,
    error: templateError,
    reload: reloadTemplates,
  } = useAsync(() => fetchWorkflowTemplates(false), [], { cacheKey: 'workflow:templates' });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const templates = templateCatalog?.templates ?? [];
  const activeTemplate = useMemo(() => {
    if (!templates.length) return null;
    if (selectedTemplateId) return templates.find((item) => item.id === selectedTemplateId) || templates[0];
    return templates[0];
  }, [templates, selectedTemplateId]);

  const stageOrder = activeTemplate?.stages?.map((stage) => stage.id) ?? [];
  const stageLabels = useMemo(() => {
    const map: Record<string, string> = {};
    (activeTemplate?.stages || []).forEach((stage) => {
      map[stage.id] = stage.label || stage.id;
    });
    return map;
  }, [activeTemplate]);

  const matrixStyle = {
    ['--flow-stage-count' as string]: String(Math.max(stageOrder.length, 1)),
  };

  // Aggregate gate states across all projects for the KPI signal strip.
  // done/passed both count as "已通过"; in_progress / blocked / pending map 1:1.
  const signals = useMemo<FlowSignal[]>(() => {
    if (!overview) return [];
    const gates = overview.flatMap((item) => item.gates);
    const passed = gates.filter((gate) => gate.state === 'done' || gate.state === 'passed').length;
    const inProgress = gates.filter((gate) => gate.state === 'in_progress').length;
    const blocked = gates.filter((gate) => gate.state === 'blocked').length;
    const pending = gates.filter((gate) => gate.state === 'pending').length;
    return [
      { label: t('features.flow.flowView.signalProjects'), value: overview.length, caption: t('features.flow.flowView.signalProjectsCaption'), tone: '' },
      { label: t('features.flow.flowView.signalPassed'), value: passed, caption: 'done / passed', tone: 'is-success' },
      { label: t('features.flow.flowView.signalInProgress'), value: inProgress, caption: t('features.flow.flowView.signalInProgressCaption'), tone: 'is-info' },
      { label: t('features.flow.flowView.signalBlocked'), value: blocked, caption: blocked > 0 ? t('features.flow.flowView.signalBlockedCaptionNeed') : t('features.flow.flowView.signalBlockedCaptionNone'), tone: blocked > 0 ? 'is-risk' : '' },
      { label: t('features.flow.flowView.signalPending'), value: pending, caption: t('features.flow.flowView.signalPendingCaption'), tone: pending > 0 ? 'is-warn' : '' },
    ];
  }, [overview, t]);

  if (loading || error || !overview) {
    return (
      <div className="flow-workbench flow-page">
        <PageState loading={loading} error={error} isEmpty={!loading && !error && !overview} onRetry={reload} />
      </div>
    );
  }

  const handleRefresh = () => { reload(); reloadTemplates(); };

  return (
    <div className="flow-workbench flow-page">
      <div className="flow-toolbar">
        <p className="flow-toolbar-summary">
          {t('features.flow.flowView.toolbarSummary', { count: overview.length })}
        </p>
        <div className="flow-toolbar-actions">
          <button className="btn btn-secondary btn-sm" onClick={handleRefresh}>
            {t('features.flow.flowView.refresh')}
          </button>
        </div>
      </div>

      <section className="flow-signal-strip" aria-label={t('features.flow.flowView.signalAria')}>
        {signals.map((item) => (
          <div key={item.label} className={`flow-signal ${item.tone}`.trim()}>
            <span className="flow-signal-label">{item.label}</span>
            <strong>{item.value}</strong>
            <em>{item.caption}</em>
          </div>
        ))}
      </section>

      <Panel
        title={t('features.flow.flowView.templatesTitle')}
        subtitle={t('features.flow.flowView.templatesSubtitle')}
        className="flow-template-panel"
      >
        {templateLoading && <p className="text-secondary">{t('features.flow.flowView.loadingTemplates')}</p>}
        {templateError && <p className="form-error">{templateError}</p>}
        {!templateLoading && !templateError && (
          <>
            <div className="flow-template-grid">
              {templates.map((template: WorkflowTemplate) => {
                const active = activeTemplate?.id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className={`flow-template-card ${active ? 'is-active' : ''}`}
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <div className="flow-template-card-head">
                      <strong>{template.name}</strong>
                      <span className="flow-template-badge">{t('features.flow.flowView.stageCount', { count: template.stages?.length || 0 })}</span>
                    </div>
                    <p>{template.description || t('features.flow.flowView.builtinTemplateDesc')}</p>
                  </button>
                );
              })}
            </div>

            {activeTemplate ? (
              <div className="flow-template-preview">
                <div className="flow-stepper">
                  {activeTemplate.stages.map((stage, index) => (
                    <div key={stage.id} className="flow-step">
                      <span className="flow-step-node">{index + 1}</span>
                      <span className="flow-step-label" title={stage.description}>{stage.label}</span>
                      {index < activeTemplate.stages.length - 1 ? <span className="flow-step-connector filled" /> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <Panel
        title={t('features.flow.flowView.matrixTitle')}
        subtitle={t('features.flow.flowView.matrixSubtitle')}
        className="flow-matrix-panel"
      >
        <div className="flow-legend-bar">
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.passed }} />{t('features.flow.flowView.legendPassed')}</span>
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.in_progress }} />{t('features.flow.flowView.legendInProgress')}</span>
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.blocked }} />{t('features.flow.flowView.legendBlocked')}</span>
          <span className="flow-legend-item"><span className="flow-legend-dot" style={{ background: STATE_DOT.pending }} />{t('features.flow.flowView.legendPending')}</span>
        </div>
        <div className="flow-matrix" style={matrixStyle}>
          <div className="flow-matrix-row flow-matrix-header">
            <div className="flow-matrix-cell flow-matrix-project">{t('features.flow.flowView.colProject')}</div>
            {stageOrder.map((stage) => (
              <div key={stage} className="flow-matrix-cell flow-matrix-stage-head">{stageLabels[stage] || stage}</div>
            ))}
            <div className="flow-matrix-cell flow-matrix-health">{t('features.flow.flowView.colHealth')}</div>
          </div>
          {overview.map((item) => {
            const isOpen = selectedId === item.projectId;
            return (
              <div key={item.projectId}>
                <div
                  className={`flow-matrix-row ${isOpen ? 'flow-matrix-row-active' : ''}`}
                  onClick={() => setSelectedId(isOpen ? null : item.projectId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedId(isOpen ? null : item.projectId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flow-matrix-cell flow-matrix-project font-medium">
                    {item.projectName}
                    {item.workflow?.templateName ? (
                      <div className="flow-matrix-template-tag">{item.workflow.templateName}</div>
                    ) : null}
                  </div>
                  {stageOrder.map((stage) => {
                    const gate = item.gates.find((entry) => entry.stage === stage);
                    return (
                      <div key={stage} className="flow-matrix-cell flow-matrix-stage">
                        <span
                          className="flow-matrix-dot"
                          style={{ background: gate ? STATE_DOT[gate.state] : STATE_DOT.pending }}
                          title={gate ? `${gate.label || stage}: ${gate.state}` : stage}
                        />
                      </div>
                    );
                  })}
                  <div className="flow-matrix-cell flow-matrix-health text-mono">{item.healthScore}</div>
                </div>
                {isOpen ? <ProjectFlowDetail projectId={item.projectId} /> : null}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
