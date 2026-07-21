import { useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import ProductsTab from '../features/products/components/ProductsTab';
import ProgramsTab from '../features/products/components/ProgramsTab';
import PortfoliosTab from '../features/products/components/PortfoliosTab';
import StrategicGoalsTab from '../features/products/components/StrategicGoalsTab';

type Tab = 'products' | 'programs' | 'portfolios';

function ProductsPage() {
  const [tab, setTab] = useState<Tab>('products');
  const [showGoals, setShowGoals] = useState(false);

  return (
    <div className="products-page">
      <PageHeader
        title="产品管理"
        description="统一管理产品、项目集与产品组合。"
        actions={(
          <button
            type="button"
            className={`btn btn-sm ${showGoals ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowGoals((open) => !open)}
          >
            {showGoals ? '返回产品工作台' : '公司目标 / OKR'}
          </button>
        )}
      />

      {showGoals ? (
        <div className="products-page-body products-goals-body">
          <StrategicGoalsTab />
        </div>
      ) : (
        <>
          <div className="nav-tabs products-page-tabs">
            <button className={`nav-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
              产品
            </button>
            <button className={`nav-tab ${tab === 'programs' ? 'active' : ''}`} onClick={() => setTab('programs')}>
              项目集
            </button>
            <button className={`nav-tab ${tab === 'portfolios' ? 'active' : ''}`} onClick={() => setTab('portfolios')}>
              组合
            </button>
          </div>

          <div className="products-page-body">
            {tab === 'products' ? <ProductsTab /> : null}
            {tab === 'programs' ? <ProgramsTab /> : null}
            {tab === 'portfolios' ? <PortfoliosTab /> : null}
          </div>
        </>
      )}
    </div>
  );
}

export default ProductsPage;
