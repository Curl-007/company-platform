import { useTranslation } from 'react-i18next';
import StructuredListSection from './StructuredListSection';
import EditableCard from './EditableCard';
import { EMPTY_METRIC } from '../productModel';
import { MODULE_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { ProductMetric } from '../../../types';

export default function MetricsSection({
  title,
  metrics,
  onChange,
}: {
  title: string;
  metrics: ProductMetric[];
  onChange: (next: ProductMetric[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <StructuredListSection title={title} description={t('features.products.metricsSection.sectionDesc')} onAdd={() => onChange([...metrics, { ...EMPTY_METRIC }])}>
      {metrics.map((item, index) => (
        <EditableCard key={`${title}-${index}`} onDelete={() => onChange(metrics.filter((_, itemIndex) => itemIndex !== index))} disableDelete={metrics.length === 1} deleteLabel={t('features.products.metricsSection.deleteMetric')}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('features.products.metricsSection.nameLabel')}</label>
              <input className="form-input" value={item.label} onChange={(e) => {
                const next = [...metrics];
                next[index] = { ...next[index], label: e.target.value };
                onChange(next);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.products.metricsSection.valueLabel')}</label>
              <input className="form-input" value={item.value} onChange={(e) => {
                const next = [...metrics];
                next[index] = { ...next[index], value: e.target.value };
                onChange(next);
              }} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('features.products.metricsSection.unitLabel')}</label>
              <input className="form-input" value={item.unit ?? ''} onChange={(e) => {
                const next = [...metrics];
                next[index] = { ...next[index], unit: e.target.value };
                onChange(next);
              }} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.products.metricsSection.statusLabel')}</label>
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
