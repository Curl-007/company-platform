import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ProductsTab from '../features/products/components/ProductsTab';
import ProgramsTab from '../features/products/components/ProgramsTab';
import PortfoliosTab from '../features/products/components/PortfoliosTab';
import PageFrame from '../components/common/PageFrame';

type Tab = 'products' | 'programs' | 'portfolios';

const PRODUCT_TABS: Array<{ key: Tab; labelKey: string }> = [
  { key: 'products', labelKey: 'features.products.productsPage.tabProducts' },
  { key: 'programs', labelKey: 'features.products.productsPage.tabPrograms' },
  { key: 'portfolios', labelKey: 'features.products.productsPage.tabPortfolios' },
];

function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  const tablist = event.currentTarget.closest('[role="tablist"]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : [];
  const currentIndex = tabs.indexOf(event.currentTarget);
  if (currentIndex < 0) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
}

function ProductsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('products');

  return (
    <PageFrame
      className="page-frame-products"
      contentClassName="products-page"
    >
      <div className="nav-tabs products-page-tabs" role="tablist" aria-label={t('features.products.productsPage.viewAria')}>
        {PRODUCT_TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            id={`products-page-tab-${key}`}
            type="button"
            role="tab"
            className={`nav-tab ${tab === key ? 'active' : ''}`}
            aria-selected={tab === key}
            aria-controls={`products-page-panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={handleTabKeyDown}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className="products-page-body">
        {PRODUCT_TABS.map(({ key }) => (
          <div
            key={key}
            id={`products-page-panel-${key}`}
            role="tabpanel"
            aria-labelledby={`products-page-tab-${key}`}
            hidden={tab !== key}
          >
            {tab === key && key === 'products' ? <ProductsTab /> : null}
            {tab === key && key === 'programs' ? <ProgramsTab /> : null}
            {tab === key && key === 'portfolios' ? <PortfoliosTab /> : null}
          </div>
        ))}
      </div>
    </PageFrame>
  );
}

export default ProductsPage;
