import { Search } from 'lucide-react';
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
}: {
  keyword: string;
  onKeyword: (value: string) => void;
  kind: '' | DeliveryKind;
  onKind: (value: '' | DeliveryKind) => void;
  status: string;
  onStatus: (value: string) => void;
  statusChoices: string[];
}) {
  return (
    <div className="delivery-filter-bar">
      <div className="delivery-search">
        <Search size={16} />
        <input className="form-input" value={keyword} onChange={(event) => onKeyword(event.target.value)} placeholder="搜索版本、名称、需求、缺陷或构建号" />
      </div>
      <select className="form-select" value={kind} onChange={(event) => onKind(event.target.value as '' | DeliveryKind)}>
        <option value="">全部类型</option>
        <option value="build">构建</option>
        <option value="release">发布</option>
      </select>
      <select className="form-select" value={status} onChange={(event) => onStatus(event.target.value)}>
        <option value="">全部状态</option>
        {statusChoices.map((item) => <option key={item} value={item}>{labelOf({ ...BUILD_STATUS_LABELS, ...RELEASE_STATUS_LABELS }, item)}</option>)}
      </select>
    </div>
  );
}
