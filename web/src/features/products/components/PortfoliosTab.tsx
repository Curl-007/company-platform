import { useEffect, useState } from 'react';
import {
  createPortfolio,
  deletePortfolio,
  fetchPortfolios,
  updatePortfolio,
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
import { ROADMAP_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Portfolio } from '../../../types';

export default function PortfoliosTab() {
  const { data, loading, error, reload } = useAsync<Portfolio[]>(fetchPortfolios, [], { cacheKey: 'portfolios:list' });
  const toast = useToast();
  const confirm = useConfirm();
  const canManagePortfolios = canOperate(getSessionUser(), 'products:manage');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Portfolio | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const portfolios = data ?? [];
  const selected = portfolios.find((item) => item.id === selectedId) ?? portfolios[0] ?? null;
  const totalProducts = portfolios.reduce((sum, item) => sum + item.productIds.length, 0);
  const roadmapCount = portfolios.reduce((sum, item) => sum + item.roadmap.length, 0);
  const activePortfolios = portfolios.filter((item) => !['released', 'done'].includes(item.status)).length;

  useEffect(() => {
    if (!portfolios.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !portfolios.some((item) => item.id === selectedId)) setSelectedId(portfolios[0].id);
  }, [portfolios, selectedId]);

  async function handleDelete(portfolio: Portfolio) {
    const approved = await confirm({ title: `删除产品组合“${portfolio.name}”？`, description: '仅当已解除该组合下的需求关联时才能删除。', confirmText: '删除产品组合', tone: 'danger' });
    if (!approved) return;
    setDeletingId(portfolio.id);
    try {
      await deletePortfolio(portfolio.id);
      toast.success('产品组合已删除。');
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

  if (!portfolios.length) {
    return (
      <>
        {canManagePortfolios ? <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建产品组合</button></div> : null}
        <ManagementEmptyState
          title="还没有产品组合"
          description="产品组合用于按业务目标统一管理产品范围和路线图。"
          steps={['新建产品组合并定义目标', '选择需要关联的产品', '维护组合路线图']}
        />
        {creating ? <StrategyForm kind="portfolio" onClose={() => setCreating(false)} onSubmit={async (input) => { await createPortfolio(input); toast.success('产品组合已创建。'); setCreating(false); reload(); }} /> : null}
      </>
    );
  }

  return (
    <>
      <div className="management-workbench management-workbench-flush">
        <Panel
          className="management-workbench-main"
          title="产品组合工作台"
          subtitle="把多个产品组织成业务组合，统一查看产品范围、组合状态和路线图节奏。"
          toolbar={canManagePortfolios ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建产品组合</button> : undefined}
          noPadding
        >
          <div className="management-workbench-metrics">
            <ManagementSummaryStrip
              items={[
                { label: '组合数', value: portfolios.length },
                { label: '组合内产品', value: totalProducts },
                { label: '推进中组合', value: activePortfolios },
                { label: '路线图事项', value: roadmapCount },
                { label: '平均产品数', value: portfolios.length ? Math.round(totalProducts / portfolios.length) : 0 },
              ]}
            />
          </div>

          <div className="management-grid">
            <div className="management-list-pane">
              <div className="management-list-pane-header">组合清单</div>
              <div className="management-list">
                {portfolios.map((item) => (
                  <ManagementListItem
                    key={item.id}
                    active={selected?.id === item.id}
                    title={item.name}
                    subtitle={`${item.owner} · ${item.productIds.length} 个产品`}
                    status={item.status}
                    statusLabel={labelOf(ROADMAP_STATUS_LABELS, item.status)}
                    meta={`${item.roadmap.length} 项`}
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
                      <StatusBadge status={selected.status} label={labelOf(ROADMAP_STATUS_LABELS, selected.status)} />
                      <span className="tag">{selected.id}</span>
                    </div>
                    <h2>{selected.name}</h2>
                    <p><strong>目标：</strong>{selected.objective || '尚未定义目标。'}</p>
                    <p>负责人 {selected.owner}，组合内包含 {selected.productIds.length} 个产品，用于按业务线或交付包统一规划。</p>
                  </div>
                  <div className="management-score-grid">
                    <div>
                      <span>产品数</span>
                      <strong>{selected.productIds.length}</strong>
                    </div>
                    <div>
                      <span>路线图</span>
                      <strong>{selected.roadmap.length}</strong>
                    </div>
                    <div>
                      <span>状态</span>
                      <strong>{labelOf(ROADMAP_STATUS_LABELS, selected.status)}</strong>
                    </div>
                  </div>
                </div>
                <div className="management-detail-grid">
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>组合产品</h3>
                        <p>当前组合覆盖的产品范围。</p>
                      </div>
                    </div>
                    <div className="management-chip-list">
                      {selected.productIds.length ? selected.productIds.map((id) => <span key={id}>{id}</span>) : <div className="product-empty-line">暂无产品。</div>}
                    </div>
                  </div>
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>组合路线图</h3>
                        <p>来自组合内产品的路线图聚合。</p>
                      </div>
                    </div>
                    {selected.roadmap.length ? (
                      <div className="product-roadmap-list">
                        {selected.roadmap.map((roadmap, index) => (
                          <div key={`${roadmap.title}-${index}`} className="product-roadmap-item">
                            <div className="product-roadmap-dot" />
                            <div>
                              <strong>{roadmap.title || roadmap.version || `规划项 ${index + 1}`}</strong>
                              <span>{roadmap.version || '未设置版本'}{roadmap.quarter ? ` · ${roadmap.quarter}` : ''}</span>
                            </div>
                            {roadmap.status ? <StatusBadge status={String(roadmap.status)} label={labelOf(ROADMAP_STATUS_LABELS, String(roadmap.status))} showDot={false} /> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="product-empty-line">当前组合还没有路线图条目。</div>
                    )}
                  </div>
                </div>
                {canManagePortfolios ? (
                  <div className="product-hero-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(selected)}>编辑产品组合</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected)} disabled={deletingId === selected.id}>
                      {deletingId === selected.id ? '删除中…' : '删除产品组合'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
      {creating && canManagePortfolios ? <StrategyForm kind="portfolio" onClose={() => setCreating(false)} onSubmit={async (input) => { await createPortfolio(input); toast.success('产品组合已创建。'); setCreating(false); reload(); }} /> : null}
      {editing && canManagePortfolios ? <StrategyForm kind="portfolio" initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updatePortfolio(editing.id, input); toast.success('产品组合已更新。'); setEditing(null); reload(); }} /> : null}
    </>
  );
}
