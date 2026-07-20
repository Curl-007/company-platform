import { useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import ProductsTab from '../features/products/components/ProductsTab';
import ProgramsTab from '../features/products/components/ProgramsTab';
import PortfoliosTab from '../features/products/components/PortfoliosTab';
import StrategicGoalsTab from '../features/products/components/StrategicGoalsTab';

type Tab = 'products' | 'programs' | 'portfolios' | 'goals';

function ProductsPage() {
  const [tab, setTab] = useState<Tab>('products');

  return (
    <div>
      <PageHeader
        title="产品管理"
        description="围绕硬件产品、系统版本、应用能力、项目集和组合视角进行统一管理。"
      />

      <div className="nav-tabs" style={{ marginBottom: 16 }}>
        <button className={`nav-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
          产品
        </button>
        <button className={`nav-tab ${tab === 'programs' ? 'active' : ''}`} onClick={() => setTab('programs')}>
          项目集
        </button>
        <button className={`nav-tab ${tab === 'portfolios' ? 'active' : ''}`} onClick={() => setTab('portfolios')}>
          组合
        </button>
        <button className={`nav-tab ${tab === 'goals' ? 'active' : ''}`} onClick={() => setTab('goals')}>
          公司目标
        </button>
      </div>

      {tab === 'products' ? <ProductsTab /> : null}
      {tab === 'programs' ? <ProgramsTab /> : null}
      {tab === 'portfolios' ? <PortfoliosTab /> : null}
      {tab === 'goals' ? <StrategicGoalsTab /> : null}
    </div>
  );
}

export default ProductsPage;
