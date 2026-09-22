import { api } from '../../lib/ipc';
import type { AppModel } from '../model.svelte';
// Window Controls
export async function winMinimize(this: Pick<AppModel, 'appWindow'>): Promise<void> {
  try {
    await api.winMinimize();
  } catch (_) {
    await this.appWindow.minimize();
  }
}

export async function winToggleMaximize(
  this: Pick<AppModel, 'appWindow' | 'isMaximized'>,
): Promise<void> {
  try {
    this.isMaximized = await api.winToggleMaximize();
  } catch (_) {
    await this.appWindow.toggleMaximize();
    this.isMaximized = await this.appWindow.isMaximized();
  }
}

export async function winClose(this: Pick<AppModel, 'appWindow'>): Promise<void> {
  try {
    await api.winClose();
  } catch (_) {
    await this.appWindow.close();
  }
}

export async function onTopbarMouseDown(
  this: Pick<AppModel, 'appWindow' | 'winToggleMaximize'>,
  e: MouseEvent,
): Promise<void> {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest('button, input, a, select, textarea, [data-no-drag]')) return;
  if (e.detail === 2) {
    await this.winToggleMaximize();
  } else {
    try {
      await this.appWindow.startDragging();
    } catch (_) {}
  }
}
