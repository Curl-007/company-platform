import StructuredListSection from './StructuredListSection';
import { EMPTY_DETAIL, type DetailItem } from '../productModel';

export default function DetailSection({
  title,
  items,
  onChange,
}: {
  title: string;
  items: DetailItem[];
  onChange: (next: DetailItem[]) => void;
}) {
  return (
    <StructuredListSection title={title} description="用键值对方式维护结构化信息。" onAdd={() => onChange([...items, { ...EMPTY_DETAIL }])}>
      {items.map((item, index) => (
        <div key={`${title}-${index}`} className="form-row" style={{ marginBottom: 8 }}>
          <div className="form-group">
            <label className="form-label">字段名</label>
            <input className="form-input" value={item.key} onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], key: e.target.value };
              onChange(next);
            }} />
          </div>
          <div className="form-group">
            <label className="form-label">字段值</label>
            <input className="form-input" value={item.value} onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }} />
          </div>
          <div className="form-group" style={{ maxWidth: 120 }}>
            <label className="form-label">操作</label>
            <button className="btn btn-text btn-sm" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1}>删除</button>
          </div>
        </div>
      ))}
    </StructuredListSection>
  );
}
