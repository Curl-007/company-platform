import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createPortfolio,
  deletePortfolio,
  fetchPortfolios,
  fetchProducts,
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
import SortableSectionLayout, { SortableSection } from '../../../components/common/SortableSectionLayout';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
import { ROADMAP_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { Portfolio, Product } from '../../../types';

export default function PortfoliosTab() {
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAsync<Portfolio[]>(fetchPortfolios, [], { cacheKey: 'portfolios:list' });
  const products = useAsync<Product[]>(fetchProducts, [], { cacheKey: 'products:list' });
  const productNameById = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product.name])),
    [products.data],
  );
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
    const approved = await confirm({ title: t('features.products.portfoliosTab.deleteConfirm', { name: portfolio.name }), description: t('features.products.portfoliosTab.deleteConfirmDesc'), confirmText: t('features.products.portfoliosTab.delete'), tone: 'danger' });
    if (!approved) return;
    setDeletingId(portfolio.id);
    try {
      await deletePortfolio(portfolio.id);
      toast.success(t('features.products.portfoliosTab.deleted'));
      reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('features.products.portfoliosTab.deleteFailed'));
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
        {canManagePortfolios ? <div className="management-list-toolbar"><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.products.portfoliosTab.new')}</button></div> : null}
        <ManagementEmptyState
          title={t('features.products.portfoliosTab.emptyTitle')}
          description={t('features.products.portfoliosTab.emptyDescription')}
          steps={[t('features.products.portfoliosTab.step1'), t('features.products.portfoliosTab.step2'), t('features.products.portfoliosTab.step3')]}
        />
        {creating ? <StrategyForm kind="portfolio" onClose={() => setCreating(false)} onSubmit={async (input) => { await createPortfolio(input); toast.success(t('features.products.portfoliosTab.created')); setCreating(false); reload(); }} /> : null}
      </>
    );
  }

  return (
    <>
      <div className="management-workbench management-workbench-flush">
        <Panel
          className="management-workbench-main"
          title={t('features.products.portfoliosTab.workbenchTitle')}
          subtitle={t('features.products.portfoliosTab.workbenchSubtitle')}
          toolbar={canManagePortfolios ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.products.portfoliosTab.new')}</button> : undefined}
          noPadding
        >
          <div className="management-workbench-metrics">
            <ManagementSummaryStrip
              items={[
                { label: t('features.products.portfoliosTab.summaryPortfolioCount'), value: portfolios.length },
                { label: t('features.products.portfoliosTab.summaryProducts'), value: totalProducts },
                { label: t('features.products.portfoliosTab.summaryActive'), value: activePortfolios },
                { label: t('features.products.portfoliosTab.summaryRoadmap'), value: roadmapCount },
                { label: t('features.products.portfoliosTab.summaryAvgProducts'), value: portfolios.length ? Math.round(totalProducts / portfolios.length) : 0 },
              ]}
            />
          </div>

          <div className="management-grid">
            <div className="management-list-pane">
              <div className="management-list-pane-header">{t('features.products.portfoliosTab.listTitle')}</div>
              <div className="management-list">
                {portfolios.map((item) => (
                  <ManagementListItem
                    key={item.id}
                    active={selected?.id === item.id}
                    title={item.name}
                    subtitle={t('features.products.portfoliosTab.listSubtitle', { owner: item.owner, count: item.productIds.length })}
                    status={item.status}
                    statusLabel={labelOf(ROADMAP_STATUS_LABELS, item.status)}
                    meta={t('features.products.portfoliosTab.listMeta', { count: item.roadmap.length })}
                    onClick={() => setSelectedId(item.id)}
                  />
                ))}
              </div>
            </div>

            {selected ? (
              <div className="management-detail-pane">
                <SortableSectionLayout surface="portfolios.detail" className="management-detail-sortable">
                  <SortableSection id="hero" label={selected.name} className="wide">
                    <div className="management-hero">
                  <div>
                    <div className="product-hero-top">
                      <StatusBadge status={selected.status} label={labelOf(ROADMAP_STATUS_LABELS, selected.status)} />
                      <span className="tag">{selected.id}</span>
                    </div>
                    <h2>{selected.name}</h2>
                    <p><strong>{t('features.products.portfoliosTab.objective')}</strong>{selected.objective || t('features.products.portfoliosTab.noObjective')}</p>
                    <p>{t('features.products.portfoliosTab.heroDesc', { owner: selected.owner, count: selected.productIds.length })}</p>
                  </div>
                  <div className="management-score-grid">
                    <div>
                      <span>{t('features.products.portfoliosTab.productCount')}</span>
                      <strong>{selected.productIds.length}</strong>
                    </div>
                    <div>
                      <span>{t('features.products.portfoliosTab.roadmap')}</span>
                      <strong>{selected.roadmap.length}</strong>
                    </div>
                    <div>
                      <span>{t('features.products.portfoliosTab.status')}</span>
                      <strong>{labelOf(ROADMAP_STATUS_LABELS, selected.status)}</strong>
                    </div>
                  </div>
                    </div>
                  </SortableSection>
                  <SortableSection id="products" label={t('features.products.portfoliosTab.portfolioProducts')}>
                    <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.portfoliosTab.portfolioProducts')}</h3>
                        <p>{t('features.products.portfoliosTab.portfolioProductsDesc')}</p>
                      </div>
                    </div>
                    <div className="management-chip-list">
                      {selected.productIds.length ? selected.productIds.map((id) => (
                        <span key={id} title={productNameById.has(id) ? t('features.products.portfoliosTab.idPrefix', { id }) : undefined}>{productNameById.get(id) ?? id}</span>
                      )) : <div className="product-empty-line">{t('features.products.portfoliosTab.noProducts')}</div>}
                    </div>
                    </div>
                  </SortableSection>
                  <SortableSection id="roadmap" label={t('features.products.portfoliosTab.portfolioRoadmap')}>
                    <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.portfoliosTab.portfolioRoadmap')}</h3>
                        <p>{t('features.products.portfoliosTab.portfolioRoadmapDesc')}</p>
                      </div>
                    </div>
                    {selected.roadmap.length ? (
                      <div className="product-roadmap-list">
                        {selected.roadmap.map((roadmap, index) => (
                          <div key={`${roadmap.title}-${index}`} className="product-roadmap-item">
                            <div className="product-roadmap-dot" />
                            <div>
                              <strong>{roadmap.title || roadmap.version || t('features.products.portfoliosTab.planningItem', { index: index + 1 })}</strong>
                              <span>{roadmap.version || t('features.products.portfoliosTab.noVersion')}{roadmap.quarter ? ` · ${roadmap.quarter}` : ''}</span>
                            </div>
                            {roadmap.status ? <StatusBadge status={String(roadmap.status)} label={labelOf(ROADMAP_STATUS_LABELS, String(roadmap.status))} showDot={false} /> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="product-empty-line">{t('features.products.portfoliosTab.emptyRoadmap')}</div>
                    )}
                    </div>
                  </SortableSection>
                </SortableSectionLayout>
                {canManagePortfolios ? (
                  <div className="product-hero-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(selected)}>{t('features.products.portfoliosTab.edit')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected)} disabled={deletingId === selected.id}>
                      {deletingId === selected.id ? t('features.products.portfoliosTab.deleting') : t('features.products.portfoliosTab.delete')}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
      {creating && canManagePortfolios ? <StrategyForm kind="portfolio" onClose={() => setCreating(false)} onSubmit={async (input) => { await createPortfolio(input); toast.success(t('features.products.portfoliosTab.created')); setCreating(false); reload(); }} /> : null}
      {editing && canManagePortfolios ? <StrategyForm kind="portfolio" initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updatePortfolio(editing.id, input); toast.success(t('features.products.portfoliosTab.updated')); setEditing(null); reload(); }} /> : null}
    </>
  );
}
