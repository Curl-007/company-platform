import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createProgram,
  deleteProgram,
  fetchPrograms,
  updateProgram,
} from '../api';
import ManagementEmptyState from './ManagementEmptyState';
import ManagementListItem from './ManagementListItem';
import ManagementSummaryStrip from './ManagementSummaryStrip';
import StrategyForm from './StrategyForm';
import { fetchProjects } from '../../projects/api';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
import { PROJECT_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Program, Project } from '../../../types';

export default function ProgramsTab() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync<Program[]>(fetchPrograms, [], { cacheKey: 'programs:list' });
  const projects = useAsync<Project[]>(fetchProjects, [], { cacheKey: 'projects:list' });
  const projectNameById = useMemo(
    () => new Map((projects.data ?? []).map((project) => [project.id, project.name])),
    [projects.data],
  );
  const toast = useToast();
  const confirm = useConfirm();
  const canManagePrograms = canOperate(getSessionUser(), 'projects:manage');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const programs = data ?? [];
  const selected = programs.find((item) => item.id === selectedId) ?? programs[0] ?? null;
  const totalProjects = programs.reduce((sum, item) => sum + item.projectIds.length, 0);
  const avgProgress = programs.length ? Math.round(programs.reduce((sum, item) => sum + item.progress, 0) / programs.length) : 0;
  const avgHealth = programs.length ? Math.round(programs.reduce((sum, item) => sum + item.healthScore, 0) / programs.length) : 0;
  const riskCount = programs.reduce((sum, item) => sum + item.risks.length, 0);

  useEffect(() => {
    if (!programs.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !programs.some((item) => item.id === selectedId)) setSelectedId(programs[0].id);
  }, [programs, selectedId]);

  async function handleDelete(program: Program) {
    const approved = await confirm({ title: t('features.products.programsTab.deleteConfirm', { name: program.name }), description: t('features.products.programsTab.deleteConfirmDesc'), confirmText: t('features.products.programsTab.delete'), tone: 'danger' });
    if (!approved) return;
    setDeletingId(program.id);
    try {
      await deleteProgram(program.id);
      toast.success(t('features.products.programsTab.deleted'));
      reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.products.programsTab.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  if (!programs.length) {
    return (
      <>
        {canManagePrograms ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.products.programsTab.new')}</button></div> : null}
        <ManagementEmptyState
          title={t('features.products.programsTab.emptyTitle')}
          description={t('features.products.programsTab.emptyDescription')}
          steps={[t('features.products.programsTab.step1'), t('features.products.programsTab.step2'), t('features.products.programsTab.step3')]}
        />
        {creating ? <StrategyForm kind="program" onClose={() => setCreating(false)} onSubmit={async (input) => { await createProgram(input); toast.success(t('features.products.programsTab.created')); setCreating(false); reload(); }} /> : null}
      </>
    );
  }

  return (
    <>
      <div className="management-workbench management-workbench-flush">
        <Panel
          className="management-workbench-main"
          title={t('features.products.programsTab.workbenchTitle')}
          subtitle={t('features.products.programsTab.workbenchSubtitle')}
          toolbar={canManagePrograms ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.products.programsTab.new')}</button> : undefined}
          noPadding
        >
          <div className="management-workbench-metrics">
            <ManagementSummaryStrip
              items={[
                { label: t('features.products.programsTab.summaryPrograms'), value: programs.length },
                { label: t('features.products.programsTab.summaryProjects'), value: totalProjects },
                { label: t('features.products.programsTab.summaryAvgProgress'), value: `${avgProgress}%` },
                { label: t('features.products.programsTab.summaryAvgHealth'), value: avgHealth },
                { label: t('features.products.programsTab.summaryRisks'), value: riskCount },
              ]}
            />
          </div>

          <div className="management-grid">
            <div className="management-list-pane">
              <div className="management-list-pane-header">{t('features.products.programsTab.listTitle')}</div>
              <div className="management-list">
                {programs.map((item) => (
                  <ManagementListItem
                    key={item.id}
                    active={selected?.id === item.id}
                    title={item.name}
                    subtitle={t('features.products.programsTab.listSubtitle', { owner: item.owner, count: item.projectIds.length })}
                    status={item.status}
                    statusLabel={labelOf(PROJECT_STATUS_LABELS, item.status)}
                    meta={`${item.progress}%`}
                    onClick={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
            </div>

            {selected ? (
              <div className="management-detail-pane">
                <div className="management-hero">
                  <div>
                    <div className="product-hero-top">
                      <StatusBadge status={selected.status} label={labelOf(PROJECT_STATUS_LABELS, selected.status)} />
                      <span className="tag">{selected.id}</span>
                    </div>
                    <h2>{selected.name}</h2>
                    <p><strong>{t('features.products.programsTab.objective')}</strong>{selected.objective || t('features.products.programsTab.noObjective')}</p>
                    <p>{t('features.products.programsTab.heroDesc', { owner: selected.owner, count: selected.projectIds.length })}</p>
                  </div>
                  <div className="management-score-grid">
                    <div>
                      <span>{t('features.products.programsTab.avgProgress')}</span>
                      <strong>{selected.progress}%</strong>
                    </div>
                    <div>
                      <span>{t('features.products.programsTab.health')}</span>
                      <strong>{selected.healthScore}</strong>
                    </div>
                    <div>
                      <span>{t('features.products.programsTab.riskCount')}</span>
                      <strong>{selected.risks.length}</strong>
                    </div>
                  </div>
                </div>
                <div className="management-progress">
                  <span>{t('features.products.programsTab.progressLabel')}</span>
                  <div><i style={{ width: `${Math.min(100, Math.max(0, selected.progress))}%` }} /></div>
                </div>
                {canManagePrograms ? (
                  <div className="product-hero-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(selected)}>{t('features.products.programsTab.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected)} disabled={deletingId === selected.id}>
                      {deletingId === selected.id ? t('features.products.programsTab.deleting') : t('features.products.programsTab.delete')}
                    </button>
                  </div>
                ) : null}
                <div className="management-detail-grid">
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.programsTab.linkedProjects')}</h3>
                        <p>{t('features.products.programsTab.linkedProjectsDesc')}</p>
                      </div>
                    </div>
                    <div className="management-chip-list">
                      {selected.projectIds.length ? selected.projectIds.map((id) => (
                        <span key={id} title={projectNameById.has(id) ? t('features.products.programsTab.idPrefix', { id }) : undefined}>{projectNameById.get(id) ?? id}</span>
                      )) : <div className="product-empty-line">{t('features.products.programsTab.noProjects')}</div>}
                    </div>
                  </div>
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.programsTab.risks')}</h3>
                        <p>{t('features.products.programsTab.risksDesc')}</p>
                      </div>
                    </div>
                    {selected.risks.length ? (
                      <div className="management-risk-list">
                        {selected.risks.map((risk, index) => <div key={`${risk}-${index}`}>{risk}</div>)}
                      </div>
                    ) : (
                      <div className="product-empty-line">{t('features.products.programsTab.noRisks')}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
      {creating && canManagePrograms ? <StrategyForm kind="program" onClose={() => setCreating(false)} onSubmit={async (input) => { await createProgram(input); toast.success(t('features.products.programsTab.created')); setCreating(false); reload(); }} /> : null}
      {editing && canManagePrograms ? <StrategyForm kind="program" initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updateProgram(editing.id, input); toast.success(t('features.products.programsTab.updated')); setEditing(null); reload(); }} /> : null}
    </>
  );
}
