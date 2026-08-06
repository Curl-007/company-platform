import { productImages, roadmapInProgress } from '../productModel';
import type { Product } from '../../../types';

type SignalTone = '' | 'is-success' | 'is-warn' | 'is-risk' | 'is-info';

interface ProductSignal {
  label: string;
  value: string | number;
  caption: string;
  tone: SignalTone;
}

// Compact KPI signal strip mirroring the reports / flow / doc workbench
// pattern (label / value / caption triad). Shares the .product-signal-strip
// visual defined once in reports-workbench.css.
export default function ProductSummaryStrip({ products }: { products: Product[] }) {
  const totalModules = products.reduce((sum, product) => sum + product.modules.length, 0);
  const activeProducts = products.filter((product) => !['released', 'maintenance'].includes(product.stage)).length;
  const roadmapCount = products.reduce((sum, product) => sum + roadmapInProgress(product).length, 0);
  const imageCount = products.reduce((sum, product) => sum + productImages(product).length, 0);

  const signals: ProductSignal[] = [
    { label: '产品总数', value: products.length, caption: '全部产品', tone: '' },
    { label: '在研/规划', value: activeProducts, caption: '未发布产品', tone: 'is-info' },
    { label: '能力模块', value: totalModules, caption: '已维护模块', tone: '' },
    { label: '路线图事项', value: roadmapCount, caption: '推进中规划', tone: roadmapCount > 0 ? 'is-success' : '' },
    { label: '产品图片', value: imageCount, caption: '资料图片', tone: '' },
  ];

  return (
    <section className="product-signal-strip" aria-label="产品概况">
      {signals.map((item) => (
        <div key={item.label} className={`product-signal ${item.tone}`.trim()}>
          <span className="product-signal-label">{item.label}</span>
          <strong>{item.value}</strong>
          <em>{item.caption}</em>
        </div>
      ))}
    </section>
  );
}
