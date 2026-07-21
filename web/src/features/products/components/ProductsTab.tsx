import { useEffect, useMemo, useState } from 'react';
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
} from '../api';
import {
  allProductMetrics,
  currentProductImage,
  productImages,
  productStageTone,
} from '../productModel';
import ProductForm from './ProductForm';
import ProductImage from './ProductImage';
import ProductSummaryStrip from './ProductSummaryStrip';
import DetailGrid from './DetailGrid';
import { getSessionUser } from '../../../services/auth';
import { useAsync } from '../../../hooks/useAsync';
import { ApiError } from '../../../services/api';
import Panel from '../../../components/common/Panel';
import PageState from '../../../components/common/PageState';
import StatusBadge from '../../../components/common/StatusBadge';
import { useToast } from '../../../components/common/Toast';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { canOperate } from '../../../constants/roles';
import {
  MODULE_STATUS_LABELS,
  PRODUCT_STAGE_LABELS,
  ROADMAP_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { Product } from '../../../types';

export default function ProductsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const user = getSessionUser();
  const canManageProducts = canOperate(user, 'products:manage');
  const { data, loading, error, reload } = useAsync<Product[]>(fetchProducts, []);
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

  async function handleDelete(product: Product) {
    if (!canManageProducts) {
      toast.error('当前账号无权删除产品。');
      return;
    }
    const confirmed = await confirm({
      title: `删除产品“${product.name}”？`,
      description: '删除后产品资料、图片和路线图配置将不可恢复。',
      confirmText: '删除产品',
      tone: 'danger',
    });
    if (!confirmed) return;
    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      toast.success('产品已删除');
      reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除失败');
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
        <Panel
          title="产品工作台"
          subtitle="先建立一个产品，再维护版本、图片、能力模块、资产参数和路线图。"
          toolbar={canManageProducts ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建产品</button> : undefined}
        >
          <PageState loading={false} error={null} isEmpty emptyTitle="暂无产品" emptyDescription="当前还没有录入任何产品信息。" />
        </Panel>
      ) : (
        <div className="product-workbench product-workbench-flush">
          <Panel
            className="product-workbench-main"
            title="产品工作台"
            subtitle="把产品当成真实交付对象维护：图片、版本、负责人、能力模块、资产参数和后续路线图都在这里闭环。"
            toolbar={canManageProducts ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建产品</button> : undefined}
            noPadding
          >
            <div className="product-workbench-metrics">
              <ProductSummaryStrip products={products} />
            </div>

            <div className="product-workbench-grid">
              <div className="product-list-pane">
                <div className="product-list-pane-header">产品清单</div>
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
                    <p>{selectedProduct.description || '还没有填写产品介绍，建议补充产品定位、目标用户、交付边界和核心价值。'}</p>
                    <div className="product-hero-facts">
                      <div>
                        <span>产品负责人</span>
                        <strong>{selectedProduct.owner || '-'}</strong>
                      </div>
                      <div>
                        <span>产品版本</span>
                        <strong>{selectedProduct.version || '-'}</strong>
                      </div>
                      <div>
                        <span>系统版本</span>
                        <strong>{selectedProduct.systemVersion || '-'}</strong>
                      </div>
                      <div>
                        <span>应用版本</span>
                        <strong>{selectedProduct.applicationVersion || '-'}</strong>
                      </div>
                    </div>
                    {canManageProducts ? (
                      <div className="product-hero-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(selectedProduct)}>编辑产品</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedProduct)} disabled={deletingId === selectedProduct.id}>
                          {deletingId === selectedProduct.id ? '删除中...' : '删除产品'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {productImages(selectedProduct).length > 1 ? (
                  <div className="product-gallery-strip">
                    {productImages(selectedProduct).slice(1).map((image, index) => (
                      <ProductImage key={`${selectedProduct.id}-gallery-${index}`} src={image} alt={`${selectedProduct.name} ${index + 2}`} />
                    ))}
                  </div>
                ) : null}

                <div className="product-detail-grid">
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>能力模块</h3>
                        <p>{selectedProduct.modules.length} 个模块，按负责人和状态追踪。</p>
                      </div>
                    </div>
                    {selectedProduct.modules.length ? (
                      <div className="product-module-list">
                        {selectedProduct.modules.map((item, index) => (
                          <div key={`${item.name}-${index}`} className="product-module-item">
                            <div>
                              <strong>{item.name || `模块 ${index + 1}`}</strong>
                              <span>{item.owner ? `负责人：${item.owner}` : '未设置负责人'}</span>
                            </div>
                            <StatusBadge status={String(item.status || 'planned')} label={labelOf(MODULE_STATUS_LABELS, String(item.status || 'planned'))} showDot={false} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="product-empty-line">还没有维护能力模块。</div>
                    )}
                  </div>

                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>版本路线图</h3>
                        <p>下一步版本目标和季度节奏。</p>
                      </div>
                    </div>
                    {selectedProduct.roadmap.length ? (
                      <div className="product-roadmap-list">
                        {selectedProduct.roadmap.map((item, index) => (
                          <div key={`${item.title}-${index}`} className="product-roadmap-item">
                            <div className="product-roadmap-dot" />
                            <div>
                              <strong>{item.title || item.version || `规划项 ${index + 1}`}</strong>
                              <span>{item.version || '未设置版本'}{item.quarter ? ` · ${item.quarter}` : ''}</span>
                            </div>
                            <StatusBadge status={String(item.status || 'planned')} label={labelOf(ROADMAP_STATUS_LABELS, String(item.status || 'planned'))} showDot={false} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="product-empty-line">还没有维护路线图。</div>
                    )}
                  </div>
                </div>

                <div className="product-detail-grid">
                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>资产画像</h3>
                        <p>硬件、系统、应用的关键参数。</p>
                      </div>
                    </div>
                    <DetailGrid title="硬件信息" data={selectedProduct.hardwareInfo} />
                    <DetailGrid title="系统信息" data={selectedProduct.systemInfo} />
                    <DetailGrid title="应用信息" data={selectedProduct.applicationInfo} />
                    {!Object.keys(selectedProduct.hardwareInfo ?? {}).length && !Object.keys(selectedProduct.systemInfo ?? {}).length && !Object.keys(selectedProduct.applicationInfo ?? {}).length ? (
                      <div className="product-empty-line">还没有维护资产参数。</div>
                    ) : null}
                  </div>

                  <div className="product-section">
                    <div className="product-section-head">
                      <div>
                        <h3>运行指标</h3>
                        <p>产品规格、容量、性能或质量指标。</p>
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
                      <div className="product-empty-line">还没有维护运行指标。</div>
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
          title="新建产品"
          onClose={() => setCreating(false)}
          onSubmit={async (payload) => {
            await createProduct(payload);
            toast.success('产品已创建');
            setCreating(false);
            reload();
          }}
        />
      ) : null}

      {editing && canManageProducts ? (
        <ProductForm
          title="编辑产品"
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            await updateProduct(editing.id, payload);
            toast.success('产品已更新');
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
