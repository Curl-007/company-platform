import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FilterBar from '../../../components/common/FilterBar';
import {
  BUILD_STATUS_LABELS,
  RELEASE_STATUS_LABELS,
  labelOf,
} from '../../../constants/enums';
import type { DeliveryKind } from '../deliveryPageModel';

export default function DeliveryFilters({
  keyword,
  onKeyword,
  kind,
  onKind,
  status,
  onStatus,
  statusChoices,
  hideKind = false,
}: {
  keyword: string;
  onKeyword: (value: string) => void;
  kind: '' | DeliveryKind;
  onKind: (value: '' | DeliveryKind) => void;
  status: string;
  onStatus: (value: string) => void;
  statusChoices: string[];
  hideKind?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="dl-filter-wrap">
      <FilterBar>
        <div className="input-with-icon filter-search dl-search">
          <Search size={14} className="shrink-0 text-secondary" aria-hidden="true" />
          <input
            className="form-input border-0 bg-transparent shadow-none"
            value={keyword}
            onChange={(event) => onKeyword(event.target.value)}
            placeholder={t('features.delivery.deliveryFilters.searchPlaceholder')}
            aria-label={t('features.delivery.deliveryFilters.searchAria')}
          />
        </div>
        {hideKind ? null : (
          <select
            className="form-select"
            value={kind}
            onChange={(event) => onKind(event.target.value as '' | DeliveryKind)}
            aria-label={t('features.delivery.deliveryFilters.kindAria')}
          >
            <option value="">{t('features.delivery.deliveryFilters.allKinds')}</option>
            <option value="build">{t('features.delivery.deliveryFilters.build')}</option>
            <option value="release">{t('features.delivery.deliveryFilters.release')}</option>
          </select>
        )}
        <select
          className="form-select"
          value={status}
          onChange={(event) => onStatus(event.target.value)}
          aria-label={t('features.delivery.deliveryFilters.statusAria')}
        >
          <option value="">{t('features.delivery.deliveryFilters.allStatus')}</option>
          {statusChoices.map((item) => (
            <option key={item} value={item}>
              {labelOf({ ...BUILD_STATUS_LABELS, ...RELEASE_STATUS_LABELS }, item)}
            </option>
          ))}
        </select>
      </FilterBar>
    </div>
  );
}
