import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import type { CreateProductInput, ProductImageChanges } from '../api';
import {
  EMPTY_MODULE,
  EMPTY_ROADMAP,
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_COUNT,
  productImages,
  sanitizeDetailItems,
  sanitizeMetrics,
  sanitizeModules,
  sanitizeRoadmap,
  toDetailItems,
  toMetrics,
  toModules,
  toRoadmap,
  validateProductImageFiles,
  type DetailItem,
} from '../productModel';
import StructuredListSection from './StructuredListSection';
import EditableCard from './EditableCard';
import DetailSection from './DetailSection';
import MetricsSection from './MetricsSection';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import ProductImage from './ProductImage';
import {
  MODULE_STATUS_LABELS,
  PRODUCT_STAGE_LABELS,
  ROADMAP_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { Product, ProductImage as ProductImageRecord, ProductMetric, ProductModule, RoadmapItem } from '../../../types';

interface PendingProductImage {
  id: string;
  file: File;
  previewUrl: string;
}

export interface ProductFormSubmission {
  product: CreateProductInput;
  imageChanges: ProductImageChanges;
}

export default function ProductForm({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  initial?: Product | null;
  onClose: () => void;
  onSubmit: (submission: ProductFormSubmission) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [owner, setOwner] = useState(initial?.owner ?? '');
  const [version, setVersion] = useState(initial?.version ?? '1.0.0');
  const [stage, setStage] = useState(initial?.stage ?? 'design');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [savedImages, setSavedImages] = useState<ProductImageRecord[]>(() => productImages(initial));
  const [pendingImages, setPendingImages] = useState<PendingProductImage[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const previewUrls = useRef(new Set<string>());
  const pendingSequence = useRef(0);
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
  const [dragActive, setDragActive] = useState(false);
  const imageCount = savedImages.length + pendingImages.length;

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  function handleImageFiles(files?: FileList | File[] | null) {
    const selected = Array.isArray(files) ? files : Array.from(files ?? []);
    if (!selected.length) return;
    const validationError = validateProductImageFiles(selected, imageCount);
    if (validationError) return setFormError(validationError);

    const additions: PendingProductImage[] = [];
    try {
      for (const file of selected) {
        const previewUrl = URL.createObjectURL(file);
        previewUrls.current.add(previewUrl);
        pendingSequence.current += 1;
        additions.push({ id: `pending-${pendingSequence.current}`, file, previewUrl });
      }
      setPendingImages((current) => [...current, ...additions]);
      setFormError(null);
    } catch {
      additions.forEach((image) => {
        previewUrls.current.delete(image.previewUrl);
        URL.revokeObjectURL(image.previewUrl);
      });
      setFormError('无法创建图片预览，请重试。');
    }
  }

  function removeSavedImage(imageId: string) {
    setSavedImages((current) => current.filter((image) => image.id !== imageId));
    setDeletedImageIds((current) => current.includes(imageId) ? current : [...current, imageId]);
  }

  function removePendingImage(imageId: string) {
    const removed = pendingImages.find((image) => image.id === imageId);
    if (removed) {
      previewUrls.current.delete(removed.previewUrl);
      URL.revokeObjectURL(removed.previewUrl);
    }
    setPendingImages((current) => current.filter((image) => image.id !== imageId));
  }

  function clearImages() {
    setDeletedImageIds((current) => [
      ...current,
      ...savedImages.map((image) => image.id).filter((id) => !current.includes(id)),
    ]);
    setSavedImages([]);
    pendingImages.forEach((image) => {
      previewUrls.current.delete(image.previewUrl);
      URL.revokeObjectURL(image.previewUrl);
    });
    setPendingImages([]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (!dropped.length) {
      setFormError('请拖入图片文件。');
      return;
    }
    handleImageFiles(dropped);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!imageFiles.length) return;
    event.preventDefault();
    handleImageFiles(imageFiles);
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
        product: {
          name: name.trim(),
          owner: owner.trim(),
          version: version.trim() || '1.0.0',
          stage,
          description: description.trim(),
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
        },
        imageChanges: {
          files: pendingImages.map((image) => image.file),
          deleteIds: deletedImageIds,
        },
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
          <div
            className={`product-image-picker ${dragActive ? 'is-dragover' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
              setDragActive(false);
            }}
            onDrop={handleDrop}
            onPaste={handlePaste}
            tabIndex={0}
          >
            {imageCount ? (
              <div className="product-image-preview-grid">
                {savedImages.map((image, index) => (
                  <div key={image.id} className="product-image-preview-item">
                    <ProductImage src={image.url} alt={`产品图片 ${index + 1}`} />
                    <button type="button" className="btn btn-text btn-xs" onClick={() => removeSavedImage(image.id)}>
                      删除
                    </button>
                  </div>
                ))}
                {pendingImages.map((image, index) => (
                  <div key={image.id} className="product-image-preview-item">
                    <img src={image.previewUrl} alt={`待上传产品图片 ${savedImages.length + index + 1}`} />
                    <button type="button" className="btn btn-text btn-xs" onClick={() => removePendingImage(image.id)}>
                      删除
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <label className="product-image-empty product-image-dropzone" htmlFor="product-image-upload">
                <strong>拖拽图片到这里</strong>
                <span>或点击上传 / 粘贴截图</span>
              </label>
            )}
            <div className="product-image-controls">
              <div className="product-image-actions">
                <label className="btn btn-secondary btn-sm" htmlFor="product-image-upload">上传图片</label>
                <input
                  id="product-image-upload"
                  type="file"
                  multiple
                  accept={PRODUCT_IMAGE_ACCEPT}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    handleImageFiles(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
                <button type="button" className="btn btn-text btn-sm" onClick={clearImages} disabled={!imageCount}>清空</button>
              </div>
              <span className="form-help-text">
                支持拖拽、点击上传或粘贴截图；PNG/JPG/WEBP/GIF，单张 5 MiB，最多 {PRODUCT_IMAGE_MAX_COUNT} 张；当前 {imageCount} 张。
              </span>
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
