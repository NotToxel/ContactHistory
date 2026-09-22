import { SIDEBAR } from '../layout';
import { LAYOUT_STORAGE } from '../layout';
import { writeStoredValue, removeStoredValue } from '../../lib/storage';
import type { AppModel } from '../model.svelte';
// Sidebar Resizing Logic
export function startSidebarResize(
  this: Pick<AppModel, 'activeDragCleanup' | 'isResizingSidebar' | 'sidebarWidth'>,
  e: MouseEvent,
): void {
  this.activeDragCleanup?.();
  e.preventDefault();
  this.isResizingSidebar = true;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  const onMouseMove = (moveEvent: MouseEvent) => {
    const maxAllowed = Math.max(
      SIDEBAR.min,
      Math.min(SIDEBAR.max, Math.floor(window.innerWidth * SIDEBAR.viewportRatio)),
    );
    const newWidth = Math.min(maxAllowed, Math.max(SIDEBAR.min, moveEvent.clientX));
    this.sidebarWidth = newWidth;
  };
  const onMouseUp = () => {
    this.activeDragCleanup = undefined;
    this.isResizingSidebar = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    try {
      writeStoredValue(LAYOUT_STORAGE.sidebar, String(this.sidebarWidth));
    } catch (_) {}
  };
  this.activeDragCleanup = onMouseUp;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

export function resetSidebarWidth(this: Pick<AppModel, 'sidebarWidth'>): void {
  this.sidebarWidth = SIDEBAR.defaultWidth;
  try {
    removeStoredValue(LAYOUT_STORAGE.sidebar);
  } catch (_) {}
}

export function handleSidebarResizerKeyDown(
  this: Pick<AppModel, 'resetSidebarWidth' | 'sidebarWidth'>,
  e: KeyboardEvent,
): void {
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    this.sidebarWidth = Math.max(SIDEBAR.min, this.sidebarWidth - SIDEBAR.keyboardStep);
    try {
      writeStoredValue(LAYOUT_STORAGE.sidebar, String(this.sidebarWidth));
    } catch (_) {}
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    const maxAllowed = Math.max(
      SIDEBAR.min,
      Math.min(SIDEBAR.max, Math.floor(window.innerWidth * SIDEBAR.viewportRatio)),
    );
    this.sidebarWidth = Math.min(maxAllowed, this.sidebarWidth + SIDEBAR.keyboardStep);
    try {
      writeStoredValue(LAYOUT_STORAGE.sidebar, String(this.sidebarWidth));
    } catch (_) {}
  } else if (e.key === 'Enter' || e.key === 'Home') {
    e.preventDefault();
    this.resetSidebarWidth();
  }
}
