import { useEffect, useMemo, useState } from 'react';
import {
  createProduct,
  createPortfolio,
  createProgram,
  createStrategicGoal,
  deleteProduct,
  deletePortfolio,
  deleteProgram,
  deleteStrategicGoal,
  fetchPortfolios,
  fetchProducts,
  fetchPrograms,
  fetchStrategicGoals,
  updateProduct,
  updatePortfolio,
  updateProgram,
  updateStrategicGoal,
  type CreateProductInput,
  type StrategyInput,
  type StrategicGoalInput,
} from '../features/products/api';
import { fetchProjects } from '../features/projects/api';
import { getSessionUser } from '../services/auth';
import { useAsync } from '../hooks/useAsync';
import { ApiError } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import Overlay from '../components/common/Overlay';
import StatusBadge from '../components/common/StatusBadge';
import { useToast } from '../components/common/Toast';
import { useConfirm } from '../components/common/ConfirmDialog';
import { canOperate } from '../constants/roles';
import {
  MODULE_STATUS_LABELS,
  PRODUCT_STAGE_LABELS,
  PROJECT_STATUS_LABELS,
  ROADMAP_STATUS_LABELS,
  labelOf,
} from '../constants/enums';
import type { Portfolio, Product, ProductMetric, ProductModule, Program, Project, RoadmapItem, StrategicGoal } from '../types';

type Tab = 'products' | 'programs' | 'portfolios' | 'goals';
type DetailItem = { key: string; value: string };

const EMPTY_DETAIL: DetailItem = { key: '', value: '' };
const EMPTY_MODULE: ProductModule = { name: '', owner: '', status: 'planned' };
const EMPTY_METRIC: ProductMetric = { label: '', value: '', unit: '', status: 'planned' };
const EMPTY_ROADMAP: RoadmapItem = { title: '', version: '', quarter: '', status: 'planned' };
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_MAX_COUNT = 6;
const PRODUCT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

function toDetailItems(record?: Record<string, unknown>): DetailItem[] {
  const entries = Object.entries(record ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
  return entries.length ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ ...EMPTY_DETAIL }];
}

function toModules(modules?: ProductModule[]): ProductModule[] {
  return modules?.length ? modules.map((item) => ({ name: item.name ?? '', owner: item.owner ?? '', status: item.status ?? 'planned' })) : [{ ...EMPTY_MODULE }];
}

function toMetrics(metrics?: ProductMetric[]): ProductMetric[] {
  return metrics?.length ? metrics.map((item) => ({ label: item.label ?? '', value: item.value ?? '', unit: item.unit ?? '', status: item.status ?? 'planned' })) : [{ ...EMPTY_METRIC }];
}

function toRoadmap(items?: RoadmapItem[]): RoadmapItem[] {
  return items?.length
    ? items.map((item) => ({ title: item.title ?? '', version: item.version ?? '', quarter: item.quarter ?? '', status: item.status ?? 'planned' }))
    : [{ ...EMPTY_ROADMAP }];
}

