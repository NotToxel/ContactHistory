import { MIN_COLUMN_WIDTH } from '../layout';
import { LAYOUT_STORAGE } from '../layout';
import { writeStoredValue, removeStoredValue } from '../../lib/storage';
import { DEFAULT_COLUMNS, DEFAULT_COLUMN_WIDTHS } from '../layout';
import type { AppModel } from '../model.svelte';
import type { ColumnKey } from '../types';
export function onResizeStart(
  this: Pick<AppModel, 'activeDragCleanup' | 'colWidths' | 'resizingCol' | 'startWidth' | 'startX'>,
  col: ColumnKey,
  e: MouseEvent,
): void {
  this.activeDragCleanup?.();
  e.preventDefault();
  e.stopPropagation();
  this.resizingCol = col;
  this.startX = e.clientX;
  this.startWidth = this.colWidths[col];
  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!this.resizingCol) return;
    const diff = moveEvent.clientX - this.startX;
    const newWidth = Math.max(MIN_COLUMN_WIDTH, this.startWidth + diff);
    this.colWidths[this.resizingCol] = newWidth;
  };
  const onMouseUp = () => {
    this.activeDragCleanup = undefined;
    this.resizingCol = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    try {
      writeStoredValue(LAYOUT_STORAGE.widths, JSON.stringify(this.colWidths));
    } catch (_) {}
  };
  this.activeDragCleanup = onMouseUp;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

export function getColumnLabel(this: Pick<AppModel, 'ALL_COLUMNS'>, key: ColumnKey): string {
  return this.ALL_COLUMNS.find((column) => column.key === key)?.label ?? key;
}

export function selectColumnForSlot(
  this: Pick<AppModel, 'activeColKeys' | 'openColDropdownSlot'>,
  slotIndex: number,
  newKey: ColumnKey,
): void {
  if (slotIndex < 1 || slotIndex >= this.activeColKeys.length) return;
  const existingIndex = this.activeColKeys.indexOf(newKey);
  const newCols = [...this.activeColKeys];
  if (existingIndex !== -1) {
    // Swap existing slot with this slot
    newCols[existingIndex] = newCols[slotIndex];
    newCols[slotIndex] = newKey;
  } else {
    newCols[slotIndex] = newKey;
  }
  this.activeColKeys = newCols;
  try {
    writeStoredValue(LAYOUT_STORAGE.columns, JSON.stringify(this.activeColKeys));
  } catch (_) {}
  this.openColDropdownSlot = null;
}

export function setSortField(this: Pick<AppModel, 'nameSortField'>, field: 'first' | 'last'): void {
  this.nameSortField = field;
  try {
    writeStoredValue(LAYOUT_STORAGE.sortField, field);
  } catch (_) {}
}

export function toggleSortDirection(this: Pick<AppModel, 'nameSortDirection'>): void {
  this.nameSortDirection = this.nameSortDirection === 'asc' ? 'desc' : 'asc';
  try {
    writeStoredValue(LAYOUT_STORAGE.sortDirection, this.nameSortDirection);
  } catch (_) {}
}

export function setSortDirection(
  this: Pick<AppModel, 'nameSortDirection'>,
  dir: 'asc' | 'desc',
): void {
  this.nameSortDirection = dir;
  try {
    writeStoredValue(LAYOUT_STORAGE.sortDirection, dir);
  } catch (_) {}
}

export function moveColumnSlot(
  this: Pick<AppModel, 'activeColKeys'>,
  fromIndex: number,
  direction: -1 | 1,
): void {
  const toIndex = fromIndex + direction;
  if (toIndex < 1 || toIndex >= this.activeColKeys.length) return;
  const newCols = [...this.activeColKeys];
  const temp = newCols[fromIndex];
  newCols[fromIndex] = newCols[toIndex];
  newCols[toIndex] = temp;
  this.activeColKeys = newCols;
  try {
    writeStoredValue(LAYOUT_STORAGE.columns, JSON.stringify(this.activeColKeys));
  } catch (_) {}
}

