import { useState } from 'react';
import { fetchProducts, fetchPrograms, fetchPortfolios } from '../services/resources';
import { useAsync } from '../hooks/useAsync';
import PageHeader from '../components/common/PageHeader';
import Panel from '../components/common/Panel';
import PageState from '../components/common/PageState';
import StatusBadge from '../components/common/StatusBadge';
import ProgressBar from '../components/common/ProgressBar';
import type { Product, Program, Portfolio } from '../types';

type Tab = 'products' | 'programs' | 'portfolios';

function ProductsPage() {
  const [tab, setTab] = useState<Tab>('products');

  return (
    <div>
      <PageHeader title="Products" description="Products, delivery programs, and portfolio roadmaps." />

      <div className="nav-tabs" style={{ marginBottom: 16 }}>
        {(['products', 'programs', 'portfolios'] as Tab[]).map((key) => (
          <button key={key} className={`nav-tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {key === 'products' ? 'Products' : key === 'programs' ? 'Programs' : 'Portfolios'}
          </button>
        ))}
      </div>

      {tab === 'products' && <ProductsTab />}
      {tab === 'programs' && <ProgramsTab />}
      {tab === 'portfolios' && <PortfoliosTab />}
    </div>
  );
}

function ProductsTab() {
  const { data, loading, error, reload } = useAsync<Product[]>(fetchProducts, []);
  if (loading || error || !data) return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  if (data.length === 0) return <PageState loading={false} error={null} isEmpty emptyTitle="No products" emptyDescription="No products have been defined yet." />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {data.map((product) => (
        <Panel key={product.id} title={product.name} subtitle={`${product.version} · ${product.owner}`}>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <StatusBadge label={product.stage} status={product.stage} />
            <span className="tag">{product.modules.length} modules</span>
          </div>
          {product.modules.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {product.modules.map((m, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="body-text">{m.name ?? `Module ${index + 1}`}</span>
                  {m.status && <StatusBadge label={String(m.status)} status={String(m.status)} showDot={false} />}
                </div>
              ))}
            </div>
          )}
          {product.roadmap.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 12 }}>Roadmap</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {product.roadmap.map((item, index) => (
                  <li key={index} className="body-text" style={{ marginBottom: 2 }}>
                    {item.title ?? item.version ?? JSON.stringify(item)}
                    {item.quarter ? ` · ${item.quarter}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      ))}
    </div>
  );
}

function ProgramsTab() {
  const { data, loading, error, reload } = useAsync<Program[]>(fetchPrograms, []);
  if (loading || error || !data) return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  if (data.length === 0) return <PageState loading={false} error={null} isEmpty emptyTitle="No programs" emptyDescription="No delivery programs have been defined yet." />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {data.map((program) => (
        <Panel key={program.id} title={program.name} subtitle={`Owner: ${program.owner}`}>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <StatusBadge label={program.status} status={program.status} />
            <span className="tag">{program.projectIds.length} projects</span>
          </div>
          <ProgressBar percent={program.progress ?? 0} label="Progress" height={6} />
          <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
            <span className="text-secondary">Health score</span>
            <span className="font-semibold text-mono">{program.healthScore}</span>
          </div>
          {program.risks.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 12 }}>Risks</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {program.risks.map((risk, index) => (
                  <li key={index} className="body-text" style={{ marginBottom: 2 }}>{risk}</li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      ))}
    </div>
  );
}

function PortfoliosTab() {
  const { data, loading, error, reload } = useAsync<Portfolio[]>(fetchPortfolios, []);
  if (loading || error || !data) return <PageState loading={loading} error={error} isEmpty={!loading && !error && !data} onRetry={reload} />;
  if (data.length === 0) return <PageState loading={false} error={null} isEmpty emptyTitle="No portfolios" emptyDescription="No portfolios have been defined yet." />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {data.map((portfolio) => (
        <Panel key={portfolio.id} title={portfolio.name} subtitle={`Owner: ${portfolio.owner}`}>
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            <StatusBadge label={portfolio.status} status={portfolio.status} />
            <span className="tag">{portfolio.productIds.length} products</span>
          </div>
          {portfolio.roadmap.length > 0 && (
            <>
              <div className="section-title">Roadmap</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {portfolio.roadmap.map((item, index) => (
                  <li key={index} className="body-text" style={{ marginBottom: 2 }}>
                    {item.title ?? item.version ?? JSON.stringify(item)}
                    {item.status ? ` · ${item.status}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      ))}
    </div>
  );
}

export default ProductsPage;