function sanitizeDetailItems(items: DetailItem[]): Record<string, string> {
  return items.reduce<Record<string, string>>((acc, item) => {
    const key = item.key.trim();
    const value = item.value.trim();
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

function sanitizeModules(items: ProductModule[]): ProductModule[] {
  return items
    .map((item) => ({
      name: String(item.name ?? '').trim(),
      owner: String(item.owner ?? '').trim(),
      status: String(item.status ?? 'planned'),
    }))
    .filter((item) => item.name);
}

function sanitizeMetrics(items: ProductMetric[]): ProductMetric[] {
  return items
    .map((item) => ({
      label: item.label.trim(),
      value: item.value.trim(),
      unit: item.unit?.trim(),
      status: item.status?.trim(),
    }))
    .filter((item) => item.label && item.value);
}

function sanitizeRoadmap(items: RoadmapItem[]): RoadmapItem[] {
  return items
    .map((item) => ({
      title: String(item.title ?? '').trim(),
      version: String(item.version ?? '').trim(),
      quarter: String(item.quarter ?? '').trim(),
      status: String(item.status ?? 'planned'),
    }))
    .filter((item) => item.title || item.version || item.quarter);
}

function productImages(product?: Product | null): string[] {
  const values = product?.imageUrls?.length ? product.imageUrls : product?.imageUrl ? [product.imageUrl] : [];
  return values
    .map((item) => String(item || '').trim())
    .filter((item) => item && !/^https?:\/\/(?:www\.)?example\.com\//i.test(item));
}

function ProductImage({
  src,
  alt,
  className,
  fallbackClassName,
}: {
  src?: string;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(!src);
  if (!src || failed) {
    return <span className={fallbackClassName ?? `product-image-fallback ${className ?? ''}`}>{alt.slice(0, 1).toUpperCase()}</span>;
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function DetailGrid({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!entries.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="section-title">{title}</div>
      <div className="detail-grid" style={{ marginTop: 8 }}>
        {entries.map(([key, value]) => (
          <div key={key} className="detail-field">
            <span className="detail-label">{key}</span>
            <span>{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsCards({ title, metrics }: { title: string; metrics?: ProductMetric[] }) {
  if (!metrics?.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="section-title">{title}</div>
      <div className="metric-grid" style={{ marginTop: 8 }}>
        {metrics.map((item, index) => (
          <div key={`${item.label}-${index}`} className="metric-card">
            <div className="metric-card-label">{item.label || `指标 ${index + 1}`}</div>
            <div className="metric-card-value">
              {item.value || '-'}
              {item.unit ? <span style={{ fontSize: 13, marginLeft: 4 }}>{item.unit}</span> : null}
            </div>
            {item.status ? (
              <div style={{ marginTop: 8 }}>
                <StatusBadge status={item.status} label={labelOf(MODULE_STATUS_LABELS, item.status)} showDot={false} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductsPage() {
  const [tab, setTab] = useState<Tab>('products');

  return (
    <div>
      <PageHeader
        title="产品管理"
        description="围绕硬件产品、系统版本、应用能力、项目集和组合视角进行统一管理。"
      />

      <div className="nav-tabs" style={{ marginBottom: 16 }}>
        <button className={`nav-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
          产品
        </button>
        <button className={`nav-tab ${tab === 'programs' ? 'active' : ''}`} onClick={() => setTab('programs')}>
          项目集
        </button>
        <button className={`nav-tab ${tab === 'portfolios' ? 'active' : ''}`} onClick={() => setTab('portfolios')}>
          组合
        </button>
        <button className={`nav-tab ${tab === 'goals' ? 'active' : ''}`} onClick={() => setTab('goals')}>
          公司目标
        </button>
      </div>

      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'programs' ? <ProgramsTab /> : null}
      {tab === 'portfolios' ? <PortfoliosTab /> : null}
      {tab === 'goals' ? <StrategicGoalsTab /> : null}
    </div>
  );
}

function currentProductImage(product?: Product | null) {
  return productImages(product)[0] || '';
}

function allProductMetrics(product?: Product | null): ProductMetric[] {
  if (!product) return [];
  return [
    ...(product.hardwareMetrics ?? []),
    ...(product.systemMetrics ?? []),
    ...(product.appMetrics ?? []),
  ].filter((item) => item.label && item.value);
}

function roadmapInProgress(product?: Product | null) {
  return (product?.roadmap ?? []).filter((item) => ['design', 'development', 'evaluating', 'planned'].includes(String(item.status || 'planned')));
}

function productStageTone(stage: string) {
  if (['released', 'maintenance'].includes(stage)) return 'success';
  if (['development', 'mvp'].includes(stage)) return 'info';
  if (['evaluating', 'planned', 'concept', 'design'].includes(stage)) return 'warning';
  return 'neutral';
}

function ProductSummaryStrip({ products }: { products: Product[] }) {
  const totalModules = products.reduce((sum, product) => sum + product.modules.length, 0);
  const activeProducts = products.filter((product) => !['released', 'maintenance'].includes(product.stage)).length;
  const roadmapCount = products.reduce((sum, product) => sum + roadmapInProgress(product).length, 0);
  const imageCount = products.reduce((sum, product) => sum + productImages(product).length, 0);

  return (
    <div className="metric-grid product-metric-strip">
      <div className="metric-card">
        <div className="metric-card-label">产品总数</div>
        <div className="metric-card-value">{products.length}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">在研/规划</div>
        <div className="metric-card-value">{activeProducts}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">能力模块</div>
        <div className="metric-card-value">{totalModules}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">路线图事项</div>
        <div className="metric-card-value">{roadmapCount}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">产品图片</div>
        <div className="metric-card-value">{imageCount}</div>
      </div>
    </div>
  );
}

function ProductsTab() {
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
        <div className="product-workbench">
          <Panel
            title="产品工作台"
            subtitle="把产品当成真实交付对象维护：图片、版本、负责人、能力模块、资产参数和后续路线图都在这里闭环。"
            toolbar={canManageProducts ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建产品</button> : undefined}
          >
            <ProductSummaryStrip products={products} />
          </Panel>

          <div className="product-workbench-grid">
            <Panel className="product-list-pane" title="产品清单" noPadding>
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
            </Panel>

            {selectedProduct ? (
              <Panel className="product-detail-pane">
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
              </Panel>
            ) : null}
          </div>
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

function ProductForm({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: Product | null;
  onClose: () => void;
  onSubmit: (payload: CreateProductInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? '');
  const [version, setVersion] = useState(initial?.version ?? '1.0.0');
  const [stage, setStage] = useState(initial?.stage ?? 'design');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(productImages(initial));
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [systemName, setSystemName] = useState(initial?.systemName ?? '');
  const [systemVersion, setSystemVersion] = useState(initial?.systemVersion ?? '');
  const [applicationVersion, setApplicationVersion] = useState(initial?.applicationVersion ?? '');
  const [modules, setModules] = useState<ProductModule[]>(toModules(initial?.modules));
  const [hardwareInfo, setHardwareInfo] = useState<DetailItem[]>(toDetailItems(initial?.hardwareInfo));
  const [systemInfo, setSystemInfo] = useState<DetailItem[]>(toDetailItems(initial?.systemInfo));
  const [applicationInfo, setApplicationInfo] = useState<DetailItem[]>(toDetailItems(initial?.applicationInfo));
  const [hardwareMetrics, setHardwareMetrics] = useState<ProductMetric[]>(toMetrics(initial?.hardwareMetrics));
  const [systemMetrics, setSystemMetrics] = useState<ProductMetric[]>(toMetrics(initial?.systemMetrics));
  const [appMetrics, setAppMetrics] = useState<ProductMetric[]>(toMetrics(initial?.appMetrics));
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>(toRoadmap(initial?.roadmap));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function readImageFile(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('读取图片失败'));
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFiles(files?: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const slots = PRODUCT_IMAGE_MAX_COUNT - imageUrls.length;
    if (slots <= 0) {
      setFormError(`最多上传 ${PRODUCT_IMAGE_MAX_COUNT} 张产品图片。`);
      return;
    }
    const accepted = selected.slice(0, slots);
    const invalidType = accepted.find((file) => !PRODUCT_IMAGE_TYPES.includes(file.type));
    if (invalidType) {
      setFormError('产品图片支持 PNG、JPG、WEBP、GIF、SVG。');
      return;
    }
    const oversize = accepted.find((file) => file.size > PRODUCT_IMAGE_MAX_BYTES);
    if (oversize) {
      setFormError('单张产品图片请控制在 5MB 以内。');
      return;
    }
    const dataUrls = await Promise.all(accepted.map(readImageFile));
    setImageUrls((prev) => [...prev, ...dataUrls].slice(0, PRODUCT_IMAGE_MAX_COUNT));
    setFormError(null);
  }

  function addImageUrl() {
    const value = imageUrlDraft.trim();
    if (!value) return;
    if (imageUrls.length >= PRODUCT_IMAGE_MAX_COUNT) {
      setFormError(`最多维护 ${PRODUCT_IMAGE_MAX_COUNT} 张产品图片。`);
      return;
    }
    setImageUrls((prev) => [...prev, value]);
    setImageUrlDraft('');
    setFormError(null);
  }

  function updateArrayItem<T>(items: T[], index: number, updater: (current: T) => T, setter: (next: T[]) => void) {
    const next = [...items];
    next[index] = updater(next[index]);
    setter(next);
  }

  async function handleSubmit() {
    if (!name.trim()) return setFormError('请输入产品名称。');
    if (!owner.trim()) return setFormError('请输入产品负责人。');
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        owner: owner.trim(),
        version: version.trim() || '1.0.0',
        stage,
        description: description.trim(),
        imageUrl: imageUrls[0] || undefined,
        imageUrls,
        systemName: systemName.trim(),
        systemVersion: systemVersion.trim(),
        applicationVersion: applicationVersion.trim(),
        modules: sanitizeModules(modules),
        hardwareInfo: sanitizeDetailItems(hardwareInfo),
        systemInfo: sanitizeDetailItems(systemInfo),
        applicationInfo: sanitizeDetailItems(applicationInfo),
        hardwareMetrics: sanitizeMetrics(hardwareMetrics),
        systemMetrics: sanitizeMetrics(systemMetrics),
        appMetrics: sanitizeMetrics(appMetrics),
        roadmap: sanitizeRoadmap(roadmap),
      });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '保存失败');
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={title} subtitle="通过结构化表单维护产品信息，无需手动填写 JSON。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">产品名称</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">负责人</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">版本</label>
            <input className="form-input" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">阶段</label>
            <select className="form-select" value={stage} onChange={(e) => setStage(e.target.value)}>
              {Object.keys(PRODUCT_STAGE_LABELS).map((item) => (
                <option key={item} value={item}>{labelOf(PRODUCT_STAGE_LABELS, item)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">展示图片</label>
          <div className="product-image-picker">
            {imageUrls.length ? (
              <div className="product-image-preview-grid">
                {imageUrls.map((image, index) => (
                  <div key={`${image.slice(0, 32)}-${index}`} className="product-image-preview-item">
                    <img src={image} alt={`产品图片 ${index + 1}`} />
                    <button className="btn btn-text btn-xs" onClick={() => setImageUrls((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}>
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="product-image-empty">暂无图片</div>
            )}
            <div className="product-image-controls">
              <div className="flex items-center gap-2" style={{ alignItems: 'stretch' }}>
                <input
                  className="form-input"
                  value={imageUrlDraft}
                  onChange={(e) => setImageUrlDraft(e.target.value)}
                  placeholder="粘贴图片 URL"
                />
                <button className="btn btn-secondary btn-sm" onClick={addImageUrl} disabled={!imageUrlDraft.trim() || imageUrls.length >= PRODUCT_IMAGE_MAX_COUNT}>
                  添加
                </button>
              </div>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <label className="btn btn-secondary btn-sm" htmlFor="product-image-upload">上传图片</label>
                <input
                  id="product-image-upload"
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.webp,.gif,.svg,image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleImageFiles(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
                <button className="btn btn-text btn-sm" onClick={() => setImageUrls([])} disabled={!imageUrls.length}>清空</button>
                <span className="form-help-text">支持 PNG/JPG/WEBP/GIF/SVG，单张 5MB，最多 {PRODUCT_IMAGE_MAX_COUNT} 张；当前 {imageUrls.length} 张。</span>
              </div>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">产品介绍</label>
          <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">系统名称</label>
            <input className="form-input" value={systemName} onChange={(e) => setSystemName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">系统版本</label>
            <input className="form-input" value={systemVersion} onChange={(e) => setSystemVersion(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">应用版本</label>
            <input className="form-input" value={applicationVersion} onChange={(e) => setApplicationVersion(e.target.value)} />
          </div>
        </div>

        <StructuredListSection title="功能模块" description="逐项维护模块名称、负责人和当前状态。" onAdd={() => setModules((prev) => [...prev, { ...EMPTY_MODULE }])}>
          {modules.map((item, index) => (
            <EditableCard key={`module-${index}`} onDelete={() => setModules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} disableDelete={modules.length === 1} deleteLabel="删除模块">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">模块名称</label>
                  <input className="form-input" value={String(item.name ?? '')} onChange={(e) => updateArrayItem(modules, index, (current) => ({ ...current, name: e.target.value }), setModules)} />
                </div>
                <div className="form-group">
                  <label className="form-label">负责人</label>
                  <input className="form-input" value={String(item.owner ?? '')} onChange={(e) => updateArrayItem(modules, index, (current) => ({ ...current, owner: e.target.value }), setModules)} />
                </div>
                <div className="form-group">
                  <label className="form-label">状态</label>
                  <select className="form-select" value={String(item.status ?? 'planned')} onChange={(e) => updateArrayItem(modules, index, (current) => ({ ...current, status: e.target.value }), setModules)}>
                    {Object.keys(MODULE_STATUS_LABELS).map((status) => (
                      <option key={status} value={status}>{labelOf(MODULE_STATUS_LABELS, status)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </EditableCard>
          ))}
        </StructuredListSection>

        <DetailSection title="硬件信息" items={hardwareInfo} onChange={setHardwareInfo} />
        <DetailSection title="系统信息" items={systemInfo} onChange={setSystemInfo} />
        <DetailSection title="应用信息" items={applicationInfo} onChange={setApplicationInfo} />

        <MetricsSection title="硬件指标" metrics={hardwareMetrics} onChange={setHardwareMetrics} />
        <MetricsSection title="系统指标" metrics={systemMetrics} onChange={setSystemMetrics} />
        <MetricsSection title="应用指标" metrics={appMetrics} onChange={setAppMetrics} />

        <StructuredListSection title="路线图" description="维护季度规划、版本目标和当前推进状态。" onAdd={() => setRoadmap((prev) => [...prev, { ...EMPTY_ROADMAP }])}>
          {roadmap.map((item, index) => (
            <EditableCard key={`roadmap-${index}`} onDelete={() => setRoadmap((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} disableDelete={roadmap.length === 1} deleteLabel="删除规划项">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">规划标题</label>
                  <input className="form-input" value={String(item.title ?? '')} onChange={(e) => updateArrayItem(roadmap, index, (current) => ({ ...current, title: e.target.value }), setRoadmap)} />
                </div>
                <div className="form-group">
                  <label className="form-label">目标版本</label>
                  <input className="form-input" value={String(item.version ?? '')} onChange={(e) => updateArrayItem(roadmap, index, (current) => ({ ...current, version: e.target.value }), setRoadmap)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">季度</label>
                  <input className="form-input" value={String(item.quarter ?? '')} onChange={(e) => updateArrayItem(roadmap, index, (current) => ({ ...current, quarter: e.target.value }), setRoadmap)} />
                </div>
                <div className="form-group">
                  <label className="form-label">状态</label>
                  <select className="form-select" value={String(item.status ?? 'planned')} onChange={(e) => updateArrayItem(roadmap, index, (current) => ({ ...current, status: e.target.value }), setRoadmap)}>
                    {Object.keys(ROADMAP_STATUS_LABELS).map((status) => (
                      <option key={status} value={status}>{labelOf(ROADMAP_STATUS_LABELS, status)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </EditableCard>
          ))}
        </StructuredListSection>

        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中...' : '保存'}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}

function StructuredListSection({
  title,
  description,
  onAdd,
  children,
}: {
  title: string;
  description: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div className="section-title">{title}</div>
          <div className="text-secondary" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onAdd}>新增</button>
      </div>
      {children}
    </div>
  );
}

function EditableCard({
  children,
  onDelete,
  disableDelete,
  deleteLabel,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  disableDelete?: boolean;
  deleteLabel: string;
}) {
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="panel-body">
        {children}
        <div className="flex items-center" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-text btn-sm" onClick={onDelete} disabled={disableDelete}>{deleteLabel}</button>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  items,
  onChange,
}: {
  title: string;
  items: DetailItem[];
  onChange: (next: DetailItem[]) => void;
}) {
  return (
    <StructuredListSection title={title} description="用键值对方式维护结构化信息。" onAdd={() => onChange([...items, { ...EMPTY_DETAIL }])}>
      {items.map((item, index) => (
        <div key={`${title}-${index}`} className="form-row" style={{ marginBottom: 8 }}>
          <div className="form-group">
            <label className="form-label">字段名</label>
            <input className="form-input" value={item.key} onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], key: e.target.value };
              onChange(next);
            }} />
          </div>
          <div className="form-group">
            <label className="form-label">字段值</label>
            <input className="form-input" value={item.value} onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }} />
          </div>
          <div className="form-group" style={{ maxWidth: 120 }}>
            <label className="form-label">操作</label>
            <button className="btn btn-text btn-sm" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1}>删除</button>
          </div>
        </div>
      ))}
    </StructuredListSection>
  );
}

function MetricsSection({
  title,
  metrics,
  onChange,
}: {
  title: string;
  metrics: ProductMetric[];
  onChange: (next: ProductMetric[]) => void;
}) {
  return (
    <StructuredListSection title={title} description="逐项维护指标名称、数值、单位和状态。" onAdd={() => onChange([...metrics, { ...EMPTY_METRIC }])}>
      {metrics.map((item, index) => (
        <EditableCard key={`${title}-${index}`} onDelete={() => onChange(metrics.filter((_, itemIndex) => itemIndex !== index))} disableDelete={metrics.length === 1} deleteLabel="删除指标">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">指标名称</label>
              <input className="form-input" value={item.label} onChange={(e) => {
                const next = [...metrics];
                next[index] = { ...next[index], label: e.target.value };
                onChange(next);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">指标值</label>
              <input className="form-input" value={item.value} onChange={(e) => {
                const next = [...metrics];
                next[index] = { ...next[index], value: e.target.value };
                onChange(next);
              }} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">单位</label>
              <input className="form-input" value={item.unit ?? ''} onChange={(e) => {
                const next = [...metrics];
                next[index] = { ...next[index], unit: e.target.value };
                onChange(next);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-select" value={item.status ?? 'planned'} onChange={(e) => {
                const next = [...metrics];
                next[index] = { ...next[index], status: e.target.value };
                onChange(next);
              }}>
                {Object.keys(MODULE_STATUS_LABELS).map((status) => (
                  <option key={status} value={status}>{labelOf(MODULE_STATUS_LABELS, status)}</option>
                ))}
              </select>
            </div>
          </div>
        </EditableCard>
      ))}
    </StructuredListSection>
  );
}

function ManagementSummaryStrip({
  items,
}: {
  items: Array<{ label: string; value: string | number; caption?: string }>;
}) {
  return (
    <div className="metric-grid product-metric-strip">
      {items.map((item) => (
        <div key={item.label} className="metric-card">
          <div className="metric-card-label">{item.label}</div>
          <div className="metric-card-value">{item.value}</div>
          {item.caption ? <div className="metric-card-caption">{item.caption}</div> : null}
        </div>
      ))}
    </div>
  );
}

function ManagementEmptyState({
  title,
  description,
  steps,
}: {
  title: string;
  description: string;
  steps: string[];
}) {
  return (
    <div className="management-empty">
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="management-empty-steps">
        {steps.map((step, index) => (
          <div key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManagementListItem({
  active,
  title,
  subtitle,
  status,
  statusLabel,
  meta,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button className={`management-list-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="management-list-index">{title.slice(0, 1)}</span>
      <span className="management-list-main">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span className="management-list-side">
        <StatusBadge status={status} label={statusLabel} showDot={false} />
        <small>{meta}</small>
      </span>
    </button>
  );
}

type StrategyKind = 'program' | 'portfolio';
type StrategyRecord = Program | Portfolio;

const GOAL_STATUS_LABELS: Record<string, string> = {
  draft: '草稿', active: '推进中', on_hold: '暂停', achieved: '已达成', closed: '已关闭',
};

function StrategicGoalForm({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: StrategicGoal | null;
  onClose: () => void;
  onSubmit: (input: StrategicGoalInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? getSessionUser()?.name ?? '');
  const [objective, setObjective] = useState(initial?.objective ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'draft');
  const [periodStart, setPeriodStart] = useState(initial?.periodStart ?? '');
  const [periodEnd, setPeriodEnd] = useState(initial?.periodEnd ?? '');
  const [metrics, setMetrics] = useState(initial?.successMetrics.join('\n') ?? '');
  const [programIds, setProgramIds] = useState(initial?.programIds ?? []);
  const [portfolioIds, setPortfolioIds] = useState(initial?.portfolioIds ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const programs = useAsync<Program[]>(fetchPrograms, []).data ?? [];
  const portfolios = useAsync<Portfolio[]>(fetchPortfolios, []).data ?? [];
  const toggle = (id: string, current: string[], setter: (next: string[]) => void) => setter(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  async function submit() {
    if (!name.trim() || !owner.trim() || !objective.trim()) {
      setError('请完整填写目标名称、负责人和目标说明。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), owner: owner.trim(), objective: objective.trim(), status, periodStart: periodStart || undefined, periodEnd: periodEnd || undefined, successMetrics: metrics.split('\n').map((item) => item.trim()).filter(Boolean), programIds, portfolioIds });
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : '保存公司目标失败。');
      setSubmitting(false);
    }
  }

  return <Overlay onClose={onClose}>
    <Panel title={initial ? '编辑公司目标' : '新建公司目标'} subtitle="公司目标用于战略对齐和项目组合治理，不用于个人绩效评价。">
      {error ? <div className="form-error" style={{ marginBottom: 8 }}>{error}</div> : null}
      <div className="form-row"><div className="form-group"><label className="form-label">目标名称</label><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></div><div className="form-group"><label className="form-label">负责人</label><input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} /></div></div>
      <div className="form-row"><div className="form-group"><label className="form-label">状态</label><select className="form-select" value={status} disabled={!initial} onChange={(event) => setStatus(event.target.value)}>{Object.entries(GOAL_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="form-group"><label className="form-label">周期</label><div className="form-row"><input className="form-input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /><input className="form-input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></div></div></div>
      <div className="form-group"><label className="form-label">目标说明</label><textarea className="form-textarea" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} /></div>
      <div className="form-group"><label className="form-label">成功标准（每行一项）</label><textarea className="form-textarea" rows={3} value={metrics} onChange={(event) => setMetrics(event.target.value)} /></div>
      <div className="form-group"><label className="form-label">关联项目集</label><div className="management-chip-list">{programs.map((item) => <label className="tag" key={item.id}><input type="checkbox" checked={programIds.includes(item.id)} onChange={() => toggle(item.id, programIds, setProgramIds)} /> {item.name}</label>) || <span className="text-secondary">暂无项目集。</span>}</div></div>
      <div className="form-group"><label className="form-label">关联产品组合</label><div className="management-chip-list">{portfolios.map((item) => <label className="tag" key={item.id}><input type="checkbox" checked={portfolioIds.includes(item.id)} onChange={() => toggle(item.id, portfolioIds, setPortfolioIds)} /> {item.name}</label>) || <span className="text-secondary">暂无产品组合。</span>}</div></div>
      <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}><button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button><button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>{submitting ? '保存中…' : '保存'}</button></div>
    </Panel>
  </Overlay>;
}

function StrategicGoalsTab() {
  const { data, loading, error, reload } = useAsync<StrategicGoal[]>(fetchStrategicGoals, []);
  const canManageGoals = canOperate(getSessionUser(), 'users:create');
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StrategicGoal | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const goals = data ?? [];
  async function remove(goal: StrategicGoal) {
    if (!await confirm({ title: `删除公司目标“${goal.name}”？`, description: '删除后不会删除关联的项目集或产品组合。', confirmText: '删除目标', tone: 'danger' })) return;
    setDeletingId(goal.id);
    try { await deleteStrategicGoal(goal.id); toast.success('公司目标已删除。'); reload(); } catch (reason) { toast.error(reason instanceof ApiError ? reason.message : '删除失败。'); } finally { setDeletingId(null); }
  }
  if (loading || error || !data) return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  return <>
    <Panel title="公司目标 / OKR" subtitle="将公司级目标与项目集、产品组合关联，形成战略到交付的可追溯链路。" toolbar={canManageGoals ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建公司目标</button> : undefined}>
      {goals.length ? <div className="management-list">{goals.map((goal) => <div className="management-list-item" key={goal.id}><span className="management-list-main"><strong>{goal.name}</strong><small>{goal.objective}</small><small>项目集 {goal.programIds.length} · 产品组合 {goal.portfolioIds.length} · 成功标准 {goal.successMetrics.length}</small></span><span className="management-list-side"><StatusBadge status={goal.status} label={GOAL_STATUS_LABELS[goal.status] ?? goal.status} showDot={false} />{canManageGoals ? <span className="flex gap-2"><button className="btn btn-text btn-sm" onClick={() => setEditing(goal)}>编辑</button><button className="btn btn-text btn-sm" disabled={deletingId === goal.id} onClick={() => remove(goal)}>删除</button></span> : null}</span></div>)}</div> : <PageState loading={false} error={null} isEmpty emptyTitle="暂无公司目标" emptyDescription="先建立目标，再关联需要共同推进的项目集或产品组合。" />}
    </Panel>
    {creating && canManageGoals ? <StrategicGoalForm onClose={() => setCreating(false)} onSubmit={async (input) => { await createStrategicGoal(input); toast.success('公司目标已创建。'); setCreating(false); reload(); }} /> : null}
    {editing && canManageGoals ? <StrategicGoalForm initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updateStrategicGoal(editing.id, input); toast.success('公司目标已更新。'); setEditing(null); reload(); }} /> : null}
  </>;
}

function strategyStatusOptions(kind: StrategyKind) {
  return kind === 'program'
    ? Object.keys(PROJECT_STATUS_LABELS)
    : Object.keys(ROADMAP_STATUS_LABELS);
}

function StrategyForm({
  kind,
  initial,
  onClose,
  onSubmit,
}: {
  kind: StrategyKind;
  initial?: StrategyRecord | null;
  onClose: () => void;
  onSubmit: (input: StrategyInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? getSessionUser()?.name ?? '');
  const [objective, setObjective] = useState(initial?.objective ?? '');
  const [status, setStatus] = useState(initial?.status ?? (kind === 'program' ? 'planning' : 'planned'));
  const [linkedIds, setLinkedIds] = useState<string[]>(kind === 'program'
    ? ((initial as Program | undefined)?.projectIds ?? [])
    : ((initial as Portfolio | undefined)?.productIds ?? []));
  const [risksText, setRisksText] = useState((initial as Program | undefined)?.risks?.join('\n') ?? '');
  const [roadmapText, setRoadmapText] = useState(((initial as Portfolio | undefined)?.roadmap ?? [])
    .map((item) => [item.title ?? '', item.version ?? '', item.quarter ?? '', item.status ?? 'planned'].join(' | ')).join('\n'));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const projectOptions = useAsync<Project[]>(fetchProjects, []);
  const productOptions = useAsync<Product[]>(fetchProducts, []);
  const links = kind === 'program' ? (projectOptions.data ?? []) : (productOptions.data ?? []);

  function toggleLink(id: string) {
    setLinkedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    if (!name.trim() || !owner.trim() || !objective.trim()) {
      setFormError('请完整填写名称、负责人和目标。');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const roadmap = roadmapText.split('\n').map((line) => line.split('|').map((item) => item.trim()))
        .filter((parts) => parts.some(Boolean))
        .map(([title, version, quarter, itemStatus]) => ({ title, version, quarter, status: itemStatus || 'planned' }));
      await onSubmit({
        name: name.trim(), owner: owner.trim(), objective: objective.trim(), status, risks: risksText.split('\n').map((item) => item.trim()).filter(Boolean),
        ...(kind === 'program' ? { projectIds: linkedIds } : { productIds: linkedIds, roadmap }),
      });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : '保存失败，请稍后重试。');
      setSubmitting(false);
    }
  }

  const linkLabel = kind === 'program' ? '关联项目' : '关联产品';
  const title = `${initial ? '编辑' : '新建'}${kind === 'program' ? '项目集' : '产品组合'}`;
  return (
    <Overlay onClose={onClose}>
      <Panel title={title} subtitle="目标用于对齐交付方向；项目集和产品组合只汇总项目/产品层数据，不用于个人绩效评价。">
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}
        <div className="form-row">
          <div className="form-group"><label className="form-label">名称</label><input className="form-input" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="form-group"><label className="form-label">负责人</label><input className="form-input" value={owner} onChange={(event) => setOwner(event.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">状态</label><select className="form-select" value={status} onChange={(event) => setStatus(event.target.value)}>{strategyStatusOptions(kind).map((item) => <option key={item} value={item}>{kind === 'program' ? labelOf(PROJECT_STATUS_LABELS, item) : labelOf(ROADMAP_STATUS_LABELS, item)}</option>)}</select></div>
        </div>
        <div className="form-group"><label className="form-label">目标</label><textarea className="form-textarea" rows={3} value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="描述要达成的业务或交付结果" /></div>
        <div className="form-group">
          <label className="form-label">{linkLabel}</label>
          <div className="management-chip-list" style={{ maxHeight: 180, overflow: 'auto' }}>
            {links.map((item) => <label key={item.id} className="tag" style={{ cursor: 'pointer' }}><input type="checkbox" checked={linkedIds.includes(item.id)} onChange={() => toggleLink(item.id)} style={{ marginRight: 5 }} />{item.name}</label>)}
            {!links.length ? <span className="text-secondary">暂无可关联对象。</span> : null}
          </div>
        </div>
        {kind === 'program' ? <div className="form-group"><label className="form-label">项目集风险提示（每行一项，可选）</label><textarea className="form-textarea" rows={3} value={risksText} onChange={(event) => setRisksText(event.target.value)} /></div> : null}
        {kind === 'portfolio' ? <div className="form-group"><label className="form-label">组合路线图（每行：标题 | 版本 | 季度 | 状态）</label><textarea className="form-textarea" rows={4} value={roadmapText} onChange={(event) => setRoadmapText(event.target.value)} placeholder="客户自助服务 | 2.0 | 2026 Q3 | development" /></div> : null}
        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={submitting}>{submitting ? '保存中…' : '保存'}</button>
        </div>
      </Panel>
    </Overlay>
  );
}

function ProgramsTab() {
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
    <div className="management-workbench">
      <Panel
        title="项目集工作台"
        subtitle="按交付目标聚合多个项目，集中查看跨项目进度、健康度、风险和项目清单。"
        toolbar={canManagePrograms ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建项目集</button> : undefined}
      >
        <ManagementSummaryStrip
          items={[
            { label: '项目集', value: programs.length },
            { label: '关联项目', value: totalProjects },
            { label: '平均进度', value: `${avgProgress}%` },
            { label: '平均健康度', value: avgHealth },
            { label: '风险提示', value: riskCount },
          ]}
        />
      </Panel>
      <div className="management-grid">
        <Panel className="management-list-pane" title="项目集清单" noPadding>
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
        </Panel>
        {selected ? (
          <Panel className="management-detail-pane">
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
            {canManagePrograms ? <div className="product-hero-actions"><button className="btn btn-secondary btn-sm" onClick={() => setEditing(selected)}>编辑项目集</button><button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected)} disabled={deletingId === selected.id}>{deletingId === selected.id ? '删除中…' : '删除项目集'}</button></div> : null}
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
          </Panel>
        ) : null}
      </div>
    </div>
    {creating && canManagePrograms ? <StrategyForm kind="program" onClose={() => setCreating(false)} onSubmit={async (input) => { await createProgram(input); toast.success('项目集已创建。'); setCreating(false); reload(); }} /> : null}
    {editing && canManagePrograms ? <StrategyForm kind="program" initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updateProgram(editing.id, input); toast.success('项目集已更新。'); setEditing(null); reload(); }} /> : null}
    </>
  );
}

function PortfoliosTab() {
  const { data, loading, error, reload } = useAsync<Portfolio[]>(fetchPortfolios, []);
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
    <div className="management-workbench">
      <Panel
        title="产品组合工作台"
        subtitle="把多个产品组织成业务组合，统一查看产品范围、组合状态和路线图节奏。"
        toolbar={canManagePortfolios ? <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>新建产品组合</button> : undefined}
      >
        <ManagementSummaryStrip
          items={[
            { label: '组合数', value: portfolios.length },
            { label: '组合内产品', value: totalProducts },
            { label: '推进中组合', value: activePortfolios },
            { label: '路线图事项', value: roadmapCount },
            { label: '平均产品数', value: portfolios.length ? Math.round(totalProducts / portfolios.length) : 0 },
          ]}
        />
      </Panel>
      <div className="management-grid">
        <Panel className="management-list-pane" title="组合清单" noPadding>
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
        </Panel>
        {selected ? (
          <Panel className="management-detail-pane">
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
            {canManagePortfolios ? <div className="product-hero-actions"><button className="btn btn-secondary btn-sm" onClick={() => setEditing(selected)}>编辑产品组合</button><button className="btn btn-danger btn-sm" onClick={() => handleDelete(selected)} disabled={deletingId === selected.id}>{deletingId === selected.id ? '删除中…' : '删除产品组合'}</button></div> : null}
          </Panel>
        ) : null}
      </div>
    </div>
    {creating && canManagePortfolios ? <StrategyForm kind="portfolio" onClose={() => setCreating(false)} onSubmit={async (input) => { await createPortfolio(input); toast.success('产品组合已创建。'); setCreating(false); reload(); }} /> : null}
    {editing && canManagePortfolios ? <StrategyForm kind="portfolio" initial={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updatePortfolio(editing.id, input); toast.success('产品组合已更新。'); setEditing(null); reload(); }} /> : null}
    </>
  );
}

export default ProductsPage;
