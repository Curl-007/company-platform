import { Search } from 'lucide-react';
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
  return (
    <div className="dl-filter-wrap">
      <FilterBar>
        <div className="input-with-icon filter-search dl-search">
          <Search size={14} className="shrink-0 text-secondary" aria-hidden="true" />
          <input
            className="form-input border-0 bg-transparent shadow-none"
            value={keyword}
            onChange={(event) => onKeyword(event.target.value)}
            placeholder="搜索版本、名称、需求、缺陷或构建号"
            aria-label="搜索交付记录"
          />
        </div>
        {hideKind ? null : (
          <select
            className="form-select"
            value={kind}
            onChange={(event) => onKind(event.target.value as '' | DeliveryKind)}
            aria-label="交付类型"
          >
            <option value="">全部类型</option>
            <option value="build">构建</option>
            <option value="release">发布</option>
          </select>
        )}
        <select
          className="form-select"
          value={status}
          onChange={(event) => onStatus(event.target.value)}
          aria-label="交付状态"
        >
          <option value="">全部状态</option>
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
