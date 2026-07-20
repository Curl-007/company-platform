import { useState } from 'react';
import type { CreateProductInput } from '../api';
import {
  EMPTY_MODULE,
  EMPTY_ROADMAP,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_COUNT,
  PRODUCT_IMAGE_TYPES,
  productImages,
  sanitizeDetailItems,
  sanitizeMetrics,
  sanitizeModules,
  sanitizeRoadmap,
  toDetailItems,
  toMetrics,
  toModules,
  toRoadmap,
  type DetailItem,
} from '../productModel';
import StructuredListSection from './StructuredListSection';
import EditableCard from './EditableCard';
import DetailSection from './DetailSection';
import MetricsSection from './MetricsSection';
import Overlay from '../../../components/common/Overlay';
import Panel from '../../../components/common/Panel';
import { ApiError } from '../../../services/api';
import {
  MODULE_STATUS_LABELS,
  PRODUCT_STAGE_LABELS,
  ROADMAP_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { Product, ProductMetric, ProductModule, RoadmapItem } from '../../../types';

export default function ProductForm({
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
