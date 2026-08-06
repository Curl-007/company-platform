import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DataTable, { type DataTableColumn } from './DataTable';

interface Row {
  id: string;
  name: string;
}

const columns: DataTableColumn<Row>[] = [{ key: 'name', title: '名称' }];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe('DataTable', () => {
  it('uses the shared Skeleton primitive for loading', async () => {
    await act(async () => {
      root.render(createElement(DataTable<Row>, {
        columns,
        data: [],
        rowKey: 'id',
        loading: true,
      }));
    });

    expect(container.querySelector('.data-table-wrapper')?.getAttribute('data-state')).toBe('loading');
    expect(container.querySelector('.data-table-loading[role="status"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="spinner"]')).not.toBeNull();
    expect(container.querySelector('.data-table-loading-text')?.textContent).toBe('加载中...');
  });

  it('uses the shared Empty primitive without changing the table selectors', async () => {
    await act(async () => {
      root.render(createElement(DataTable<Row>, {
        columns,
        data: [],
        rowKey: 'id',
        emptyText: '没有记录',
      }));
    });

    expect(container.querySelector('table.data-table[data-slot="table"]')).not.toBeNull();
    expect(container.querySelector('.data-table-empty[data-slot="empty"]')?.textContent).toBe('没有记录');
    expect(container.querySelector('.data-table-empty[role="status"]')).not.toBeNull();
  });

  it('pages long datasets when pageSize is set', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: String(index + 1),
      name: `项目 ${index + 1}`,
    }));

    await act(async () => {
      root.render(createElement(DataTable<Row>, {
        columns,
        data: rows,
        rowKey: 'id',
        pageSize: 5,
      }));
    });

    const bodyRows = container.querySelectorAll('tbody tr.data-table-row');
    expect(bodyRows.length).toBe(5);
    expect(container.querySelector('[data-slot="data-table-pagination"]')).not.toBeNull();
    expect(container.querySelector('.data-table-pagination-meta')?.textContent).toContain('共 12 条');
    expect(container.querySelector('[data-slot="pagination"]')).not.toBeNull();
  });
});
