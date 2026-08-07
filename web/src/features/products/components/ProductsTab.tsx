import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  applyProductImageChanges,
  createProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
} from '../api';
import {
  allProductMetrics,
  currentProductImage,
  productImageUrls,
  productStageTone,
} from '../productModel';
import ProductForm from './ProductForm';
import ProductImage from './ProductImage';
import ProductSummaryStrip from './ProductSummaryStrip';
import DetailGrid from './DetailGrid';
import i18n from '../../../i18n';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { summarizeDependencies } from '../../../utils/dependencySummary';
import { canOperate } from '../../../constants/roles';
import {
  MODULE_STATUS_LABELS,
  PRODUCT_STAGE_LABELS,
  ROADMAP_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { Product } from '../../../types';
import type { ProductImageChangeResult } from '../api';

function productImageFailureMessage(result: ProductImageChangeResult): string {
  const details = result.failures.slice(0, 2).map((failure) => {
    const action = failure.operation === 'upload'
      ? i18n.t('features.products.productsTab.imageUpload', { subject: failure.subject })
      : i18n.t('features.products.productsTab.imageDelete', { subject: failure.subject });
    const message = failure.error instanceof ApiError ? failure.error.message : i18n.t('features.products.productsTab.imageOpFailed');
    return i18n.t('features.products.productsTab.imageOpDetail', { action, message });
  });
  const omitted = result.failures.length - details.length;
  const base = i18n.t('features.products.productsTab.imageFailures', { count: result.failures.length, details: details.join('；') });
  return omitted > 0 ? `${base}${i18n.t('features.products.productsTab.imageOmittedFailures', { count: omitted })}` : base;
}

export default function ProductsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const user = getSessionUser();
  const canManageProducts = canOperate(user, 'products:manage');
  const { data, loading, error, reload } = useAsync<Product[]>(fetchProducts, [], { cacheKey: 'products:list' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const products = data ?? [];
  const selectedProduct = products.find((product) => product.id === selectedId) ?? products[0] ?? null;
  const selectedMetrics = useMemo(() => allProductMetrics(selectedProduct).slice(0, 6), [selectedProduct]);

  useEffect(() => {
    if (!products.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !products.some((product) => product.id === selectedId)) {
      setSelectedId(products[0].id);
    }
  }, [products, selectedId]);

  async function saveProductImages(
    productId: string,
    changes: Parameters<typeof applyProductImageChanges>[1],
    successMessage: string,
  ) {
    const result = await applyProductImageChanges(productId, changes);
    if (result.failures.length > 0) toast.error(productImageFailureMessage(result));
    else toast.success(successMessage);
  }

  async function handleDelete(product: Product) {
    if (!canManageProducts) {
      toast.error(t('features.products.productsTab.noPermissionDelete'));
      return;
    }
    const confirmed = await confirm({
      title: t('features.products.productsTab.deleteConfirm', { name: product.name }),
      description: t('features.products.productsTab.deleteConfirmDesc'),
      confirmText: t('features.products.productsTab.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      toast.success(t('features.products.productsTab.deleted'));
      reload();
    } catch (error) {
      // 409 = has dependencies (requirements/releases/images/portfolios); offer cascade.
      if (error instanceof ApiError && error.status === 409) {
        const summary = summarizeDependencies((error.body as { details?: { dependencies?: Record<string, unknown> } })?.details?.dependencies);
        const cascade = await confirm({
          title: summary ? t('features.products.productsTab.dependenciesTitle') : t('features.products.productsTab.dependenciesTitleAlt'),
          description: summary
            ? t('features.products.productsTab.dependenciesConfirm', { name: product.name, summary })
            : t('features.products.productsTab.dependenciesConfirmAlt', { name: product.name }),
          confirmText: t('features.products.productsTab.cascadeDelete'),
          tone: 'danger',
        });
        if (!cascade) {
          setDeletingId(null);
          return;
        }
        try {
          await deleteProduct(product.id, true);
          toast.success(t('features.products.productsTab.deletedWithDependencies', { name: product.name }));
          reload();
        } catch (cascadeErr) {
          toast.error(cascadeErr instanceof ApiError ? cascadeErr.message : t('features.products.productsTab.cascadeDeleteFailed'));
        } finally {
          setDeletingId(null);
        }
        return;
      }
      toast.error(error instanceof ApiError ? error.message : t('features.products.productsTab.deleteFailed'));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading || error || !data) {
    return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  }

  return (
    <>
      {products.length === 0 ? (
        <div className="product-workbench product-workbench-flush">
          <Panel
            className="product-workbench-main"
            title={t('features.products.productsTab.workbenchTitle')}
            subtitle={t('features.products.productsTab.workbenchSubtitleEmpty')}
            toolbar={canManageProducts ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.products.productsTab.new')}</button> : undefined}
            noPadding
          >
            <div className="product-workbench-grid">
              <div className="product-list-pane">
                <div className="product-list-pane-header">{t('features.products.productsTab.listTitle')}</div>
                <div className="product-list">
                  <div className="product-empty-line">{t('features.products.productsTab.noProducts')}</div>
                </div>
              </div>
              <div className="product-detail-pane">
                <PageState loading={false} error={null} isEmpty emptyTitle={t('features.products.productsTab.emptyTitle')} emptyDescription={t('features.products.productsTab.emptyDescription')} />
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="product-workbench product-workbench-flush">
          <Panel
            className="product-workbench-main"
            title={t('features.products.productsTab.workbenchTitle')}
            subtitle={t('features.products.productsTab.workbenchSubtitle')}
            toolbar={canManageProducts ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>{t('features.products.productsTab.new')}</button> : undefined}
            noPadding
          >
            <div className="product-workbench-metrics">
              <ProductSummaryStrip products={products} />
            </div>

            <div className="product-workbench-grid">
              <div className="product-list-pane">
                <div className="product-list-pane-header">{t('features.products.productsTab.listTitle')}</div>
                <div className="product-list">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      className={`product-list-item ${selectedProduct?.id === product.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(product.id)}
                    >
                      <span className="product-list-thumb">
                        {currentProductImage(product) ? <ProductImage src={currentProductImage(product)} alt={product.name} /> : product.name.slice(0, 1)}
                      </span>
                      <span className="product-list-main">
                        <strong>{product.name}</strong>
                        <small>{product.owner} · {product.version}</small>
                      </span>
                      <StatusBadge status={productStageTone(product.stage)} label={labelOf(PRODUCT_STAGE_LABELS, product.stage)} showDot={false} />
                    </button>
                  ))}
                </div>
              </div>

              {selectedProduct ? (
                <div className="product-detail-pane">
                  <div className="product-hero">
                  <div className="product-hero-media">
                    {currentProductImage(selectedProduct) ? (
                      <ProductImage src={currentProductImage(selectedProduct)} alt={selectedProduct.name} fallbackClassName="product-hero-empty" />
                    ) : (
                      <div className="product-hero-empty">{selectedProduct.name.slice(0, 1)}</div>
                    )}
                  </div>
                  <div className="product-hero-content">
                    <div className="product-hero-top">
                      <StatusBadge status={productStageTone(selectedProduct.stage)} label={labelOf(PRODUCT_STAGE_LABELS, selectedProduct.stage)} />
                      <span className="tag">{selectedProduct.id}</span>
                    </div>
                    <h2>{selectedProduct.name}</h2>
                    <p>{selectedProduct.description || t('features.products.productsTab.noDescription')}</p>
                    <div className="product-hero-facts">
                      <div>
                        <span>{t('features.products.productsTab.ownerLabel')}</span>
                        <strong>{selectedProduct.owner || '-'}</strong>
                      </div>
                      <div>
                        <span>{t('features.products.productsTab.versionLabel')}</span>
                        <strong>{selectedProduct.version || '-'}</strong>
                      </div>
                      <div>
                        <span>{t('features.products.productsTab.systemVersionLabel')}</span>
                        <strong>{selectedProduct.systemVersion || '-'}</strong>
                      </div>
                      <div>
                        <span>{t('features.products.productsTab.applicationVersionLabel')}</span>
                        <strong>{selectedProduct.applicationVersion || '-'}</strong>
                      </div>
                    </div>
                    {canManageProducts ? (
                      <div className="product-hero-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(selectedProduct)}>{t('features.products.productsTab.edit')}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedProduct)} disabled={deletingId === selectedProduct.id}>
                          {deletingId === selectedProduct.id ? t('features.products.productsTab.deleting') : t('features.products.productsTab.delete')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {productImageUrls(selectedProduct).length > 1 ? (
                  <div className="product-gallery-strip">
                    {productImageUrls(selectedProduct).slice(1).map((image, index) => (
                      <ProductImage key={`${selectedProduct.id}-gallery-${index}`} src={image} alt={`${selectedProduct.name} ${index + 2}`} />
                    ))}
                  </div>
                ) : null}

                <div className="product-detail-grid">
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.productsTab.modulesTitle')}</h3>
                        <p>{t('features.products.productsTab.modulesCount', { count: selectedProduct.modules.length })}</p>
                      </div>
                    </div>
                    {selectedProduct.modules.length ? (
                      <div className="product-module-list">
                        {selectedProduct.modules.map((item, index) => (
                          <div key={`${item.name}-${index}`} className="product-module-item">
                            <div>
                              <strong>{item.name || t('features.products.productsTab.moduleFallback', { index: index + 1 })}</strong>
                              <span>{item.owner ? t('features.products.productsTab.moduleOwner', { owner: item.owner }) : t('features.products.productsTab.noModuleOwner')}</span>
                            </div>
                            <StatusBadge status={String(item.status || 'planned')} label={labelOf(MODULE_STATUS_LABELS, String(item.status || 'planned'))} showDot={false} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="product-empty-line">{t('features.products.productsTab.emptyModules')}</div>
                    )}
                  </div>

                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.productsTab.roadmapTitle')}</h3>
                        <p>{t('features.products.productsTab.roadmapDesc')}</p>
                      </div>
                    </div>
                    {selectedProduct.roadmap.length ? (
                      <div className="product-roadmap-list">
                        {selectedProduct.roadmap.map((item, index) => (
                          <div key={`${item.title}-${index}`} className="product-roadmap-item">
                            <div className="product-roadmap-dot" />
                            <div>
                              <strong>{item.title || item.version || t('features.products.productsTab.planningItem', { index: index + 1 })}</strong>
                              <span>{item.version || t('features.products.productsTab.noVersion')}{item.quarter ? ` · ${item.quarter}` : ''}</span>
                            </div>
                            <StatusBadge status={String(item.status || 'planned')} label={labelOf(ROADMAP_STATUS_LABELS, String(item.status || 'planned'))} showDot={false} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="product-empty-line">{t('features.products.productsTab.emptyRoadmap')}</div>
                    )}
                  </div>
                </div>

                <div className="product-detail-grid">
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.productsTab.assetsTitle')}</h3>
                        <p>{t('features.products.productsTab.assetsDesc')}</p>
                      </div>
                    </div>
                    <DetailGrid title={t('features.products.productForm.hardwareInfo')} data={selectedProduct.hardwareInfo} />
                    <DetailGrid title={t('features.products.productForm.systemInfo')} data={selectedProduct.systemInfo} />
                    <DetailGrid title={t('features.products.productForm.applicationInfo')} data={selectedProduct.applicationInfo} />
                    {!Object.keys(selectedProduct.hardwareInfo ?? {}).length && !Object.keys(selectedProduct.systemInfo ?? {}).length && !Object.keys(selectedProduct.applicationInfo ?? {}).length ? (
                      <div className="product-empty-line">{t('features.products.productsTab.emptyAssets')}</div>
                    ) : null}
                  </div>

                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>{t('features.products.productsTab.metricsTitle')}</h3>
                        <p>{t('features.products.productsTab.metricsDesc')}</p>
                      </div>
                    </div>
                    {selectedMetrics.length ? (
                      <div className="product-metric-grid">
                        {selectedMetrics.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="product-metric-item">
                            <span>{item.label}</span>
                            <strong>{item.value}{item.unit ? <em>{item.unit}</em> : null}</strong>
                            {item.status ? <StatusBadge status={item.status} label={labelOf(MODULE_STATUS_LABELS, item.status)} showDot={false} /> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="product-empty-line">{t('features.products.productsTab.emptyMetrics')}</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </Panel>
        </div>
      )}

      {creating && canManageProducts ? (
        <ProductForm
          title={t('features.products.productsTab.newFormTitle')}
          onClose={() => setCreating(false)}
          onSubmit={async ({ product, imageChanges }) => {
            const created = await createProduct(product);
            await saveProductImages(created.id, imageChanges, t('features.products.productsTab.created'));
            setCreating(false);
            reload();
          }}
        />
      ) : null}

      {editing && canManageProducts ? (
        <ProductForm
          title={t('features.products.productsTab.editFormTitle')}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async ({ product, imageChanges }) => {
            const updated = await updateProduct(editing.id, product);
            await saveProductImages(updated.id, imageChanges, t('features.products.productsTab.updated'));
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
