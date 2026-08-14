import { useTranslation } from 'react-i18next';
import { ROADMAP_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { RoadmapItem } from '../../../types';
import { EMPTY_ROADMAP } from '../productModel';
import EditableCard from './EditableCard';
import StructuredListSection from './StructuredListSection';

interface ProductRoadmapSectionProps {
  roadmap: RoadmapItem[];
  onChange: (updater: (current: RoadmapItem[]) => RoadmapItem[]) => void;
}

export default function ProductRoadmapSection({ roadmap, onChange }: ProductRoadmapSectionProps) {
  const { t } = useTranslation();

  function updateRoadmap(index: number, updater: (current: RoadmapItem) => RoadmapItem) {
    onChange((current) => current.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)));
  }

  return (
    <StructuredListSection
      title={t('features.products.productForm.roadmapSectionTitle')}
      description={t('features.products.productForm.roadmapSectionDesc')}
      onAdd={() => onChange((current) => [...current, { ...EMPTY_ROADMAP }])}
    >
      {roadmap.map((item, index) => (
        <EditableCard
          key={`roadmap-${index}`}
          onDelete={() => onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          disableDelete={roadmap.length === 1}
          deleteLabel={t('features.products.productForm.deleteRoadmapItem')}
        >
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('features.products.productForm.roadmapTitleLabel')}</label>
              <input className="form-input" value={String(item.title ?? '')} onChange={(event) => updateRoadmap(index, (current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.products.productForm.roadmapVersionLabel')}</label>
              <input className="form-input" value={String(item.version ?? '')} onChange={(event) => updateRoadmap(index, (current) => ({ ...current, version: event.target.value }))} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('features.products.productForm.quarterLabel')}</label>
              <input className="form-input" value={String(item.quarter ?? '')} onChange={(event) => updateRoadmap(index, (current) => ({ ...current, quarter: event.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.products.productForm.statusLabel')}</label>
              <select className="form-select" value={String(item.status ?? 'planned')} onChange={(event) => updateRoadmap(index, (current) => ({ ...current, status: event.target.value }))}>
                {Object.keys(ROADMAP_STATUS_LABELS).map((status) => (
                  <option key={status} value={status}>{labelOf(ROADMAP_STATUS_LABELS, status)}</option>
                ))}
              </select>
            </div>
          </div>
        </EditableCard>
      ))}
    </StructuredListSection>
  );
}
