import { useEffect, useState } from 'react';
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
import type { Program } from '../../../types';

export default function ProgramsTab() {
  const { data, loading, error, reload } = useAsync<Program[]>(fetchPrograms, []);
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
    const approved = await confirm({ title: `删除项目集“${program.name}”？`, description: '仅当已解除所有项目关联时才能删除。', confirmText: '删除项目集', tone: 'danger' });
    if (!approved) return;
    setDeletingId(program.id);
    try {
      await deleteProgram(program.id);
      toast.success('项目集已删除。');
      reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除失败。');
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
        {canManagePrograms ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建项目集</button></div> : null}
        <ManagementEmptyState
          title="还没有项目集"
          description="项目集用于按共同目标管理多个项目的交付状态、进度和风险。"
          steps={['新建项目集并定义目标', '选择需要关联的项目', '在项目集视图跟踪整体交付风险']}
        />
        {creating ? <StrategyForm kind="program" onClose={() => setCreating(false)} onSubmit={async (input) => { await createProgram(input); toast.success('项目集已创建。'); setCreating(false); reload(); }} /> : null}
      </>
    );
  }

  return (
    <>
      <div className="management-workbench management-workbench-flush">
        <Panel
          className="management-workbench-main"
          title="项目集工作台"
          subtitle="按交付目标聚合多个项目，集中查看跨项目进度、健康度、风险和项目清单。"
          toolbar={canManagePrograms ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建项目集</button> : undefined}
          noPadding
        >
          <div className="management-workbench-metrics">
            <ManagementSummaryStrip
              items={[
                { label: '项目集', value: programs.length },
                { label: '关联项目', value: totalProjects },
                { label: '平均进度', value: `${avgProgress}%` },
                { label: '平均健康度', value: avgHealth },
                { label: '风险提示', value: riskCount },
              ]}
            />
          </div>

          <div className="management-grid">
            <div className="management-list-pane">
              <div className="management-list-pane-header">项目集清单</div>
              <div className="management-list">
                {programs.map((item) => (
                  <ManagementListItem
                    key={item.id}
                    active={selected?.id === item.id}
                    title={item.name}
                    subtitle={`${item.owner} · ${item.projectIds.length} 个项目`}
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
                    <p><strong>目标：</strong>{selected.objective || '尚未定义目标。'}</p>
                    <p>负责人 {selected.owner}，当前聚合 {selected.projectIds.length} 个项目。用于看项目群是否按共同目标推进。</p>
                  </div>
                  <div className="management-score-grid">
                    <div>
                      <span>平均进度</span>
                      <strong>{selected.progress}%</strong>
                    </div>
                    <div>
                      <span>健康度</span>
                      <strong>{selected.healthScore}</strong>
                    </div>
                    <div>
                      <span>风险数</span>
                      <strong>{selected.risks.length}</strong>
                    </div>
                  </div>
                </div>
                <div className="management-progress">
                  <span>项目集推进</span>
                  <div><i style={{ width: `${Math.min(100, Math.max(0, selected.progress))}%` }} /></div>
                </div>
                {canManagePrograms ? (
                  <div className="product-hero-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(selected)}>编辑项目集</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected)} disabled={deletingId === selected.id}>
                      {deletingId === selected.id ? '删除中…' : '删除项目集'}
                    </button>
                  </div>
                ) : null}
                <div className="management-detail-grid">
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>关联项目</h3>
                        <p>当前项目集下的项目范围。</p>
                      </div>
                    </div>
                    <div className="management-chip-list">
                      {selected.projectIds.length ? selected.projectIds.map((id) => <span key={id}>{id}</span>) : <div className="product-empty-line">暂无关联项目。</div>}
                    </div>
                  </div>
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>风险提示</h3>
                        <p>从项目风险聚合而来。</p>
                      </div>
                    </div>
                    {selected.risks.length ? (
                      <div className="management-risk-list">
                        {selected.risks.map((risk, index) => <div key={`${risk}-${index}`}>{risk}</div>)}
                      </div>
                    ) : (
                      <div className="product-empty-line">当前没有明显风险项。</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
      {creating && canManagePrograms ? <StrategyForm kind="program" onClose={() => setCreating(false)} onSubmit={async (input) => { await createProgram(input); toast.success('项目集已创建。'); setCreating(false); reload(); }} /> : null}
      {editing && canManagePrograms ? <StrategyForm kind="program" initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updateProgram(editing.id, input); toast.success('项目集已更新。'); setEditing(null); reload(); }} /> : null}
    </>
  );
}
