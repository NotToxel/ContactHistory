import { api } from '../lib/ipc';
import type { AppModel } from './model.svelte';

export function observeWindowState(app: Pick<AppModel, 'appWindow' | 'isMaximized'>): () => void {
  let disposed = false;
  let revision = 0;
  let unlisten: (() => void) | undefined;

  async function refresh(): Promise<void> {
    const currentRevision = ++revision;
    try {
      const maximized = await api.winIsMaximized().catch(() => app.appWindow.isMaximized());
      if (!disposed && currentRevision === revision) app.isMaximized = maximized;
    } catch {
      /* Window controls can be unavailable outside the desktop shell. */
    }
  }

  void app.appWindow.onResized(() => {
    void refresh();
  }).then((unsubscribe) => {
    if (disposed) unsubscribe();
    else {
      unlisten = unsubscribe;
      void refresh();
    }
  }).catch(() => {
    if (!disposed) void refresh();
  });

  return () => {
    disposed = true;
    unlisten?.();
  };
}
