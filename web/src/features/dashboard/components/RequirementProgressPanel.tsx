import { useEffect, useMemo, useState } from 'react';
import Panel from '../../../components/common/Panel';
import ProgressBar from '../../../components/common/ProgressBar';
import { Pagination } from '../../../components/common/Pagination';
import type { RequirementProgress } from '../../../types';

const PAGE_SIZE = 6;

export default function RequirementProgressPanel({ items }: { items: RequirementProgress[] }) {
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
      title="需求推进"
      subtitle={
        items.length === 0
          ? '跟踪进行中的需求完成情况'
          : `跟踪进行中的需求完成情况 · 共 ${items.length} 项`
      }
    >
      {items.length === 0 ? (
        <p className="body-text" style={{ margin: 0 }}>当前没有进行中的需求。</p>
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
                第 {rangeStart}–{rangeEnd} 条，共 {items.length} 条
              </span>
              <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
