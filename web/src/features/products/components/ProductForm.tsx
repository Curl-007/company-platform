import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateProductInput, ProductImageChanges } from '../api';
import {
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
import DetailSection from './DetailSection';
import MetricsSection from './MetricsSection';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import ProductImagePicker, { type PendingProductImage } from './ProductImagePicker';
import ProductModuleSection from './ProductModuleSection';
import ProductRoadmapSection from './ProductRoadmapSection';
import {
  PRODUCT_STAGE_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { Product, ProductImage as ProductImageRecord, ProductMetric, ProductModule, RoadmapItem } from '../../../types';

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

        <ProductImagePicker
          dragActive={dragActive}
          imageCount={imageCount}
          pendingImages={pendingImages}
          savedImages={savedImages}
          onClear={clearImages}
          onDragActiveChange={setDragActive}
          onEmptyDrop={() => setFormError(t('features.products.productForm.dropImageRequired'))}
          onFiles={handleImageFiles}
          onRemovePending={removePendingImage}
          onRemoveSaved={removeSavedImage}
        />

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

        <ProductModuleSection modules={modules} onChange={setModules} />

        <DetailSection title={t('features.products.productForm.hardwareInfo')} items={hardwareInfo} onChange={setHardwareInfo} />
        <DetailSection title={t('features.products.productForm.systemInfo')} items={systemInfo} onChange={setSystemInfo} />
        <DetailSection title={t('features.products.productForm.applicationInfo')} items={applicationInfo} onChange={setApplicationInfo} />

        <MetricsSection title={t('features.products.productForm.hardwareMetrics')} metrics={hardwareMetrics} onChange={setHardwareMetrics} />
        <MetricsSection title={t('features.products.productForm.systemMetrics')} metrics={systemMetrics} onChange={setSystemMetrics} />
        <MetricsSection title={t('features.products.productForm.appMetrics')} metrics={appMetrics} onChange={setAppMetrics} />

        <ProductRoadmapSection roadmap={roadmap} onChange={setRoadmap} />

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
