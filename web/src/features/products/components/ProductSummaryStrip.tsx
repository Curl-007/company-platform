import MetricStrip from '../../../components/common/MetricStrip';
import { productImages, roadmapInProgress } from '../productModel';
import type { Product } from '../../../types';

export default function ProductSummaryStrip({ products }: { products: Product[] }) {
  const totalModules = products.reduce((sum, product) => sum + product.modules.length, 0);
  const activeProducts = products.filter((product) => !['released', 'maintenance'].includes(product.stage)).length;
  const roadmapCount = products.reduce((sum, product) => sum + roadmapInProgress(product).length, 0);
  const imageCount = products.reduce((sum, product) => sum + productImages(product).length, 0);

  return (
    <MetricStrip
      className="product-metric-strip"
      items={[
        { label: '产品总数', value: products.length },
        { label: '在研/规划', value: activeProducts },
        { label: '能力模块', value: totalModules },
        { label: '路线图事项', value: roadmapCount },
        { label: '产品图片', value: imageCount },
      ]}
    />
  );
}
