import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
      setFormError(t('features.products.productForm.previewFailed'));
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
      setFormError(t('features.products.productForm.dropImageRequired'));
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
    if (!name.trim()) return setFormError(t('features.products.productForm.nameRequired'));
    if (!owner.trim()) return setFormError(t('features.products.productForm.ownerRequired'));
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
      setFormError(error instanceof ApiError ? error.message : t('features.products.productForm.saveFailed'));
      setSubmitting(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <Panel title={title} subtitle={t('features.products.productForm.formSubtitle')}>
        {formError ? <div className="form-error" style={{ marginBottom: 8 }}>{formError}</div> : null}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.products.productForm.nameLabel')}</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.products.productForm.ownerLabel')}</label>
            <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.products.productForm.versionLabel')}</label>
            <input className="form-input" value={version} onChange={(e) => setVersion(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.products.productForm.stageLabel')}</label>
            <select className="form-select" value={stage} onChange={(e) => setStage(e.target.value)}>
              {Object.keys(PRODUCT_STAGE_LABELS).map((item) => (
                <option key={item} value={item}>{labelOf(PRODUCT_STAGE_LABELS, item)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('features.products.productForm.imageLabel')}</label>
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
                    <ProductImage src={image.url} alt={t('features.products.productForm.savedImageAlt', { index: index + 1 })} />
                    <button type="button" className="btn btn-text btn-xs" onClick={() => removeSavedImage(image.id)}>
                      {t('common.delete')}
                    </button>
                  </div>
                ))}
                {pendingImages.map((image, index) => (
                  <div key={image.id} className="product-image-preview-item">
                    <img src={image.previewUrl} alt={t('features.products.productForm.pendingImageAlt', { index: savedImages.length + index + 1 })} />
                    <button type="button" className="btn btn-text btn-xs" onClick={() => removePendingImage(image.id)}>
                      {t('common.delete')}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <label className="product-image-empty product-image-dropzone" htmlFor="product-image-upload">
                <strong>{t('features.products.productForm.dropImageTitle')}</strong>
                <span>{t('features.products.productForm.dropImageHint')}</span>
              </label>
            )}
            <div className="product-image-controls">
              <div className="product-image-actions">
                <label className="btn btn-secondary btn-sm" htmlFor="product-image-upload">{t('features.products.productForm.uploadImage')}</label>
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
                <button type="button" className="btn btn-text btn-sm" onClick={clearImages} disabled={!imageCount}>{t('common.clear')}</button>
              </div>
              <span className="form-help-text">
                {t('features.products.productForm.imageHelp', { max: PRODUCT_IMAGE_MAX_COUNT, count: imageCount })}
              </span>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('features.products.productForm.descriptionLabel')}</label>
          <textarea className="form-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('features.products.productForm.systemNameLabel')}</label>
            <input className="form-input" value={systemName} onChange={(e) => setSystemName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.products.productForm.systemVersionLabel')}</label>
            <input className="form-input" value={systemVersion} onChange={(e) => setSystemVersion(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('features.products.productForm.applicationVersionLabel')}</label>
            <input className="form-input" value={applicationVersion} onChange={(e) => setApplicationVersion(e.target.value)} />
          </div>
        </div>

        <StructuredListSection title={t('features.products.productForm.modulesSectionTitle')} description={t('features.products.productForm.modulesSectionDesc')} onAdd={() => setModules((prev) => [...prev, { ...EMPTY_MODULE }])}>
          {modules.map((item, index) => (
            <EditableCard key={`module-${index}`} onDelete={() => setModules((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} disableDelete={modules.length === 1} deleteLabel={t('features.products.productForm.deleteModule')}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('features.products.productForm.moduleNameLabel')}</label>
                  <input className="form-input" value={String(item.name ?? '')} onChange={(e) => updateArrayItem(modules, index, (current) => ({ ...current, name: e.target.value }), setModules)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('features.products.productForm.ownerLabel')}</label>
                  <input className="form-input" value={String(item.owner ?? '')} onChange={(e) => updateArrayItem(modules, index, (current) => ({ ...current, owner: e.target.value }), setModules)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('features.products.productForm.statusLabel')}</label>
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

        <DetailSection title={t('features.products.productForm.hardwareInfo')} items={hardwareInfo} onChange={setHardwareInfo} />
        <DetailSection title={t('features.products.productForm.systemInfo')} items={systemInfo} onChange={setSystemInfo} />
        <DetailSection title={t('features.products.productForm.applicationInfo')} items={applicationInfo} onChange={setApplicationInfo} />

        <MetricsSection title={t('features.products.productForm.hardwareMetrics')} metrics={hardwareMetrics} onChange={setHardwareMetrics} />
        <MetricsSection title={t('features.products.productForm.systemMetrics')} metrics={systemMetrics} onChange={setSystemMetrics} />
        <MetricsSection title={t('features.products.productForm.appMetrics')} metrics={appMetrics} onChange={setAppMetrics} />

        <StructuredListSection title={t('features.products.productForm.roadmapSectionTitle')} description={t('features.products.productForm.roadmapSectionDesc')} onAdd={() => setRoadmap((prev) => [...prev, { ...EMPTY_ROADMAP }])}>
          {roadmap.map((item, index) => (
            <EditableCard key={`roadmap-${index}`} onDelete={() => setRoadmap((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} disableDelete={roadmap.length === 1} deleteLabel={t('features.products.productForm.deleteRoadmapItem')}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('features.products.productForm.roadmapTitleLabel')}</label>
                  <input className="form-input" value={String(item.title ?? '')} onChange={(e) => updateArrayItem(roadmap, index, (current) => ({ ...current, title: e.target.value }), setRoadmap)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('features.products.productForm.roadmapVersionLabel')}</label>
                  <input className="form-input" value={String(item.version ?? '')} onChange={(e) => updateArrayItem(roadmap, index, (current) => ({ ...current, version: e.target.value }), setRoadmap)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('features.products.productForm.quarterLabel')}</label>
                  <input className="form-input" value={String(item.quarter ?? '')} onChange={(e) => updateArrayItem(roadmap, index, (current) => ({ ...current, quarter: e.target.value }), setRoadmap)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('features.products.productForm.statusLabel')}</label>
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
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? t('features.products.productForm.saving') : t('common.save')}
          </button>
        </div>
      </Panel>
    </Overlay>
  );
}
