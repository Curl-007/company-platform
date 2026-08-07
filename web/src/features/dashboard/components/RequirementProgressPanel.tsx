import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import { Pagination } from '../../../components/common/Pagination';
import type { RequirementProgress } from '../../../types';

const PAGE_SIZE = 6;

export default function RequirementProgressPanel({ items }: { items: RequirementProgress[] }) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => {
    setPage((current) => Math.min(Math.max(current, 1), pageCount));
  }, [pageCount, items.length]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, page]);

  const showPagination = items.length > PAGE_SIZE;
  const rangeStart = items.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, items.length);

  return (
    <Panel
      title={t('features.dashboard.requirementProgressPanel.title')}
      subtitle={
        items.length === 0
          ? t('features.dashboard.requirementProgressPanel.subtitle')
          : t('features.dashboard.requirementProgressPanel.subtitleCount', { count: items.length })
      }
    >
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>{t('features.dashboard.requirementProgressPanel.empty')}</p>
      ) : (
        <>
          <div className="requirement-progress-list" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pagedItems.map((item) => (
              <div key={item.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="font-medium" style={{ minWidth: 0 }}>{item.title}</span>
                  <span className="text-secondary text-mono">{item.completion}%</span>
                </div>
                <div className="text-secondary" style={{ fontSize: 12, marginBottom: 4 }}>{item.projectName}</div>
                <ProgressBar percent={item.completion} showPercent={false} height={6} />
              </div>
            ))}
          </div>
          {showPagination ? (
            <div className="list-pagination mt-4" data-slot="list-pagination">
              <span className="list-pagination-meta text-secondary">
                {t('features.dashboard.requirementProgressPanel.rangeInfo', { start: rangeStart, end: rangeEnd, count: items.length })}
              </span>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
