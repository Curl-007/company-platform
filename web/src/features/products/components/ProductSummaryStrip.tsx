import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const totalModules = products.reduce((sum, product) => sum + product.modules.length, 0);
  const activeProducts = products.filter((product) => !['released', 'maintenance'].includes(product.stage)).length;
  const roadmapCount = products.reduce((sum, product) => sum + roadmapInProgress(product).length, 0);
  const imageCount = products.reduce((sum, product) => sum + productImages(product).length, 0);

  const signals: ProductSignal[] = [
    { label: t('features.products.productSummaryStrip.totalProducts'), value: products.length, caption: t('features.products.productSummaryStrip.allProducts'), tone: '' },
    { label: t('features.products.productSummaryStrip.activeProducts'), value: activeProducts, caption: t('features.products.productSummaryStrip.unreleasedProducts'), tone: 'is-info' },
    { label: t('features.products.productSummaryStrip.totalModules'), value: totalModules, caption: t('features.products.productSummaryStrip.maintainedModules'), tone: '' },
    { label: t('features.products.productSummaryStrip.roadmapCount'), value: roadmapCount, caption: t('features.products.productSummaryStrip.inProgressRoadmap'), tone: roadmapCount > 0 ? 'is-success' : '' },
    { label: t('features.products.productSummaryStrip.imageCount'), value: imageCount, caption: t('features.products.productSummaryStrip.assetImages'), tone: '' },
  ];

  return (
    <section className="product-signal-strip" aria-label={t('features.products.productSummaryStrip.ariaLabel')}>
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
