import { useTranslation } from 'react-i18next';
import { MODULE_STATUS_LABELS, labelOf } from '../../../constants/enums';
import type { ProductModule } from '../../../types';
import { EMPTY_MODULE } from '../productModel';
import EditableCard from './EditableCard';
import StructuredListSection from './StructuredListSection';

interface ProductModuleSectionProps {
  modules: ProductModule[];
  onChange: (updater: (current: ProductModule[]) => ProductModule[]) => void;
}

export default function ProductModuleSection({ modules, onChange }: ProductModuleSectionProps) {
  const { t } = useTranslation();

  function updateModule(index: number, updater: (current: ProductModule) => ProductModule) {
    onChange((current) => current.map((item, itemIndex) => (itemIndex === index ? updater(item) : item)));
  }

  return (
    <StructuredListSection
      title={t('features.products.productForm.modulesSectionTitle')}
      description={t('features.products.productForm.modulesSectionDesc')}
      onAdd={() => onChange((current) => [...current, { ...EMPTY_MODULE }])}
    >
      {modules.map((item, index) => (
        <EditableCard
          key={`module-${index}`}
          onDelete={() => onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          disableDelete={modules.length === 1}
          deleteLabel={t('features.products.productForm.deleteModule')}
        >
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('features.products.productForm.moduleNameLabel')}</label>
              <input className="form-input" value={String(item.name ?? '')} onChange={(event) => updateModule(index, (current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.products.productForm.ownerLabel')}</label>
              <input className="form-input" value={String(item.owner ?? '')} onChange={(event) => updateModule(index, (current) => ({ ...current, owner: event.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('features.products.productForm.statusLabel')}</label>
              <select className="form-select" value={String(item.status ?? 'planned')} onChange={(event) => updateModule(index, (current) => ({ ...current, status: event.target.value }))}>
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