export function startPointerDrag(
  this: Pick<
    AppModel,
    | 'activeColKeys'
    | 'activeDragCleanup'
    | 'openColDropdownSlot'
    | 'pointerDragSlot'
    | 'pointerOverSlot'
  >,
  slotIndex: number,
  e: PointerEvent,
): void {
  this.activeDragCleanup?.();
  if (e.button !== 0) return;
  this.pointerDragSlot = slotIndex;
  this.pointerOverSlot = slotIndex;
  this.openColDropdownSlot = null;
  const currentTarget = e.currentTarget as HTMLElement;
  try {
    currentTarget.setPointerCapture(e.pointerId);
  } catch (_) {}
  const onMove = (ev: PointerEvent) => {
    if (this.pointerDragSlot === null) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const row = el?.closest('.col-order-slot-row');
    if (row) {
      const idx = row.getAttribute('data-slot-index');
      if (idx) {
        const num = parseInt(idx, 10);
        if (!isNaN(num) && num >= 1 && num < this.activeColKeys.length) {
          this.pointerOverSlot = num;
        }
      }
    }
  };
  const onUp = () => {
    this.activeDragCleanup = undefined;
    try {
      currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {}
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (
      this.pointerDragSlot !== null &&
      this.pointerOverSlot !== null &&
      this.pointerDragSlot !== this.pointerOverSlot
    ) {
      const newCols = [...this.activeColKeys];
      const [moved] = newCols.splice(this.pointerDragSlot, 1);
      newCols.splice(this.pointerOverSlot, 0, moved);
      this.activeColKeys = newCols;
      try {
        writeStoredValue(LAYOUT_STORAGE.columns, JSON.stringify(this.activeColKeys));
      } catch (_) {}
    }
    this.pointerDragSlot = null;
    this.pointerOverSlot = null;
  };
  this.activeDragCleanup = onUp;
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

export function handleColDragStart(
  this: Pick<AppModel, 'draggedColIndex' | 'openColDropdownSlot'>,
  slotIndex: number,
  e: DragEvent,
): void {
  this.draggedColIndex = slotIndex;
  this.openColDropdownSlot = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(slotIndex));
  }
}

export function handleColDragOver(
  this: Pick<AppModel, 'dragOverColIndex'>,
  slotIndex: number,
  e: DragEvent,
): void {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  if (this.dragOverColIndex !== slotIndex) {
    this.dragOverColIndex = slotIndex;
  }
}

export function handleColDrop(
  this: Pick<AppModel, 'activeColKeys' | 'dragOverColIndex' | 'draggedColIndex'>,
  slotIndex: number,
  e: DragEvent,
): void {
  e.preventDefault();
  if (
    this.draggedColIndex !== null &&
    this.draggedColIndex !== slotIndex &&
    slotIndex >= 1 &&
    this.draggedColIndex >= 1
  ) {
    const newCols = [...this.activeColKeys];
    const [moved] = newCols.splice(this.draggedColIndex, 1);
    newCols.splice(slotIndex, 0, moved);
    this.activeColKeys = newCols;
    try {
      writeStoredValue(LAYOUT_STORAGE.columns, JSON.stringify(this.activeColKeys));
    } catch (_) {}
  }
  this.draggedColIndex = null;
  this.dragOverColIndex = null;
}

export function handleColDragEnd(
  this: Pick<AppModel, 'dragOverColIndex' | 'draggedColIndex'>,
): void {
  this.draggedColIndex = null;
  this.dragOverColIndex = null;
}

export function toggleColumn(this: Pick<AppModel, 'activeColKeys'>, key: ColumnKey): void {
  if (key === 'name') return; // Name is always required
  if (this.activeColKeys.includes(key)) {
    this.activeColKeys = this.activeColKeys.filter((k) => k !== key);
  } else {
    this.activeColKeys = [...this.activeColKeys, key];
  }
  try {
    writeStoredValue(LAYOUT_STORAGE.columns, JSON.stringify(this.activeColKeys));
  } catch (_) {}
}

export function moveColumn(
  this: Pick<AppModel, 'activeColKeys'>,
  key: ColumnKey,
  direction: -1 | 1,
): void {
  const index = this.activeColKeys.indexOf(key);
  if (index === -1) return;
  const targetIndex = index + direction;
  // Name is always first (index 0)
  if (targetIndex < 1 || targetIndex >= this.activeColKeys.length) return;
  const newCols = [...this.activeColKeys];
  const temp = newCols[index];
  newCols[index] = newCols[targetIndex];
  newCols[targetIndex] = temp;
  this.activeColKeys = newCols;
  try {
    writeStoredValue(LAYOUT_STORAGE.columns, JSON.stringify(this.activeColKeys));
  } catch (_) {}
}

export function resetColumns(
  this: Pick<
    AppModel,
    | 'activeColKeys'
    | 'colWidths'
    | 'dragOverColIndex'
    | 'draggedColIndex'
    | 'openColDropdownSlot'
    | 'pointerDragSlot'
    | 'pointerOverSlot'
  >,
): void {
  this.activeColKeys = [...DEFAULT_COLUMNS];
  this.colWidths = { ...DEFAULT_COLUMN_WIDTHS };
  this.openColDropdownSlot = null;
  this.draggedColIndex = null;
  this.dragOverColIndex = null;
  this.pointerDragSlot = null;
  this.pointerOverSlot = null;
  try {
    removeStoredValue(LAYOUT_STORAGE.columns);
    removeStoredValue(LAYOUT_STORAGE.widths);
  } catch (_) {}
}
