import { describe, expect, it } from 'bun:test';
import {
  ALL_COLUMNS,
  DEFAULT_COLUMNS,
  DEFAULT_COLUMN_WIDTHS,
  LAYOUT_STORAGE,
  SIDEBAR,
  readLayout,
} from '../src/app/layout';
import type { StorageReader } from '../src/lib/storage';

const storage = (values: Record<string, string>): StorageReader => ({
  getItem: (key) => values[key] ?? null,
});

describe('persisted contact layout', () => {
  it('falls back safely when storage access is denied', () => {
    const layout = readLayout({
      getItem() {
        throw new Error('denied');
      },
    });
    expect(layout.activeColKeys).toEqual(DEFAULT_COLUMNS);
    expect(layout.colWidths).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(layout.sidebarWidth).toBe(SIDEBAR.defaultWidth);
  });

  it('deduplicates columns, rejects unknown values, and keeps name first', () => {
    const layout = readLayout(
      storage({
        [LAYOUT_STORAGE.columns]: JSON.stringify([
          'email',
          'name',
          'email',
          'unknown',
          null,
          'address',
        ]),
      }),
    );
    expect(layout.activeColKeys).toEqual(['name', 'email', 'address', 'phone', 'birthday']);
    expect(new Set(layout.activeColKeys).size).toBe(layout.activeColKeys.length);
  });

  it('does not let corrupt column data discard other valid preferences', () => {
    const layout = readLayout(
      storage({
        [LAYOUT_STORAGE.columns]: '{broken',
        [LAYOUT_STORAGE.sortField]: 'last',
        [LAYOUT_STORAGE.sortDirection]: 'desc',
        [LAYOUT_STORAGE.sidebar]: '350',
      }),
    );
    expect(layout.activeColKeys).toEqual(DEFAULT_COLUMNS);
    expect(layout.nameSortField).toBe('last');
    expect(layout.nameSortDirection).toBe('desc');
    expect(layout.sidebarWidth).toBe(350);
  });

  it('rejects invalid widths without discarding valid widths or accepting unknown keys', () => {
    const layout = readLayout(
      storage({
        [LAYOUT_STORAGE.widths]: JSON.stringify({
          name: -5,
          email: '300',
          phone: 310,
          birthday: null,
          unknown: 999,
        }),
        [LAYOUT_STORAGE.sidebar]: '350junk',
      }),
    );
    expect(layout.colWidths).toEqual({ ...DEFAULT_COLUMN_WIDTHS, phone: 310 });
    expect(Object.keys(layout.colWidths)).toHaveLength(ALL_COLUMNS.length);
    expect(layout.sidebarWidth).toBe(SIDEBAR.defaultWidth);
  });

  it('returns independent defaults for separate windows', () => {
    const first = readLayout(storage({}));
    first.colWidths.name = 999;
    first.activeColKeys.pop();
    const second = readLayout(storage({}));
    expect(second.colWidths).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(second.activeColKeys).toEqual(DEFAULT_COLUMNS);
  });
});
