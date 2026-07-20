import { productImages, roadmapInProgress } from '../productModel';
import type { Product } from '../../../types';

export default function ProductSummaryStrip({ products }: { products: Product[] }) {
  const totalModules = products.reduce((sum, product) => sum + product.modules.length, 0);
  const activeProducts = products.filter((product) => !['released', 'maintenance'].includes(product.stage)).length;
  const roadmapCount = products.reduce((sum, product) => sum + roadmapInProgress(product).length, 0);
  const imageCount = products.reduce((sum, product) => sum + productImages(product).length, 0);

  return (
    <div className="metric-grid product-metric-strip">
      <div className="metric-card">
        <div className="metric-card-label">产品总数</div>
        <div className="metric-card-value">{products.length}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">在研/规划</div>
        <div className="metric-card-value">{activeProducts}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">能力模块</div>
        <div className="metric-card-value">{totalModules}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">路线图事项</div>
        <div className="metric-card-value">{roadmapCount}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card-label">产品图片</div>
        <div className="metric-card-value">{imageCount}</div>
      </div>
    </div>
  );
}
