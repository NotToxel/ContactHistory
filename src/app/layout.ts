import type { ColumnKey, ColumnDef } from './types';
import { readStoredJson, readStoredValue, type StorageReader } from '../lib/storage';
export const ALL_COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name', defaultWidth: 260 },
  { key: 'job', label: 'Job title and company', defaultWidth: 220 },
  { key: 'email', label: 'Email', defaultWidth: 230 },
  { key: 'phone', label: 'Phone number', defaultWidth: 180 },
  { key: 'birthday', label: 'Birthday', defaultWidth: 160 },
  { key: 'labels', label: 'Labels', defaultWidth: 240 },
  { key: 'address', label: 'Address', defaultWidth: 220 },
  { key: 'notes', label: 'Notes', defaultWidth: 200 },
  { key: 'org', label: 'Organization', defaultWidth: 180 },
  { key: 'title', label: 'Job title', defaultWidth: 160 },
];

export const AVAILABLE_SELECT_COLUMNS = (
  ['job', 'email', 'phone', 'address', 'birthday', 'labels', 'notes'] satisfies ColumnKey[]
).map((key) => ALL_COLUMNS.find((column) => column.key === key)!);
export const DEFAULT_COLUMNS: ColumnKey[] = ['name', 'email', 'phone', 'birthday', 'labels'];
export const DEFAULT_COLUMN_WIDTHS = Object.fromEntries(
  ALL_COLUMNS.map((column) => [column.key, column.defaultWidth]),
) as Record<ColumnKey, number>;
export const MIN_COLUMN_WIDTH = 80;
export const SIDEBAR = {
  min: 220,
  max: 480,
  defaultWidth: 280,
  viewportRatio: 0.45,
  keyboardStep: 10,
} as const;
export const LAYOUT_STORAGE = {
  columns: 'contacts_active_cols',
  widths: 'contacts_col_widths',
  sortField: 'contacts_sort_field',
  sortDirection: 'contacts_sort_dir',
  sidebar: 'sidebar_width',
} as const;

export function readLayout(storage?: StorageReader) {
  const savedColumns = readStoredJson(LAYOUT_STORAGE.columns, storage);
  const validKeys = new Set(ALL_COLUMNS.map((column) => column.key));
  const activeColKeys: ColumnKey[] = ['name'];
  if (Array.isArray(savedColumns)) {
    for (const key of savedColumns) {
      if (validKeys.has(key) && !activeColKeys.includes(key)) activeColKeys.push(key);
    }
  }
  for (const key of DEFAULT_COLUMNS) {
    if (activeColKeys.length >= DEFAULT_COLUMNS.length) break;
    if (!activeColKeys.includes(key)) activeColKeys.push(key);
  }
  const colWidths = { ...DEFAULT_COLUMN_WIDTHS };
  const savedWidths = readStoredJson(LAYOUT_STORAGE.widths, storage);
  if (savedWidths && typeof savedWidths === 'object' && !Array.isArray(savedWidths)) {
    for (const column of ALL_COLUMNS) {
      const width = (savedWidths as Record<string, unknown>)[column.key];
      if (typeof width === 'number' && Number.isFinite(width) && width >= MIN_COLUMN_WIDTH)
        colWidths[column.key] = width;
    }
  }
  const field = readStoredValue(LAYOUT_STORAGE.sortField, storage);
  const direction = readStoredValue(LAYOUT_STORAGE.sortDirection, storage);
  const width = Number(readStoredValue(LAYOUT_STORAGE.sidebar, storage));
  return {
    activeColKeys,
    colWidths,
    nameSortField: field === 'last' ? ('last' as const) : ('first' as const),
    nameSortDirection: direction === 'desc' ? ('desc' as const) : ('asc' as const),
    sidebarWidth:
      Number.isFinite(width) && width >= SIDEBAR.min && width <= SIDEBAR.max
        ? width
        : SIDEBAR.defaultWidth,
  };
}
