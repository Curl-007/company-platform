import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataTable, { type DataTableColumn } from './DataTable';
import TreeTable, { type TreeTableColumn } from './TreeTable';

interface Row {
  id: string;
  name: string;
}

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

describe('table accessibility', () => {
  it('uses a sort button, exposes sort direction, and activates rows by keyboard', async () => {
    const rows: Row[] = [{ id: '2', name: 'Beta' }, { id: '1', name: 'Alpha' }];
    const columns: DataTableColumn<Row>[] = [{
      key: 'name',
      title: '名称',
      sorter: (left, right) => left.name.localeCompare(right.name),
    }];
    const onRowClick = vi.fn();

    await act(async () => {
      root.render(createElement(DataTable<Row>, {
        columns,
        data: rows,
        rowKey: 'id',
        onRowClick,
      }));
    });

    const sortHeader = container.querySelector<HTMLTableCellElement>('th.sortable');
    const sortButton = sortHeader?.querySelector<HTMLButtonElement>('button');
    expect(sortButton?.textContent).toContain('名称');
    expect(sortHeader?.getAttribute('aria-sort')).toBe('none');

    await act(async () => sortButton?.click());
    expect(sortHeader?.getAttribute('aria-sort')).toBe('ascending');

    const renderedRows = container.querySelectorAll<HTMLTableRowElement>('tbody tr.clickable');
    expect(renderedRows[0].textContent).toContain('Alpha');
    await act(async () => {
      renderedRows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      renderedRows[1].dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onRowClick.mock.calls.map(([row]) => row.id)).toEqual(['1', '2']);
  });

  it('labels utility columns and exposes tree expansion state', async () => {
    const parent: Row = { id: 'P', name: 'Parent' };
    const child: Row = { id: 'C', name: 'Child' };
    const rows = [parent, child];
    const columns: TreeTableColumn<Row>[] = [{ key: 'name', title: '名称', indent: true }];
    const onRowClick = vi.fn();

    await act(async () => {
      root.render(createElement(TreeTable<Row>, {
        columns,
        data: rows,
        getChildren: (row) => row.id === parent.id ? [child] : [],
        getDepth: (row) => row.id === child.id ? 1 : 0,
        selectable: true,
        selectedIds: new Set<string>(),
        onSelectionChange: vi.fn(),
        rowActions: () => createElement('button', { type: 'button' }, '编辑'),
        onRowClick,
      }));
    });

    expect(container.querySelector('th[aria-label="选择"]')).not.toBeNull();
    expect(container.querySelector('th[aria-label="操作"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="选择 P"]')).not.toBeNull();

    const toggle = container.querySelector<HTMLButtonElement>('.tree-table-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.getAttribute('aria-label')).toBe('折叠 P');
    await act(async () => toggle?.click());

    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(onRowClick).not.toHaveBeenCalled();

    const row = container.querySelector<HTMLTableRowElement>('tbody tr.clickable');
    await act(async () => {
      row?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      row?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });
});
